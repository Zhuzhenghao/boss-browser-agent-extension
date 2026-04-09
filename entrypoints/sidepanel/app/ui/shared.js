export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function getToolPhaseLabel(phase) {
  switch (phase) {
    case 'call':
      return '执行中';
    case 'result':
      return '已完成';
    case 'error':
      return '失败';
    default:
      return '未知';
  }
}

export function getToolPhaseColor(phase) {
  switch (phase) {
    case 'call':
      return 'blue';
    case 'result':
      return 'green';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}

export function getToolDisplayName(toolName) {
  switch (toolName) {
    case 'open_chat_index':
      return '打开沟通页';
    case 'switch_to_unread':
      return '切换未读';
    case 'get_unread_sender_names':
    case 'read_unread_candidates':
      return '读取未读名单';
    case 'create_task':
      return '创建任务';
    case 'open_candidate_chat':
      return '打开聊天会话';
    case 'open_candidate_resume':
      return '打开在线简历';
    case 'extract_candidate_resume':
      return '提取简历内容';
    case 'close_candidate_resume':
      return '关闭在线简历';
    case 'request_resume':
      return '发起求简历';
    case 'pin_candidate':
      return '置顶候选人';
    case 'send_rejection_message':
      return '发送不匹配消息';
    case 'return_to_unread_list':
      return '返回未读列表';
    case 'read_chat_context':
      return '读取聊天上下文';
    default:
      return toolName || 'unknown-tool';
  }
}

export function getCandidateStatusLabel(status) {
  switch (status) {
    case 'queued':
      return '待处理';
    case 'running':
      return '处理中';
    case 'completed':
      return '已完成';
    case 'rejected':
      return '已拒绝';
    case 'failed':
      return '失败';
    default:
      return status || '未知';
  }
}

export function getCandidateStatusColor(status) {
  switch (status) {
    case 'queued':
      return 'gray';
    case 'running':
      return 'blue';
    case 'completed':
      return 'green';
    case 'rejected':
      return 'orange';
    case 'failed':
      return 'red';
    default:
      return 'gray';
  }
}

export function getTaskStatusColor(status) {
  switch (status) {
    case 'running':
      return 'blue';
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'stopped':
      return 'gray';
    default:
      return 'gray';
  }
}

export function getTaskStatusLabel(status) {
  switch (status) {
    case 'queued':
      return '待启动';
    case 'running':
      return '执行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'stopped':
      return '已停止';
    default:
      return status || '未知';
  }
}

export function summarizeCandidateAction(candidate) {
  if (!candidate) return '暂无结果';
  if (candidate.status === 'running') return '正在处理';
  if (candidate.status === 'queued') return '等待执行';
  if (candidate.status === 'failed') return candidate.error || '处理失败';
  if (candidate.status === 'rejected') return candidate.reason || '已发送不匹配消息';
  if (candidate.matched === true) return candidate.reason || '已求简历并置顶';
  if (candidate.status === 'completed') return candidate.reason || '处理完成';
  return '暂无结果';
}

export function getCandidateKey(candidate, index = 0) {
  return candidate?.candidateId || candidate?.name || `candidate-${index}`;
}

export function flattenCandidateToolTimeline(task) {
  const candidates = Array.isArray(task?.candidates) ? task.candidates : [];

  return candidates.flatMap(candidate => (
    Array.isArray(candidate?.toolTimeline) ? candidate.toolTimeline : []
  ));
}

export function resolveResultToolTimeline(result, task) {
  if (Array.isArray(result?.toolTimeline) && result.toolTimeline.length) {
    return result.toolTimeline;
  }

  return flattenCandidateToolTimeline(task);
}

export function getSystemTimeline(toolTimeline = []) {
  return toolTimeline.filter(event => !event?.candidateId && !event?.candidateName);
}

export function getCandidateTimeline(toolTimeline = [], candidate) {
  if (!candidate) {
    return [];
  }

  return toolTimeline.filter(event => (
    event?.candidateId === candidate.candidateId
      || event?.candidateName === candidate.name
  ));
}

export function getTaskStageSummary(task, toolTimeline = []) {
  const systemTimeline = getSystemTimeline(toolTimeline);
  const latestSystemEvent = systemTimeline[systemTimeline.length - 1];

  if (latestSystemEvent?.summary) {
    return latestSystemEvent.summary;
  }

  if (task?.status === 'completed') {
    return '这轮巡检已经完成，所有候选人的结果都已更新。';
  }

  if (task?.status === 'failed') {
    return task?.error || '这轮巡检执行失败，请检查失败候选人后再决定是否重试。';
  }

  if (task?.status === 'stopped') {
    return '这轮巡检已停止，稍后可以继续处理未完成的候选人。';
  }

  return '正在准备执行环境。';
}

export function buildCandidateStatusCounts(task) {
  const candidates = Array.isArray(task?.candidates) ? task.candidates : [];
  return candidates.reduce((accumulator, candidate) => {
    const status = candidate?.status || 'queued';
    accumulator[status] = (accumulator[status] || 0) + 1;
    return accumulator;
  }, {
    queued: 0,
    running: 0,
    completed: 0,
    rejected: 0,
    failed: 0,
  });
}

export function buildToolGroups(toolTimeline = []) {
  const groups = [];
  let systemGroup = null;
  const byCandidate = new Map();

  for (const event of toolTimeline) {
    const candidateId =
      typeof event?.candidateId === 'string' && event.candidateId.trim()
        ? event.candidateId.trim()
        : '';
    const candidateName =
      typeof event?.candidateName === 'string' && event.candidateName.trim()
        ? event.candidateName.trim()
        : '';

    if (!candidateId && !candidateName) {
      if (!systemGroup) {
        systemGroup = { key: 'system', title: '任务进度', events: [] };
        groups.push(systemGroup);
      }
      systemGroup.events.push(event);
      continue;
    }

    const groupKey = candidateId || `candidate-${candidateName}`;

    if (!byCandidate.has(groupKey)) {
      const group = {
        key: groupKey,
        title: candidateName || candidateId,
        events: [],
      };
      byCandidate.set(groupKey, group);
      groups.push(group);
    }

    byCandidate.get(groupKey).events.push(event);
  }

  return groups;
}

export function formatDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

export function formatListDateTime(value) {
  if (!value) return '暂无更新';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function areToolEventsEqual(prevEvent, nextEvent) {
  return prevEvent?.toolName === nextEvent?.toolName
    && prevEvent?.phase === nextEvent?.phase
    && prevEvent?.summary === nextEvent?.summary
    && prevEvent?.at === nextEvent?.at
    && prevEvent?.candidateId === nextEvent?.candidateId
    && prevEvent?.candidateName === nextEvent?.candidateName
    && JSON.stringify(prevEvent?.payload ?? null) === JSON.stringify(nextEvent?.payload ?? null);
}

export function mergeToolEvents(events = []) {
  const merged = [];

  for (const event of events) {
    const previous = merged[merged.length - 1];
    const canMerge = previous
      && previous.toolName === event?.toolName
      && previous.candidateId === event?.candidateId
      && previous.candidateName === event?.candidateName
      && previous.phase === 'call'
      && ['result', 'error'].includes(event?.phase);

    if (!canMerge) {
      merged.push({
        ...event,
        startedAt: event?.at || '',
        completedAt: ['result', 'error'].includes(event?.phase) ? (event?.at || '') : '',
        callSummary: event?.phase === 'call' ? (event?.summary || '') : '',
        resultSummary: event?.phase === 'result' ? (event?.summary || '') : '',
        errorSummary: event?.phase === 'error' ? (event?.summary || '') : '',
        inputPayload: event?.phase === 'call' ? (event?.payload ?? {}) : null,
        outputPayload: event?.phase === 'result' ? (event?.payload ?? {}) : null,
        errorPayload: event?.phase === 'error' ? (event?.payload ?? {}) : null,
      });
      continue;
    }

    merged[merged.length - 1] = {
      ...previous,
      phase: event.phase,
      summary: event.summary || previous.summary,
      at: event.at || previous.at,
      completedAt: event.at || previous.completedAt,
      resultSummary: event.phase === 'result' ? (event.summary || '') : previous.resultSummary,
      errorSummary: event.phase === 'error' ? (event.summary || '') : previous.errorSummary,
      outputPayload: event.phase === 'result' ? (event.payload ?? {}) : previous.outputPayload,
      errorPayload: event.phase === 'error' ? (event.payload ?? {}) : previous.errorPayload,
    };
  }

  return merged;
}

export function areToolTimelinesShallowEqual(prevTimeline = [], nextTimeline = []) {
  if (prevTimeline === nextTimeline) {
    return true;
  }

  if (prevTimeline.length !== nextTimeline.length) {
    return false;
  }

  return prevTimeline.every((event, index) => areToolEventsEqual(event, nextTimeline[index]));
}

export function areCandidateSnapshotsEqual(prevCandidate, nextCandidate) {
  if (prevCandidate === nextCandidate) {
    return true;
  }

  if (!prevCandidate || !nextCandidate) {
    return prevCandidate === nextCandidate;
  }

  return prevCandidate.candidateId === nextCandidate.candidateId
    && prevCandidate.name === nextCandidate.name
    && prevCandidate.status === nextCandidate.status
    && prevCandidate.matched === nextCandidate.matched
    && prevCandidate.reason === nextCandidate.reason
    && prevCandidate.rejectionMessage === nextCandidate.rejectionMessage
    && prevCandidate.resumeSummary === nextCandidate.resumeSummary
    && prevCandidate.error === nextCandidate.error
    && prevCandidate.startedAt === nextCandidate.startedAt
    && prevCandidate.finishedAt === nextCandidate.finishedAt
    && prevCandidate.updatedAt === nextCandidate.updatedAt
    && prevCandidate.noteFile?.fileName === nextCandidate.noteFile?.fileName
    && (prevCandidate.toolTimeline?.length || 0) === (nextCandidate.toolTimeline?.length || 0)
    && (prevCandidate.steps?.length || 0) === (nextCandidate.steps?.length || 0);
}
