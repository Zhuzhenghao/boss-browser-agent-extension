import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import {
  createScreeningTask,
  getTaskCandidatesForMode,
  persistScreeningTask,
  prepareTaskForResume,
  readScreeningTask,
} from './services/task-persistence.js';
import {
  navigateToChatIndex,
  openChatIndex,
  readUnreadCandidates,
  switchToJobPosition,
  switchToUnread,
} from './tools/task-discovery.js';
import { setupAgentContext } from './agent-context.js';
import { runCandidateAgentLoop } from './agent-candidate-loop.js';
import { buildTaskSummary } from './agent-step-handler.js';
import { setMidsceneDebugSink } from './services/midscene-debug.js';

const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

// ---- 浏览器导航 ----

/**
 * 导航到 BOSS 沟通页，并可选切换到"未读"筛选。
 * 导航完成后总是切换到指定岗位（如果提供了 jobTitle）。
 */
async function navigateToChatPage({
  browserAgent,
  jobTitle,
  log,
  runTaskStage,
  switchToUnread: doSwitchToUnread,
}) {
  if (doSwitchToUnread) {
    log('准备打开 Boss 直聘沟通页（自动发现模式）');
    await runTaskStage(
      'open_chat_index',
      '准备打开 Boss 直聘沟通页。',
      () => openChatIndex(browserAgent, log),
      () => '已打开 Boss 直聘沟通页并切换到未读筛选。',
    );
  } else {
    log('准备打开 Boss 直聘沟通页（指定候选人模式）');
    await runTaskStage(
      'open_chat_index',
      '准备打开 Boss 直聘沟通页。',
      () => navigateToChatIndex(browserAgent),
      () => '已打开 Boss 直聘沟通页。',
    );
  }

  if (jobTitle && String(jobTitle).trim()) {
    log(`准备切换到招聘岗位：${jobTitle}`);
    await runTaskStage(
      'switch_to_job_position',
      `准备切换到招聘岗位：${jobTitle}`,
      () => switchToJobPosition(browserAgent, jobTitle, log),
      result => result?.ok
        ? `已切换到招聘岗位：${jobTitle}`
        : `切换岗位失败，继续使用当前岗位`,
    );
  }
}

// ---- 启动路径：自动发现未读候选人模式 ----

/**
 * 读取未读候选人名单并创建任务。
 * 调用方已确保处于"未读"筛选视图中。
 */
async function discoverUnreadCandidates({
  browserAgent,
  targetProfile,
  rejectionMessage,
  taskId,
  jobTitle,
  jobProfileId,
  log,
  persistTask,
  runTaskStage,
}) {
  log('准备读取当前未读候选人名单');
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
  const unreadNames = Array.isArray(unreadResult?.names) ? unreadResult.names : [];

  log('准备根据未读名单创建巡检任务');
  const task = await runTaskStage(
    'create_task',
    '准备根据未读名单创建巡检任务。',
    async () => {
      const createdTask = await persistScreeningTask(
        createScreeningTask({
          targetProfile,
          rejectionMessage,
          unreadCandidates: unreadNames,
          taskId,
          jobTitle,
          jobProfileId,
        }),
      );
      return persistTask({
        ...createdTask,
        status: unreadNames.length ? 'running' : 'completed',
        summary: unreadNames.length
          ? `已发现 ${unreadNames.length} 位未读候选人，准备处理。`
          : '当前没有未读候选人。',
      });
    },
    () => (
      unreadNames.length
        ? `任务已创建，待处理候选人 ${unreadNames.length} 位。`
        : '任务已创建，但当前没有未读候选人。'
    ),
  );

  log(`已创建巡检任务 ${task.taskId}，待处理候选人 ${unreadNames.length} 位。`);
  return { task, unreadNames };
}

// ---- 主入口 ----

export async function runUnreadScreeningAgent({
  targetProfile,
  rejectionMessage = DEFAULT_REJECTION_MESSAGE,
  taskId = '',
  jobTitle = '',
  jobProfileId = null,
  testCandidateNames = [],
  mode = 'start',
  onToolEvent,
  onTaskUpdate,
  abortSignal,
}) {
  const hasSpecifiedCandidates = Array.isArray(testCandidateNames) && testCandidateNames.length > 0;
  let effectiveTargetProfile = String(targetProfile || '').trim();
  let effectiveRejectionMessage = String(rejectionMessage || '').trim();

  const browserAgent = new AgentOverChromeBridge({
    autoSwitchTab: true,
    forceSameTabNavigation: true,
    closeNewTabsAfterDisconnect: false,
  });

  const ctx = setupAgentContext({
    taskId,
    onToolEvent,
    onTaskUpdate,
    abortSignal,
    browserAgent,
  });

  // 在 ctx 解构后，abort handler 才能用 log
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => {
      ctx.log('收到停止信号，正在尝试中断当前 Midscene 操作。');
      void ctx.destroyBrowserAgent();
    }, { once: true });
  }

  const {
    log,
    logDebug,
    persistTask,
    runTaskStage,
    emitTaskStageEvent,
    updateCandidate,
    destroyBrowserAgent,
    latestTaskRef,
  } = ctx;

  const ensureNotAborted = () => {
    if (abortSignal?.aborted) {
      throw abortSignal.reason instanceof Error
        ? abortSignal.reason
        : new Error('任务已停止');
    }
  };

  setMidsceneDebugSink(logDebug);

  let candidatesToProcess = [];

  try {
    // 预加载已有任务
    const existingTaskId = String(taskId || '').trim();
    if (existingTaskId) {
      latestTaskRef.current = await readScreeningTask(existingTaskId);
      if (latestTaskRef.current) {
        onTaskUpdate?.(latestTaskRef.current);
      }
    }

    ensureNotAborted();
    log('正在连接当前已打开的 Chrome 标签页。');
    await browserAgent.connectCurrentTab({ forceSameTabNavigation: true });
    log('已连接到当前 Chrome 标签页，准备启动巡检任务。');

    log(`[Info] mode=${mode}, specifiedCandidates=${hasSpecifiedCandidates ? testCandidateNames.length : 0}`);

    if (mode === 'start') {
      // 步骤 1：导航 + 切换岗位
      log(`[Debug] 开始导航，hasSpecifiedCandidates=${hasSpecifiedCandidates}`);
      await navigateToChatPage({
        browserAgent,
        jobTitle,
        log,
        runTaskStage,
        switchToUnread: !hasSpecifiedCandidates,
      });
      log(`[Debug] 导航完成`);

      // 步骤 2：按模式发现候选人
      if (hasSpecifiedCandidates) {
        // 指定候选人模式：从 DB 读取占位任务
        log(`指定候选人模式：准备处理 ${testCandidateNames.length} 位候选人`);
        log(`候选人名单：${testCandidateNames.join('、')}`);

        await runTaskStage(
          'load_task',
          '准备确认占位任务已加载。',
          async () => {
            if (!latestTaskRef.current) {
              latestTaskRef.current = await readScreeningTask(String(taskId).trim());
            }
            log(`[Debug] load_task: latestTaskRef.current=${latestTaskRef.current ? latestTaskRef.current.taskId : 'null'}, candidates=${(latestTaskRef.current?.candidates || []).length}`);
            return latestTaskRef.current;
          },
          task => task
            ? `已确认任务 ${task.taskId}，${(task.candidates || []).length} 位候选人`
            : '任务不存在',
        );

        if (!latestTaskRef.current) {
          throw new Error(`任务 ${taskId} 不存在，可能 controller 未正确创建占位任务`);
        }

        candidatesToProcess = latestTaskRef.current.candidates || [];
        log(`准备处理 ${candidatesToProcess.length} 位候选人`);
        onTaskUpdate?.(latestTaskRef.current);
      } else {
        // 自动发现模式：切换到未读筛选，读取名单，创建任务
        const result = await discoverUnreadCandidates({
          browserAgent,
          targetProfile: effectiveTargetProfile,
          rejectionMessage: effectiveRejectionMessage,
          taskId,
          jobTitle,
          jobProfileId,
          log,
          persistTask,
          runTaskStage,
        });
        latestTaskRef.current = result.task;
        candidatesToProcess = result.task.candidates;
      }
    } else {
      // resume 模式：从 DB 恢复任务
      latestTaskRef.current = await readScreeningTask(String(taskId).trim());
      if (!latestTaskRef.current) {
        throw new Error(`任务 ${taskId} 不存在`);
      }
      effectiveTargetProfile = latestTaskRef.current.targetProfile;
      effectiveRejectionMessage = latestTaskRef.current.rejectionMessage;

      const resumeMode = mode === 'retry-failed' ? 'retry-failed' : 'unfinished';
      log(`[Resume] 从 DB 读取任务 ${latestTaskRef.current.taskId}，当前候选人状态：${latestTaskRef.current.candidates.map(c => `${c.name}(${c.status}${c.resumeSummary ? ',有简历' : ''})`).join('、')}`);

      latestTaskRef.current = await persistTask({
        ...prepareTaskForResume(latestTaskRef.current, resumeMode),
        status: 'running',
      });
      candidatesToProcess = getTaskCandidatesForMode(latestTaskRef.current, resumeMode);

      log(`[Resume] 重置后待处理候选人 ${candidatesToProcess.length} 位：${candidatesToProcess.map(c => `${c.name}(${c.status}${c.resume ? ',简历已恢复' : ''})`).join('、')}`);
      log(`[Resume] 跳过任务准备阶段，直接恢复已有候选人处理流程。`);
    }

    // 步骤 3：处理所有候选人
    await runCandidateAgentLoop({
      candidatesToProcess,
      browserAgent,
      effectiveTargetProfile,
      effectiveRejectionMessage,
      latestTaskRef,
      candidateRecords: ctx.candidateRecords,
      operationLog: ctx.operationLog,
      log,
      emitCandidateStageEvent: ctx.emitCandidateStageEvent,
      onToolEvent,
      updateCandidate,
      persistTask,
      abortSignal,
    });

    // 步骤 4：任务收尾
    const finalStatus = latestTaskRef.current.failedCount > 0 ? 'failed' : 'completed';
    const finalSummary = (latestTaskRef.current.unreadCandidateCount || 0) === 0
      ? '本次巡检未发现未读候选人，任务已完成。'
      : buildTaskSummary(latestTaskRef.current);
    latestTaskRef.current = await persistTask({
      ...latestTaskRef.current,
      status: finalStatus,
      finishedAt: new Date().toISOString(),
      summary: finalSummary,
      error: finalStatus === 'failed'
        ? `任务已完成，但有 ${latestTaskRef.current.failedCount} 位候选人处理失败。`
        : null,
    });

    return {
      taskId: latestTaskRef.current.taskId,
      status: finalStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const aborted = abortSignal?.aborted;

    if (latestTaskRef.current) {
      await persistTask({
        ...latestTaskRef.current,
        status: aborted ? 'stopped' : 'failed',
        finishedAt: new Date().toISOString(),
        summary: aborted ? '任务已停止，可稍后继续处理未完成候选人。' : message,
        error: message,
      });
    }

    await destroyBrowserAgent();

    if (aborted) {
      return { taskId: latestTaskRef.current?.taskId, status: 'stopped' };
    }
    throw error;
  } finally {
    await destroyBrowserAgent();
  }
}
