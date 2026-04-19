export function createInitialTaskState() {
  return {
    running: false,
    status: 'idle',
    taskId: null,
    startedAt: null,
    finishedAt: null,
    summary: '',
    steps: [],
    latestStep: null,
    toolTimeline: [],
    error: null,
    task: null,
  };
}

export function createServerState() {
  return {
    currentTaskProcess: null,
    unreadTaskState: createInitialTaskState(),
  };
}

export function isRunning(state) {
  return state.unreadTaskState.running === true;
}

export function getTaskStateSnapshot(state) {
  return structuredClone(state.unreadTaskState);
}

export function resetUnreadTaskState(state) {
  state.unreadTaskState = createInitialTaskState();
}

export function mergeUnreadTaskState(state, partial) {
  state.unreadTaskState = {
    ...state.unreadTaskState,
    ...partial,
  };

  if (partial?.latestStep) {
    const nextSteps = [...(state.unreadTaskState.steps || [])];
    const index = Math.max(0, Number(partial.latestStep.stepNumber || 1) - 1);
    nextSteps[index] = partial.latestStep;
    state.unreadTaskState.steps = nextSteps;
  }

  if (partial?.latestToolEvent) {
    const timeline = [
      ...(state.unreadTaskState.toolTimeline || []),
      partial.latestToolEvent,
    ];
    state.unreadTaskState.toolTimeline = timeline.length > 500
      ? timeline.slice(-500)
      : timeline;
  }
}

export function abortCurrentTask(state, reason = '任务已停止') {
  if (!state.currentTaskProcess || state.currentTaskProcess.killed) {
    return false;
  }

  state.currentTaskProcess.send?.({
    type: 'abort-task',
    reason,
  });
  return true;
}
