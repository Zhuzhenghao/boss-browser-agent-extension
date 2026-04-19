import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import {
  persistScreeningTask,
  persistSingleCandidate,
  persistTaskEvent,
  updateCandidateInTask,
} from './services/task-persistence.js';

/**
 * 创建 agent 运行时上下文。
 * 返回所有候选人循环需要的工具、emit 函数、辅助函数。
 */
export function setupAgentContext({
  taskId,
  onToolEvent,
  onTaskUpdate,
  abortSignal,
  browserAgent,
}) {
  const candidateRecords = new Map();
  let latestTask = null;
  const operationLog = [];

  const log = message => {
    const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
    operationLog.push(line);
    onToolEvent?.({
      phase: 'log',
      toolName: 'system',
      candidateId: null,
      candidateName: '',
      taskId: String(taskId || latestTask?.taskId || '').trim() || null,
      summary: line,
      payload: { message: line },
      at: new Date().toISOString(),
    });
  };

  const logDebug = ({ namespace, message }) => {
    if (!namespace || !message) return;
    log(`${namespace} ${message}`);
  };

  const persistTask = async nextTask => {
    latestTask = await persistScreeningTask(nextTask);
    onTaskUpdate?.(latestTask);
    return latestTask;
  };

  const buildStageEvent = ({
    toolName,
    phase,
    summary,
    candidateId = null,
    candidateName = '',
    payload = {},
  }) => ({
    phase,
    toolName,
    candidateId,
    candidateName,
    taskId: String(taskId || latestTask?.taskId || '').trim() || null,
    summary,
    payload,
    at: new Date().toISOString(),
  });

  const emitEvent = async (event, candidateId = null) => {
    if (latestTask?.taskId) {
      await persistTaskEvent({
        taskId: latestTask.taskId,
        candidateId,
        kind: event.phase === 'error' ? 'tool_error' : 'tool_event',
        payload: event,
      });
    }
    onToolEvent?.(event);
    return event;
  };

  const emitTaskStageEvent = async ({ toolName, phase, summary, payload = {} }) =>
    emitEvent(
      buildStageEvent({
        toolName,
        phase,
        summary,
        payload,
      }),
    );

  const emitCandidateStageEvent = async ({ toolName, phase, summary, candidateId, candidateName, payload = {} }) => {
    const event = buildStageEvent({
      toolName,
      phase,
      summary,
      candidateId,
      candidateName,
      payload,
    });
    return emitEvent(event, candidateId);
  };

  let browserAgentDestroyed = false;
  const destroyBrowserAgent = async () => {
    if (browserAgentDestroyed) return;
    browserAgentDestroyed = true;
    await browserAgent.destroy().catch(() => {});
  };

  // 辅助函数：更新单个候选人（内存 + DB）
  const updateCandidate = async (candidateId, updater) => {
    latestTask = updateCandidateInTask(latestTask, candidateId, updater);
    const updated = latestTask.candidates.find(c => c.candidateId === candidateId);
    if (updated) {
      await persistSingleCandidate(latestTask.taskId, updated);
    }
    onTaskUpdate?.(latestTask);
    return latestTask;
  };

  // runTaskStage：给启动阶段用的通用 step 记录函数
  const runTaskStage = async (toolName, callSummary, execute, buildResultSummary) => {
    await emitTaskStageEvent({ toolName, phase: 'call', summary: callSummary });
    try {
      const result = await execute();
      await emitTaskStageEvent({
        toolName,
        phase: 'result',
        summary: typeof buildResultSummary === 'function' ? buildResultSummary(result) : buildResultSummary,
        payload: result ?? {},
      });
      return result;
    } catch (error) {
      await emitTaskStageEvent({
        toolName,
        phase: 'error',
        summary: error instanceof Error ? error.message : String(error),
        payload: { message: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  };

  return {
    browserAgent,
    candidateRecords,
    latestTaskRef: {
      get current() {
        return latestTask;
      },
      set current(value) {
        latestTask = value;
      },
    },
    operationLog,
    log,
    logDebug,
    persistTask,
    emitTaskStageEvent,
    emitCandidateStageEvent,
    runTaskStage,
    updateCandidate,
    destroyBrowserAgent,
  };
}

/**
 * 初始化 browserAgent（连接 Midscene Chrome Bridge）。
 */
export async function initBrowserAgent({ forceSameTabNavigation = false }) {
  const browserAgent = new AgentOverChromeBridge({
    autoSwitchTab: true,
    forceSameTabNavigation,
    closeNewTabsAfterDisconnect: false,
  });
  await browserAgent.connectCurrentTab({ forceSameTabNavigation });
  return browserAgent;
}
