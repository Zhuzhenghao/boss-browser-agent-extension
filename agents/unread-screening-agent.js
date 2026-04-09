import { ToolLoopAgent, stepCountIs } from 'ai';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { createLanguageModel } from './services/language-model.js';
import { setMidsceneDebugSink } from './services/midscene-debug.js';
import { writeSingleCandidateMarkdown } from './services/note-persistence.js';
import {
  createScreeningTask,
  getTaskCandidatesForMode,
  persistTaskEvent,
  persistScreeningTask,
  prepareTaskForResume,
  readScreeningTask,
  updateCandidateInTask,
} from './services/task-persistence.js';
import {
  createScreeningTools,
} from './tools/candidate-screening-tools.js';
import {
  ensureSelectableCandidateList,
  openChatIndex,
  readUnreadCandidates,
  switchToUnread,
} from './tools/task-discovery.js';

const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

function buildTaskSummary(task) {
  if (!task) {
    return '';
  }

  return [
    `本次巡检共发现 ${task.unreadCandidateCount} 位未读候选人`,
    `已处理 ${task.processedCount} 位`,
    `匹配 ${task.matchedCount} 位`,
    `不匹配 ${task.rejectedCount} 位`,
    `失败 ${task.failedCount} 位`,
  ].join('，');
}

function buildTaskStageEvent({
  toolName,
  phase,
  summary,
  taskId,
  payload = {},
}) {
  return {
    phase,
    toolName,
    candidateId: null,
    candidateName: '',
    taskId,
    summary,
    payload,
    at: new Date().toISOString(),
  };
}

function buildCandidateAgentInstructions(
  targetProfile,
  rejectionMessage,
  candidateName,
) {
  return `
你是一个招聘筛选执行 agent。你这一次只处理一个候选人：${candidateName}。

目标候选人特征：
${targetProfile}

不匹配时发送给候选人的消息：
${rejectionMessage}

你可以自由决定工具顺序，但必须遵守下面的约束：
1. 只处理候选人“${candidateName}”，不要处理其他人。
2. 工具职责是原子的：打开聊天、打开简历、提取简历、关闭简历、读取聊天上下文、求简历、置顶、发送不匹配消息。
3. 需要查看简历时，请自行组合 open_candidate_chat、open_candidate_resume、extract_candidate_resume、close_candidate_resume。
4. 匹配时，需要调用 request_resume，并在需要时调用 pin_candidate。
5. 不匹配时，需要调用 send_rejection_message。
6. request_resume 或 send_rejection_message 必须传入一句中文 reason。
7. 如果不确定当前页面状态，可先调用 read_chat_context 再继续。

最终输出请简洁总结：
- 候选人姓名
- 是否匹配
- 执行动作
- 一句话原因
  `.trim();
}

function evaluateCandidateCompletion(record) {
  const rejectedFlowComplete = record?.sentRejectionMessage === true;
  const matchedFlowComplete =
    record?.resumeRequested === true &&
    record?.pinned === true;

  if (rejectedFlowComplete) {
    return {
      ok: true,
      status: 'rejected',
      summary: '不匹配，已发送消息。',
      matched: false,
      reason:
        record?.rejectionReason ||
        record?.reason ||
        'Agent 判定该候选人不符合目标候选人特征。',
    };
  }

  if (matchedFlowComplete) {
    return {
      ok: true,
      status: 'completed',
      summary: '匹配，已求简历并置顶。',
      matched: true,
      reason:
        record?.requestResumeReason ||
        record?.reason ||
        'Agent 判定该候选人符合目标候选人特征。',
    };
  }

  return {
    ok: false,
    status: 'failed',
    matched: null,
    reason: '',
    summary:
      '候选人执行流程未闭环：不匹配需要完成 send_rejection_message；匹配需要完成 request_resume + pin_candidate。',
  };
}

async function runDiscoveryOrchestrator({
  browserAgent,
  targetProfile,
  rejectionMessage,
  taskId, // 接受外部传入的 taskId
  log,
  persistTask,
  emitTaskStageEvent,
  ensureNotAborted,
}) {
  const placeholderTask = await persistTask(
    createScreeningTask({
      targetProfile,
      rejectionMessage,
      unreadCandidates: [],
      taskId,
    }),
  );

  let task = await persistTask({
    ...placeholderTask,
    status: 'running',
  });

  const runTaskStage = async (toolName, callSummary, execute, buildResultSummary) => {
    ensureNotAborted();
    await emitTaskStageEvent({
      toolName,
      phase: 'call',
      summary: callSummary,
    });

    try {
      const result = await execute();
      await emitTaskStageEvent({
        toolName,
        phase: 'result',
        summary: buildResultSummary(result),
        payload: result ?? {},
      });
      return result;
    } catch (error) {
      await emitTaskStageEvent({
        toolName,
        phase: 'error',
        summary: error instanceof Error ? error.message : String(error),
        payload: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  };

  ensureNotAborted();
  log('discovery orchestrator: open_chat_index');
  await runTaskStage(
    'open_chat_index',
    '准备打开 Boss 直聘沟通页。',
    () => openChatIndex(browserAgent, log),
    () => '已打开 Boss 直聘沟通页，并切到未读视图。',
  );

  ensureNotAborted();
  log('discovery orchestrator: switch_to_unread');
  await runTaskStage(
    'switch_to_unread',
    '准备切换到未读筛选。',
    () => switchToUnread(browserAgent, log),
    () => '已确认当前处于未读筛选。',
  );

  ensureNotAborted();
  log('discovery orchestrator: read_unread_candidates');
  const unreadResult = await runTaskStage(
    'read_unread_candidates',
    '准备读取当前未读候选人名单。',
    () => readUnreadCandidates(browserAgent, log),
    result => {
      const names = Array.isArray(result?.names) ? result.names : [];
      return names.length
        ? `已识别 ${names.length} 位未读候选人：${names.join('、')}`
        : '当前未读列表为空。';
    },
  );
  const unreadNames = Array.isArray(unreadResult?.names)
    ? unreadResult.names
    : [];

  ensureNotAborted();
  log('discovery orchestrator: create_task');
  task = await runTaskStage(
    'create_task',
    '准备根据未读名单创建巡检任务。',
    async () => {
      const createdTask = await persistScreeningTask(
        createScreeningTask({
          targetProfile,
          rejectionMessage,
          unreadCandidates: unreadNames,
          taskId, // 传递 taskId
        }),
      );

      return persistTask({
        ...createdTask,
        status: unreadNames.length ? 'running' : 'completed',
      });
    },
    createdTask => (
      unreadNames.length
        ? `任务已创建，待处理候选人 ${unreadNames.length} 位。`
        : '任务已创建，但当前没有未读候选人。'
    ),
  );

  log(
    `已创建巡检任务 ${task.taskId}，待处理候选人 ${unreadNames.length} 位。`,
  );

  return {
    task,
    unreadNames,
  };
}

export async function runUnreadScreeningAgent({
  targetProfile,
  rejectionMessage = DEFAULT_REJECTION_MESSAGE,
  taskId = '',
  mode = 'start',
  onToolEvent,
  onTaskUpdate,
  abortSignal,
}) {
  if (mode === 'start' && !String(targetProfile || '').trim()) {
    throw new Error('请先填写目标候选人的特征');
  }

  const ensureNotAborted = () => {
    if (abortSignal?.aborted) {
      throw abortSignal.reason instanceof Error
        ? abortSignal.reason
        : new Error('任务已停止');
    }
  };

  const browserAgent = new AgentOverChromeBridge({
    allowRemoteAccess: false,
    closeNewTabsAfterDisconnect: false,
  });

  let browserAgentDestroyed = false;
  const destroyBrowserAgent = async () => {
    if (browserAgentDestroyed) {
      return;
    }
    browserAgentDestroyed = true;
    await browserAgent.destroy().catch(() => {});
  };

  const operationLog = [];
  const candidateRecords = new Map();
  let latestTask = null;
  let effectiveTargetProfile = String(targetProfile || '').trim();
  let effectiveRejectionMessage = String(rejectionMessage || '').trim();

  const log = message => {
    const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
    operationLog.push(line);
    if (latestTask?.taskId) {
      void persistTaskEvent({
        taskId: latestTask.taskId,
        kind: 'task_log',
        payload: { message: line },
      });
    }
  };

  const logDebug = ({ namespace, message }) => {
    if (!namespace || !message) {
      return;
    }
    log(`${namespace} ${message}`);
  };

  const persistTask = async nextTask => {
    latestTask = await persistScreeningTask(nextTask);
    // 推送任务更新
    onTaskUpdate?.(latestTask);
    return latestTask;
  };

  const emitTaskStageEvent = async ({
    toolName,
    phase,
    summary,
    payload = {},
  }) => {
    const event = buildTaskStageEvent({
      toolName,
      phase,
      summary,
      taskId: String(taskId || latestTask?.taskId || '').trim() || null,
      payload,
    });

    if (latestTask?.taskId) {
      await persistTaskEvent({
        taskId: latestTask.taskId,
        kind: phase === 'error' ? 'tool_error' : 'tool_event',
        payload: event,
      });
    }

    onToolEvent?.(event);
    return event;
  };

  const handleAbort = () => {
    log('收到停止信号，正在尝试中断当前 Midscene 操作。');
    void destroyBrowserAgent();
  };

  if (abortSignal) {
    abortSignal.addEventListener('abort', handleAbort, { once: true });
  }

  setMidsceneDebugSink(logDebug);

  try {
    ensureNotAborted();
    log('正在连接当前已打开的 Chrome 标签页。');
    await browserAgent.connectCurrentTab({ forceSameTabNavigation: true });
    log('已连接到当前 Chrome 标签页，准备启动巡检任务。');

    let candidatesToProcess = [];

    if (mode === 'start') {
      const discoveryResult = await runDiscoveryOrchestrator({
        browserAgent,
        targetProfile: effectiveTargetProfile,
        rejectionMessage: effectiveRejectionMessage,
        taskId, // 传递 taskId
        log,
        persistTask,
        emitTaskStageEvent,
        ensureNotAborted,
      });
      latestTask = discoveryResult.task;
      candidatesToProcess = latestTask.candidates;
    } else {
      latestTask = await readScreeningTask(String(taskId).trim());
      if (!latestTask) {
        throw new Error(`任务 ${taskId} 不存在`);
      }
      effectiveTargetProfile = latestTask.targetProfile;
      effectiveRejectionMessage = latestTask.rejectionMessage;

      const resumeMode =
        mode === 'retry-failed' ? 'retry-failed' : 'unfinished';
      latestTask = await persistTask({
        ...prepareTaskForResume(latestTask, resumeMode),
        status: 'running',
      });
      candidatesToProcess = getTaskCandidatesForMode(latestTask, resumeMode);
      log(
        resumeMode === 'retry-failed'
          ? `任务 ${latestTask.taskId} 正在重试失败候选人，共 ${candidatesToProcess.length} 位。`
          : `任务 ${latestTask.taskId} 正在继续处理未完成候选人，共 ${candidatesToProcess.length} 位。`,
      );
    }

    for (const candidate of candidatesToProcess) {
      ensureNotAborted();
      await ensureSelectableCandidateList(browserAgent, log);

      latestTask = await persistTask(
        updateCandidateInTask(latestTask, candidate.candidateId, current => ({
          ...current,
          status: 'running',
          startedAt: current.startedAt || new Date().toISOString(),
          error: null,
        })),
      );

      log(`开始消费候选人 ${candidate.name}，本次将为其启动新的独立 agent。`);

      const persistCandidateRecord = async record => {
        const saved = await writeSingleCandidateMarkdown(record);
        if (!saved) {
          return;
        }

        latestTask = await persistTask(
          updateCandidateInTask(latestTask, record.candidateId, current => ({
            ...current,
            noteFile: saved,
          })),
        );
      };

      const candidateTools = createScreeningTools({
        browserAgent,
        candidateId: candidate.candidateId,
        candidateName: candidate.name,
        targetProfile: effectiveTargetProfile,
        rejectionMessage: effectiveRejectionMessage,
        operationLog,
        onProgress: progress => {
          if (progress?.latestToolEvent) {
            if (latestTask?.taskId) {
              void persistTaskEvent({
                taskId: latestTask.taskId,
                candidateId: candidate.candidateId,
                kind:
                  progress.latestToolEvent.phase === 'error'
                    ? 'tool_error'
                    : 'tool_event',
                payload: progress.latestToolEvent,
              });
            }
            // 推送工具事件
            onToolEvent?.(progress.latestToolEvent);
          }
        },
        candidateRecords,
        abortSignal,
        persistCandidateRecord,
      });

      const candidateAgent = new ToolLoopAgent({
        model: createLanguageModel(),
        instructions: buildCandidateAgentInstructions(
          effectiveTargetProfile,
          effectiveRejectionMessage,
          candidate.name,
        ),
        tools: candidateTools,
        stopWhen: stepCountIs(12),
      });

      try {
        const result = await candidateAgent.generate({
          prompt: `开始处理候选人 ${candidate.name}。`,
          abortSignal,
        });

        const finalRecord = candidateRecords.get(candidate.candidateId) || {};
        const completionState = evaluateCandidateCompletion(finalRecord);
        if (!completionState.ok) {
          throw new Error(completionState.summary);
        }
        latestTask = await persistTask(
          updateCandidateInTask(latestTask, candidate.candidateId, current => ({
            ...current,
            status: completionState.status,
            matched: completionState.matched,
            reason: completionState.reason || '',
            rejectionMessage: finalRecord.rejectionMessage || '',
            resumeSummary: finalRecord.resume?.summary || '',
            resume: finalRecord.resume || null,
            resumeSegments: finalRecord.resumeSegments || [],
            stepCount: Array.isArray(result?.steps) ? result.steps.length : 0,
            toolCallCount: Array.isArray(result?.steps)
              ? result.steps.reduce(
                  (sum, step) =>
                    sum +
                    (Array.isArray(step?.toolCalls)
                      ? step.toolCalls.length
                      : 0),
                  0,
                )
              : 0,
            toolResultCount: Array.isArray(result?.steps)
              ? result.steps.reduce(
                  (sum, step) =>
                    sum +
                    (Array.isArray(step?.toolResults)
                      ? step.toolResults.length
                      : 0),
                  0,
                )
              : 0,
            finishedAt: new Date().toISOString(),
            error: null,
          })),
        );

        log(
          `候选人 ${candidate.name} 已处理完成，结果：${completionState.summary}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        latestTask = await persistTask(
          updateCandidateInTask(latestTask, candidate.candidateId, current => ({
            ...current,
            status: 'failed',
            error: message,
            finishedAt: new Date().toISOString(),
          })),
        );
        log(`候选人 ${candidate.name} 处理失败：${message}`);
      }
    }

    const finalStatus = latestTask.failedCount > 0 ? 'failed' : 'completed';
    latestTask = await persistTask({
      ...latestTask,
      status: finalStatus,
      finishedAt: new Date().toISOString(),
      summary: buildTaskSummary(latestTask),
      error:
        finalStatus === 'failed'
          ? `任务已完成，但有 ${latestTask.failedCount} 位候选人处理失败。`
          : null,
    });

    return {
      taskId: latestTask.taskId,
      status: finalStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const aborted = abortSignal?.aborted;

    if (latestTask) {
      await persistTask({
        ...latestTask,
        status: aborted ? 'stopped' : 'failed',
        finishedAt: new Date().toISOString(),
        summary: aborted ? '任务已停止，可稍后继续处理未完成候选人。' : message,
        error: message,
      });
    }

    throw error;
  } finally {
    setMidsceneDebugSink(null);
    if (abortSignal) {
      abortSignal.removeEventListener('abort', handleAbort);
    }
    await destroyBrowserAgent();
  }
}
