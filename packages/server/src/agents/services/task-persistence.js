import crypto from 'node:crypto';
import { getDb } from './db.js';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNullableBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value ? true : false;
}

function mapCandidateRow(candidateRow) {
  return {
    candidateId: candidateRow.id,
    taskId: candidateRow.task_id,
    name: candidateRow.name,
    status: candidateRow.status,
    matched: toNullableBoolean(candidateRow.matched),
    reason: candidateRow.reason,
    rejectionMessage: candidateRow.rejection_message,
    resumeSummary: candidateRow.resume_summary,
    resume: parseJson(candidateRow.resume_json, null),
    resumeSegments: parseJson(candidateRow.resume_segments_json, []),
    noteFile: parseJson(candidateRow.note_file_json, null),
    error: candidateRow.error,
    stepCount: candidateRow.step_count,
    toolCallCount: candidateRow.tool_call_count,
    toolResultCount: candidateRow.tool_result_count,
    toolTimeline: parseJson(candidateRow.tool_timeline_json, []),
    steps: parseJson(candidateRow.steps_json, []),
    startedAt: candidateRow.started_at,
    finishedAt: candidateRow.finished_at,
    updatedAt: candidateRow.updated_at,
  };
}

function mapTaskRow(taskRow, candidateRows = []) {
  if (!taskRow) {
    return null;
  }

  return {
    taskId: taskRow.id,
    type: taskRow.type,
    status: taskRow.status,
    targetProfile: taskRow.target_profile,
    rejectionMessage: taskRow.rejection_message,
    jobTitle: taskRow.job_title,
    jobProfileId: taskRow.job_profile_id,
    unreadCandidateCount: taskRow.unread_candidate_count,
    processedCount: taskRow.processed_count,
    matchedCount: taskRow.matched_count,
    rejectedCount: taskRow.rejected_count,
    failedCount: taskRow.failed_count,
    currentCandidateId: taskRow.current_candidate_id,
    currentCandidateName: taskRow.current_candidate_name,
    summary: taskRow.summary,
    error: taskRow.error,
    startedAt: taskRow.started_at,
    finishedAt: taskRow.finished_at,
    updatedAt: taskRow.updated_at,
    candidates: candidateRows.map(mapCandidateRow),
  };
}

function readCandidateRows(taskId) {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM screening_candidates
      WHERE task_id = ?
      ORDER BY updated_at ASC, id ASC
    `)
    .all(taskId);
}

function recalculateTask(task) {
  const nextTask = cloneJson(task);
  const processedStatuses = new Set(['completed', 'rejected', 'failed']);
  nextTask.unreadCandidateCount = Array.isArray(nextTask.candidates)
    ? nextTask.candidates.length
    : 0;
  nextTask.processedCount = nextTask.candidates.filter(candidate =>
    processedStatuses.has(candidate.status),
  ).length;
  nextTask.matchedCount = nextTask.candidates.filter(candidate => candidate.matched === true).length;
  nextTask.rejectedCount = nextTask.candidates.filter(candidate => candidate.status === 'rejected').length;
  nextTask.failedCount = nextTask.candidates.filter(candidate => candidate.status === 'failed').length;
  const runningCandidate = nextTask.candidates.find(candidate => candidate.status === 'running');
  nextTask.currentCandidateId = runningCandidate?.candidateId || null;
  nextTask.currentCandidateName = runningCandidate?.name || null;
  nextTask.updatedAt = new Date().toISOString();
  return nextTask;
}

export function createScreeningTask({
  targetProfile,
  rejectionMessage,
  unreadCandidates = [],
  taskId, // 接受外部传入的 taskId
  jobProfileId = null, // 关联的 JD ID
  jobTitle = '', // 岗位名称
}) {
  const now = new Date().toISOString();
  // 如果没有提供 taskId，则生成一个新的
  const finalTaskId = taskId || `screening-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  return {
    taskId: finalTaskId,
    type: 'unread-screening',
    status: 'queued',
    targetProfile,
    rejectionMessage,
    jobProfileId,
    jobTitle,
    unreadCandidateCount: unreadCandidates.length,
    processedCount: 0,
    matchedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    currentCandidateId: null,
    currentCandidateName: null,
    summary: '',
    error: null,
    startedAt: now,
    finishedAt: null,
    updatedAt: now,
    candidates: unreadCandidates.map((name, index) => ({
      candidateId: `${finalTaskId}-candidate-${index + 1}`,
      taskId: finalTaskId,
      name,
      status: 'queued',
      matched: null,
      reason: '',
      rejectionMessage: '',
      resumeSummary: '',
      resume: null,
      resumeSegments: [],
      noteFile: null,
      error: null,
      stepCount: 0,
      toolCallCount: 0,
      toolResultCount: 0,
      toolTimeline: [],
      steps: [],
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    })),
  };
}

export async function persistScreeningTask(task) {
  const db = getDb();
  const nextTask = {
    ...cloneJson(task),
    updatedAt: new Date().toISOString(),
  };

  const writeTask = db.prepare(`
    INSERT INTO screening_tasks (
      id, type, status, target_profile, rejection_message, job_profile_id, job_title,
      unread_candidate_count, processed_count, matched_count, rejected_count, failed_count,
      current_candidate_id, current_candidate_name, summary, error, started_at, finished_at, updated_at
    ) VALUES (
      @id, @type, @status, @target_profile, @rejection_message, @job_profile_id, @job_title,
      @unread_candidate_count, @processed_count, @matched_count, @rejected_count, @failed_count,
      @current_candidate_id, @current_candidate_name, @summary, @error, @started_at, @finished_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      status = excluded.status,
      target_profile = excluded.target_profile,
      rejection_message = excluded.rejection_message,
      job_profile_id = excluded.job_profile_id,
      job_title = excluded.job_title,
      unread_candidate_count = excluded.unread_candidate_count,
      processed_count = excluded.processed_count,
      matched_count = excluded.matched_count,
      rejected_count = excluded.rejected_count,
      failed_count = excluded.failed_count,
      current_candidate_id = excluded.current_candidate_id,
      current_candidate_name = excluded.current_candidate_name,
      summary = excluded.summary,
      error = excluded.error,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      updated_at = excluded.updated_at
  `);

  const writeCandidate = db.prepare(`
    INSERT INTO screening_candidates (
      id, task_id, name, status, matched, reason, rejection_message,
      resume_summary, resume_json, resume_segments_json, note_file_json, error,
      step_count, tool_call_count, tool_result_count,
      logs_json, tool_timeline_json, steps_json,
      started_at, finished_at, updated_at
    ) VALUES (
      @id, @task_id, @name, @status, @matched, @reason, @rejection_message,
      @resume_summary, @resume_json, @resume_segments_json, @note_file_json, @error,
      @step_count, @tool_call_count, @tool_result_count,
      @logs_json, @tool_timeline_json, @steps_json,
      @started_at, @finished_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      task_id = excluded.task_id,
      name = excluded.name,
      status = excluded.status,
      matched = excluded.matched,
      reason = excluded.reason,
      rejection_message = excluded.rejection_message,
      resume_summary = excluded.resume_summary,
      resume_json = excluded.resume_json,
      resume_segments_json = excluded.resume_segments_json,
      note_file_json = excluded.note_file_json,
      error = excluded.error,
      step_count = excluded.step_count,
      tool_call_count = excluded.tool_call_count,
      tool_result_count = excluded.tool_result_count,
      logs_json = excluded.logs_json,
      tool_timeline_json = excluded.tool_timeline_json,
      steps_json = excluded.steps_json,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN');
  try {
    writeTask.run({
      id: nextTask.taskId,
      type: nextTask.type,
      status: nextTask.status,
      target_profile: nextTask.targetProfile,
      rejection_message: nextTask.rejectionMessage,
      job_profile_id: nextTask.jobProfileId || null,
      job_title: nextTask.jobTitle || '',
      unread_candidate_count: nextTask.unreadCandidateCount || 0,
      processed_count: nextTask.processedCount || 0,
      matched_count: nextTask.matchedCount || 0,
      rejected_count: nextTask.rejectedCount || 0,
      failed_count: nextTask.failedCount || 0,
      current_candidate_id: nextTask.currentCandidateId,
      current_candidate_name: nextTask.currentCandidateName,
      summary: nextTask.summary || '',
      error: nextTask.error || null,
      started_at: nextTask.startedAt || null,
      finished_at: nextTask.finishedAt || null,
      updated_at: nextTask.updatedAt,
    });

    for (const candidate of nextTask.candidates || []) {
      writeCandidate.run({
        id: candidate.candidateId,
        task_id: nextTask.taskId,
        name: candidate.name,
        status: candidate.status,
        matched:
          candidate.matched === null || candidate.matched === undefined
            ? null
            : (candidate.matched ? 1 : 0),
        reason: candidate.reason || '',
        rejection_message: candidate.rejectionMessage || '',
        resume_summary: candidate.resumeSummary || '',
        resume_json: stringifyJson(candidate.resume),
        resume_segments_json: stringifyJson(candidate.resumeSegments),
        note_file_json: stringifyJson(candidate.noteFile),
        error: candidate.error || null,
        step_count: candidate.stepCount || 0,
        tool_call_count: candidate.toolCallCount || 0,
        tool_result_count: candidate.toolResultCount || 0,
        logs_json: null,
        tool_timeline_json: stringifyJson(candidate.toolTimeline || []),
        steps_json: stringifyJson(candidate.steps || []),
        started_at: candidate.startedAt || null,
        finished_at: candidate.finishedAt || null,
        updated_at: candidate.updatedAt || nextTask.updatedAt,
      });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return nextTask;
}

export async function persistSingleCandidate(taskId, candidate) {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO screening_candidates (
        id, task_id, name, status, matched, reason, rejection_message,
        resume_summary, resume_json, resume_segments_json, note_file_json, error,
        step_count, tool_call_count, tool_result_count,
        logs_json, tool_timeline_json, steps_json,
        started_at, finished_at, updated_at
      ) VALUES (
        @id, @task_id, @name, @status, @matched, @reason, @rejection_message,
        @resume_summary, @resume_json, @resume_segments_json, @note_file_json, @error,
        @step_count, @tool_call_count, @tool_result_count,
        @logs_json, @tool_timeline_json, @steps_json,
        @started_at, @finished_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        matched = excluded.matched,
        reason = excluded.reason,
        rejection_message = excluded.rejection_message,
        resume_summary = excluded.resume_summary,
        resume_json = excluded.resume_json,
        resume_segments_json = excluded.resume_segments_json,
        note_file_json = excluded.note_file_json,
        error = excluded.error,
        step_count = excluded.step_count,
        tool_call_count = excluded.tool_call_count,
        tool_result_count = excluded.tool_result_count,
        tool_timeline_json = excluded.tool_timeline_json,
        steps_json = excluded.steps_json,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        updated_at = excluded.updated_at
    `).run({
      id: candidate.candidateId,
      task_id: taskId,
      name: candidate.name,
      status: candidate.status,
      matched:
        candidate.matched === null || candidate.matched === undefined
          ? null
          : (candidate.matched ? 1 : 0),
      reason: candidate.reason || '',
      rejection_message: candidate.rejectionMessage || '',
      resume_summary: candidate.resumeSummary || '',
      resume_json: stringifyJson(candidate.resume),
      resume_segments_json: stringifyJson(candidate.resumeSegments),
      note_file_json: stringifyJson(candidate.noteFile),
      error: candidate.error || null,
      step_count: candidate.stepCount || 0,
      tool_call_count: candidate.toolCallCount || 0,
      tool_result_count: candidate.toolResultCount || 0,
      logs_json: null,
      tool_timeline_json: stringifyJson(candidate.toolTimeline || []),
      steps_json: stringifyJson(candidate.steps || []),
      started_at: candidate.startedAt || null,
      finished_at: candidate.finishedAt || null,
      updated_at: now,
    });

    // 用 SQL 聚合更新任务计数
    db.prepare(`
      UPDATE screening_tasks SET
        processed_count = (SELECT COUNT(*) FROM screening_candidates WHERE task_id = ? AND status IN ('completed','rejected','failed')),
        matched_count = (SELECT COUNT(*) FROM screening_candidates WHERE task_id = ? AND matched = 1),
        rejected_count = (SELECT COUNT(*) FROM screening_candidates WHERE task_id = ? AND status = 'rejected'),
        failed_count = (SELECT COUNT(*) FROM screening_candidates WHERE task_id = ? AND status = 'failed'),
        current_candidate_id = CASE WHEN ? = 'running' THEN ? ELSE current_candidate_id END,
        current_candidate_name = CASE WHEN ? = 'running' THEN ? ELSE current_candidate_name END,
        updated_at = ?
      WHERE id = ?
    `).run(taskId, taskId, taskId, taskId, candidate.status, candidate.candidateId, candidate.status, candidate.name, now, taskId);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export async function persistTaskEvent({
  taskId,
  candidateId = null,
  kind,
  payload,
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO screening_events (task_id, candidate_id, kind, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    taskId,
    candidateId,
    kind,
    stringifyJson(payload),
    new Date().toISOString(),
  );
}

export async function readScreeningTask(taskId) {
  const db = getDb();
  const taskRow = db
    .prepare(`
      SELECT *
      FROM screening_tasks
      WHERE id = ?
    `)
    .get(taskId);

  if (!taskRow) {
    return null;
  }

  return mapTaskRow(taskRow, readCandidateRows(taskId));
}

export async function deleteScreeningTask(taskId) {
  const db = getDb();
  const result = db
    .prepare(`
      DELETE FROM screening_tasks
      WHERE id = ?
    `)
    .run(taskId);

  return result.changes > 0;
}

export async function listScreeningTasks({ limit = 20, status, jobProfileId } = {}) {
  const db = getDb();
  
  let baseSql = 'SELECT * FROM screening_tasks';
  const conditions = [];
  const params = [];
  
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  
  if (jobProfileId) {
    conditions.push('job_profile_id = ?');
    params.push(jobProfileId);
  }
  
  if (conditions.length > 0) {
    baseSql += ' WHERE ' + conditions.join(' AND ');
  }
  
  baseSql += ' ORDER BY updated_at DESC LIMIT ?';
  params.push(limit);
  
  const taskRows = db.prepare(baseSql).all(...params);

  return taskRows.map(taskRow => mapTaskRow(taskRow, readCandidateRows(taskRow.id)));
}

export async function readTaskEvents(taskId, limit = 200) {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT *
      FROM screening_events
      WHERE task_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `)
    .all(taskId, limit);

  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    candidateId: row.candidate_id,
    kind: row.kind,
    payload: parseJson(row.payload_json, null),
    createdAt: row.created_at,
  }));
}

export async function readTaskToolEvents(taskId, limit = 500) {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT *
      FROM screening_events
      WHERE task_id = ?
        AND kind IN ('tool_event', 'tool_error')
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    `)
    .all(taskId, limit);

  return rows
    .map(row => {
      const payload = parseJson(row.payload_json, null) || {};
      return {
        id: row.id,
        taskId: row.task_id,
        candidateId: row.candidate_id,
        kind: row.kind,
        toolName: payload.toolName || '',
        phase: payload.phase || (row.kind === 'tool_error' ? 'error' : 'result'),
        candidateName: payload.candidateName || '',
        summary: payload.summary || '',
        payload: payload.payload ?? payload,
        at: payload.at || row.created_at,
      };
    })
    .filter(event => event.toolName);
}

export function updateCandidateInTask(task, candidateId, updater) {
  const nextTask = cloneJson(task);
  const index = nextTask.candidates.findIndex(
    candidate => candidate.candidateId === candidateId,
  );

  if (index < 0) {
    throw new Error(`任务中未找到候选人 ${candidateId}`);
  }

  const currentCandidate = nextTask.candidates[index];
  const nextCandidate = {
    ...currentCandidate,
    ...updater(cloneJson(currentCandidate)),
    updatedAt: new Date().toISOString(),
  };
  nextTask.candidates[index] = nextCandidate;
  return recalculateTask(nextTask);
}

export function prepareTaskForResume(task, mode = 'unfinished') {
  const nextTask = cloneJson(task);
  const shouldReset = candidate => {
    if (mode === 'retry-failed') {
      return candidate.status === 'failed';
    }

    return ['queued', 'running', 'failed'].includes(candidate.status);
  };

  nextTask.candidates = nextTask.candidates.map(candidate => {
    if (!shouldReset(candidate)) {
      return candidate;
    }

    return {
      ...candidate,
      status: 'queued',
      error: null,
      stepCount: 0,
      toolCallCount: 0,
      toolResultCount: 0,
      toolTimeline: [],
      steps: [],
      finishedAt: null,
      updatedAt: new Date().toISOString(),
    };
  });

  nextTask.status = 'queued';
  nextTask.error = null;
  nextTask.finishedAt = null;
  nextTask.summary = '';
  return recalculateTask(nextTask);
}

export function getTaskCandidatesForMode(task, mode = 'all') {
  const candidates = Array.isArray(task?.candidates) ? task.candidates : [];

  if (mode === 'retry-failed') {
    return candidates.filter(candidate => candidate.status === 'queued');
  }

  if (mode === 'unfinished') {
    return candidates.filter(candidate =>
      ['queued', 'running', 'failed'].includes(candidate.status),
    );
  }

  return candidates;
}
