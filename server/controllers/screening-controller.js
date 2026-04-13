import {
  consumeStream,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
} from 'ai';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import {
  createScreeningTask,
  deleteScreeningTask,
  listScreeningTasks,
  persistScreeningTask,
  readScreeningTask,
  readTaskToolEvents,
} from '../../agents/services/task-persistence.js';
import { checkBridgeReady, normalizeBridgeError } from '../bridge.js';
import { parseRequestBody, sendJson } from '../http.js';
import { importJobProfileFromFiles } from '../job-profile-import.js';
import {
  deleteJobProfile,
  listJobProfiles,
  readJobProfile,
  saveJobProfile,
} from '../job-profiles-store.js';
import {
  abortCurrentTask,
  mergeUnreadTaskState,
  resetUnreadTaskState,
} from '../state.js';

export function recordFatalBridgeError(state, error) {
  const message = normalizeBridgeError(error);
  state.running = false;
  if (state.currentTaskProcess && !state.currentTaskProcess.killed) {
    state.currentTaskProcess.kill();
    state.currentTaskProcess = null;
  }
  mergeUnreadTaskState(state, {
    running: false,
    status: 'error',
    finishedAt: new Date().toISOString(),
    error: message,
  });
  console.error(message);
}

function normalizeUploadedFilename(filename) {
  const raw = String(filename || '');
  if (!raw) {
    return raw;
  }

  try {
    // multipart 上传里中文文件名常被按 latin1 读取，这里转回 utf8
    return Buffer.from(raw, 'latin1').toString('utf8');
  } catch {
    return raw;
  }
}

export async function handleScreenUnreadStart(req, res, state) {
  if (state.running) {
    sendJson(res, 409, { ok: false, error: '已有任务在执行，请稍后再试' });
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
    return;
  }

  const targetProfile = String(body.targetProfile || '').trim();
  const rejectionMessage = String(body.rejectionMessage || '').trim();
  const jobTitle = String(body.jobTitle || '').trim();
  const testCandidateNames = Array.isArray(body.testCandidateNames) 
    ? body.testCandidateNames
        .map(name => String(name || '').trim())
        .filter(Boolean)
    : [];
  
  console.log('[Start] Received testCandidateNames:', JSON.stringify(testCandidateNames));
  console.log('[Start] testCandidateNames length:', testCandidateNames.length);
  
  let taskId = String(body.taskId || '').trim();
  const mode = String(body.mode || 'start').trim();

  if (mode === 'start' && !targetProfile) {
    sendJson(res, 400, { ok: false, error: '请先填写目标候选人的特征' });
    return;
  }

  if (mode !== 'start' && !taskId) {
    sendJson(res, 400, { ok: false, error: '继续任务时必须提供 taskId' });
    return;
  }

  // 如果是新任务，提前生成 taskId
  if (mode === 'start' && !taskId) {
    taskId = `screening-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    console.log('[Start] Generated taskId:', taskId);
  }

  const bridgeStatus = await checkBridgeReady();
  if (!bridgeStatus.ok) {
    sendJson(res, 409, { ok: false, error: bridgeStatus.message });
    return;
  }

  console.log('[Start] Resetting state and setting taskId:', taskId);
  resetUnreadTaskState(state);

  if (mode === 'start') {
    // 创建占位任务，如果有指定候选人则包含在内
    const placeholderTask = await persistScreeningTask({
      ...createScreeningTask({
        targetProfile,
        rejectionMessage,
        unreadCandidates: testCandidateNames.length > 0 ? testCandidateNames : [],
        taskId,
      }),
      status: 'running',
      summary: testCandidateNames.length > 0 
        ? `任务已创建，准备处理 ${testCandidateNames.length} 位指定候选人。`
        : '任务已创建，正在准备执行环境。',
    });

    mergeUnreadTaskState(state, {
      task: placeholderTask,
    });
  }

  mergeUnreadTaskState(state, {
    running: true,
    status: 'running',
    startedAt: new Date().toISOString(),
    taskId: taskId, // 立即设置 taskId
  });
  state.running = true;
  
  console.log('[Start] State after merge, taskId:', state.unreadTaskState.taskId);

  // 立即返回 taskId，不等待
  sendJson(res, 200, { 
    ok: true, 
    message: '任务已启动',
    taskId: taskId,
  });

  const workerPath = path.resolve(process.cwd(), 'server', 'task-worker.js');
  const child = spawn(process.execPath, [workerPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  state.currentTaskProcess = child;

  child.stdout.on('data', chunk => {
    process.stdout.write(`[task-worker] ${chunk}`);
  });

  child.stderr.on('data', chunk => {
    process.stderr.write(`[task-worker] ${chunk}`);
  });

  child.on('message', message => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'tool-event' && message.data) {
      mergeUnreadTaskState(state, { latestToolEvent: message.data });
      return;
    }

    if (message.type === 'task-update' && message.data) {
      mergeUnreadTaskState(state, { task: message.data });
      return;
    }

    if (message.type === 'task-finished') {
      mergeUnreadTaskState(state, {
        running: false,
        status: 'completed',
        finishedAt: new Date().toISOString(),
        taskId: message.data?.taskId || taskId,
      });
      state.running = false;
      return;
    }

    if (message.type === 'task-failed') {
      mergeUnreadTaskState(state, {
        running: false,
        status: message.data?.aborted ? 'stopped' : 'error',
        finishedAt: new Date().toISOString(),
        error: message.data?.error || '任务执行失败',
      });
      state.running = false;
    }
  });

  child.on('error', error => {
    if (state.currentTaskProcess === child) {
      state.currentTaskProcess = null;
    }
    mergeUnreadTaskState(state, {
      running: false,
      status: 'error',
      finishedAt: new Date().toISOString(),
      error: normalizeBridgeError(error),
    });
    state.running = false;
  });

  child.on('exit', code => {
    if (state.currentTaskProcess === child) {
      state.currentTaskProcess = null;
    }

    if (state.running) {
      mergeUnreadTaskState(state, {
        running: false,
        status: code === 0 ? (state.unreadTaskState.status || 'completed') : 'error',
        finishedAt: new Date().toISOString(),
        error: code === 0 ? state.unreadTaskState.error : (state.unreadTaskState.error || `任务进程异常退出 (${code ?? 'unknown'})`),
      });
      state.running = false;
    }
  });

  child.send({
    type: 'start-task',
    payload: {
      targetProfile,
      rejectionMessage,
      jobTitle,
      testCandidateNames,
      taskId,
      mode,
    },
  });
}

// SSE订阅指定任务的状态更新
export function handleScreenUnreadSubscribeByTaskId(res, state, taskId) {
  if (!taskId) {
    sendJson(res, 400, { ok: false, error: '缺少 taskId' });
    return;
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      console.log(`[SSE] Client subscribed to task: ${taskId}`);
      console.log(`[SSE] Current state.running: ${state.running}`);
      console.log(`[SSE] Current state.unreadTaskState.taskId: ${state.unreadTaskState.taskId}`);

      // 如果订阅的是当前正在运行的任务，发送实时状态
      if (state.running && state.unreadTaskState.taskId === taskId) {
        console.log(`[SSE] Task ${taskId} is running, starting to stream updates`);
        
        // 先发送当前状态
        if (state.unreadTaskState.task) {
          console.log(`[SSE] Sending initial task state:`, state.unreadTaskState.task?.taskId);
          writer.write({
            type: 'task-update',
            data: state.unreadTaskState.task,
          });
        } else {
          console.log(`[SSE] No initial task state available`);
        }

        // 发送已有的工具事件
        const existingTimeline = state.unreadTaskState.toolTimeline || [];
        console.log(`[SSE] Sending ${existingTimeline.length} existing tool events`);
        for (const toolEvent of existingTimeline) {
          writer.write({
            type: 'tool-event',
            data: toolEvent,
          });
        }

        // 持续监听状态变化
        let lastToolTimelineLength = existingTimeline.length;
        let lastTask = state.unreadTaskState.task;

        const checkInterval = setInterval(() => {
          // 只处理匹配的任务
          if (state.unreadTaskState.taskId !== taskId) {
            console.log(`[SSE] Task changed from ${taskId} to ${state.unreadTaskState.taskId}, stopping`);
            clearInterval(checkInterval);
            writer.write({
              type: 'task-completed',
              data: {
                status: 'stopped',
                taskId: taskId,
              },
            });
            return;
          }

          // 检查新的工具事件
          const currentTimeline = state.unreadTaskState.toolTimeline || [];
          if (currentTimeline.length > lastToolTimelineLength) {
            const newEvents = currentTimeline.slice(lastToolTimelineLength);
            console.log(`[SSE] Sending ${newEvents.length} new tool events`);
            for (const toolEvent of newEvents) {
              writer.write({
                type: 'tool-event',
                data: toolEvent,
              });
            }
            lastToolTimelineLength = currentTimeline.length;
          }

          // 检查任务更新
          if (state.unreadTaskState.task !== lastTask) {
            console.log(`[SSE] Task updated, sending update`);
            writer.write({
              type: 'task-update',
              data: state.unreadTaskState.task,
            });
            lastTask = state.unreadTaskState.task;
          }

          // 检查任务是否完成
          if (!state.running) {
            console.log(`[SSE] Task completed, sending completion event`);
            clearInterval(checkInterval);
            writer.write({
              type: 'task-completed',
              data: {
                status: state.unreadTaskState.status,
                taskId: state.unreadTaskState.taskId,
              },
            });
          }
        }, 300); // 每300ms检查一次

        // 等待客户端断开
        await new Promise((resolve) => {
          res.on('close', () => {
            console.log(`[SSE] Client disconnected from task: ${taskId}`);
            clearInterval(checkInterval);
            resolve();
          });
        });
      } else {
        // 订阅的不是当前运行的任务，立即返回完成状态
        console.log(`[SSE] Task ${taskId} is not running, sending completed immediately`);
        writer.write({
          type: 'task-completed',
          data: {
            status: 'not-running',
            taskId: taskId,
          },
        });
      }
    },
    onError: error => normalizeBridgeError(error),
  });

  pipeUIMessageStreamToResponse({
    response: res,
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    stream,
    consumeSseStream: consumeStream,
  });
}

export function handleScreenUnreadStop(res, state) {
  const stopped = abortCurrentTask(state, '用户手动停止任务');
  sendJson(res, stopped ? 200 : 409, {
    ok: stopped,
    error: stopped ? null : '当前没有正在执行的任务',
  });
}

export function handleScreenUnreadState(res, state) {
  sendJson(res, 200, { ok: true, data: state.unreadTaskState });
}

export async function handleListScreeningTasks(res, status) {
  const tasks = await listScreeningTasks({
    limit: 30,
    status: status || undefined,
  });
  sendJson(res, 200, { ok: true, data: tasks });
}

export async function handleListJobProfiles(res) {
  const profiles = await listJobProfiles();
  sendJson(res, 200, { ok: true, data: profiles });
}

export async function handleReadJobProfile(res, profileId) {
  if (!profileId) {
    sendJson(res, 400, { ok: false, error: '缺少 profileId' });
    return;
  }

  const profile = await readJobProfile(profileId);
  if (!profile) {
    sendJson(res, 404, { ok: false, error: '岗位不存在' });
    return;
  }

  sendJson(res, 200, { ok: true, data: profile });
}

export async function handleSaveJobProfile(req, res, profileId) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
    return;
  }

  const profile = body?.profile || body;
  if (!profile || typeof profile !== 'object') {
    sendJson(res, 400, { ok: false, error: 'profile 必须是对象' });
    return;
  }

  const saved = await saveJobProfile({
    ...profile,
    id: profileId || profile.id,
    updatedAt: new Date().toISOString(),
  });
  sendJson(res, 200, { ok: true, data: saved });
}

export async function handleDeleteJobProfile(res, profileId) {
  if (!profileId) {
    sendJson(res, 400, { ok: false, error: '缺少 profileId' });
    return;
  }

  const deleted = await deleteJobProfile(profileId);
  sendJson(res, deleted ? 200 : 404, {
    ok: deleted,
    error: deleted ? null : '岗位不存在',
  });
}

export async function handleImportJobProfile(req, res) {
  let existingProfile = {};
  const uploadedFiles = Array.isArray(req?.files)
    ? req.files.map(file => ({
        filename: normalizeUploadedFilename(file.originalname),
        mimeType: file.mimetype,
        contentBase64: file.buffer,
      }))
    : null;

  let body = null;
  if (!uploadedFiles?.length) {
    try {
      body = await parseRequestBody(req);
    } catch {
      sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
      return;
    }
  } else {
    const rawExistingProfile = req?.body?.existingProfile;
    if (typeof rawExistingProfile === 'string' && rawExistingProfile.trim()) {
      try {
        existingProfile = JSON.parse(rawExistingProfile);
      } catch {
        sendJson(res, 400, { ok: false, error: 'existingProfile 不是合法 JSON' });
        return;
      }
    }
  }

  const files = uploadedFiles || (Array.isArray(body?.files) ? body.files : null);
  if (!files?.length) {
    sendJson(res, 400, { ok: false, error: '请至少上传一个文件' });
    return;
  }

  console.log('[job-import] 接收到导入接口请求', {
    fileCount: files.length,
    files: files.map(file => file?.filename || 'unknown'),
    profileId: uploadedFiles ? existingProfile?.id || '' : (body?.existingProfile?.id || ''),
  });

  try {
    console.log('[job-import] 开始执行导入分析');
    const imported = await importJobProfileFromFiles({
      files,
      existingProfile: uploadedFiles ? existingProfile : (body?.existingProfile || {}),
    });
    console.log('[job-import] 导入分析成功', {
      title: imported?.profile?.title || '',
      missingFieldCount: Array.isArray(imported?.missingFields) ? imported.missingFields.length : 0,
    });
    sendJson(res, 200, { ok: true, data: imported });
  } catch (error) {
    console.error('[job-import] 导入分析失败', error);
    sendJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleReadScreeningTask(res, state, taskId) {
  if (!taskId) {
    sendJson(res, 400, { ok: false, error: '缺少 taskId' });
    return;
  }

  let task = await readScreeningTask(taskId);
  if (!task && state?.running && state?.unreadTaskState?.taskId === taskId && state?.unreadTaskState?.task) {
    task = state.unreadTaskState.task;
  }

  if (!task) {
    sendJson(res, 404, { ok: false, error: '任务不存在' });
    return;
  }
  const toolEvents = await readTaskToolEvents(taskId, 500);

  sendJson(res, 200, {
    ok: true,
    data: {
      task,
      toolEvents,
    },
  });
}

export async function handleDeleteScreeningTask(res, state, taskId) {
  if (!taskId) {
    sendJson(res, 400, { ok: false, error: '缺少 taskId' });
    return;
  }

  const currentTaskId = state?.unreadTaskState?.task?.taskId || state?.unreadTaskState?.taskId;
  if (state.running && currentTaskId === taskId) {
    sendJson(res, 409, { ok: false, error: '任务正在执行中，请先停止后再删除' });
    return;
  }

  const deleted = await deleteScreeningTask(taskId);
  sendJson(res, deleted ? 200 : 404, {
    ok: deleted,
    error: deleted ? null : '任务不存在',
  });
}

export async function handleHealth(res, state) {
  const bridgeStatus = await checkBridgeReady();
  sendJson(res, 200, { ok: true, running: state.running, bridge: bridgeStatus });
}

export async function handleBridgeStatus(res) {
  const bridgeStatus = await checkBridgeReady();
  sendJson(res, 200, { ok: true, data: bridgeStatus });
}
