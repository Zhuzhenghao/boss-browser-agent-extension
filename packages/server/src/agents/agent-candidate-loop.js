import { ToolLoopAgent, stepCountIs } from 'ai';
import { createLanguageModel } from './services/language-model.js';
import { writeSingleCandidateMarkdown } from './services/note-persistence.js';
import { createScreeningTools } from './tools/candidate-screening-tools.js';
import {
  createAgentStepHandler,
  finalizeCandidateResult,
} from './agent-step-handler.js';

/**
 * 运行所有候选人的 agent 循环。
 * 调用方确保已完成 navigateToChatPage + 候选人发现。
 */
export async function runCandidateAgentLoop({
  candidatesToProcess,
  browserAgent,
  effectiveTargetProfile,
  effectiveRejectionMessage,
  latestTaskRef,
  candidateRecords,
  operationLog,
  log,
  emitCandidateStageEvent,
  onToolEvent,
  updateCandidate,
  persistTask,
  abortSignal,
}) {
  for (const [index, candidate] of candidatesToProcess.entries()) {
    if (abortSignal?.aborted) break;

    const candidateIndex = index + 1;
    const progressLabel = `[${candidateIndex}/${candidatesToProcess.length}]`;
    log(`[${candidateIndex}/${candidatesToProcess.length}] 准备启动候选人 ${candidate.name} 的 agent（当前状态: ${candidate.status}）`);

    await updateCandidate(candidate.candidateId, current => ({
      ...current,
      status: 'running',
      startedAt: current.startedAt || new Date().toISOString(),
      error: null,
    }));

    log(`${progressLabel} 已找到候选人 ${candidate.name}，开始处理。`);

    // 恢复已有简历数据（继续任务时）
    const hasExistingResume = !!(candidate.resume || candidate.resumeSummary);
    if (hasExistingResume) {
      candidateRecords.set(candidate.candidateId, {
        resume: candidate.resume || null,
        resumeSegments: candidate.resumeSegments || [],
        resumeSummary: candidate.resumeSummary || '',
      });
      log(`${progressLabel} 已从 DB 恢复候选人 ${candidate.name} 的简历数据（摘要长度: ${(candidate.resumeSummary || candidate.resume?.summary || '').length}，段数: ${(candidate.resumeSegments || []).length}）`);
    } else {
      log(`${progressLabel} 候选人 ${candidate.name} 无已有简历数据，agent 将从头提取。`);
    }

    const persistCandidateRecord = async record => {
      const saved = await writeSingleCandidateMarkdown(record);
      if (!saved) return;
      await updateCandidate(record.candidateId, current => ({
        ...current,
        noteFile: saved,
      }));
    };

    const candidateTools = {
      ...createScreeningTools({
        browserAgent,
        candidateId: candidate.candidateId,
        candidateName: candidate.name,
        targetProfile: effectiveTargetProfile,
        rejectionMessage: effectiveRejectionMessage,
        operationLog,
        onProgress: progress => {
          if (progress?.latestToolEvent) {
            onToolEvent?.(progress.latestToolEvent);
          }
        },
        candidateRecords,
        abortSignal,
        persistCandidateRecord,
      }),
    };

    const existingRecord = candidateRecords.get(candidate.candidateId);
    const existingResumeSummary = existingRecord?.resume?.summary || candidate.resumeSummary || '';
    if (existingResumeSummary) {
      log(`${progressLabel} 候选人 ${candidate.name} 已有简历摘要，将注入 agent prompt（长度: ${existingResumeSummary.length}）`);
    }

    const agentInstructions = buildCandidateInstructions(
      effectiveTargetProfile,
      effectiveRejectionMessage,
      candidate.name,
      existingResumeSummary,
    );

    const candidateAgent = new ToolLoopAgent({
      model: createLanguageModel(),
      instructions: agentInstructions,
      tools: candidateTools,
      stopWhen: stepCountIs(12),
    });

    const stepHandler = createAgentStepHandler({
      candidate,
      candidateIndex,
      candidatesLength: candidatesToProcess.length,
      log,
      operationLog,
      latestTaskRef,
      candidateRecords,
      emitCandidateStageEvent,
      emitTaskStageEvent: () => {}, // 候选人阶段不需要发 task-stage 事件
      onToolEvent,
      onTaskUpdate: updateCandidate,
      updateCandidate,
      persistTask,
      taskId: latestTaskRef.current?.taskId,
      abortSignal,
    });

    try {
      log(`${progressLabel} 启动候选人 ${candidate.name} 的 ToolLoopAgent（最大步数: 12）`);
      const result = await candidateAgent.generate({
        prompt: `开始处理候选人 ${candidate.name}。`,
        abortSignal,
        onStepFinish: stepHandler,
      });

      await finalizeCandidateResult({
        candidate,
        candidateIndex,
        candidatesLength: candidatesToProcess.length,
        result,
        log,
        latestTaskRef,
        candidateRecords,
        emitCandidateStageEvent,
        updateCandidate,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateCandidate(candidate.candidateId, current => ({
        ...current,
        status: 'failed',
        error: message,
        finishedAt: new Date().toISOString(),
      }));
      log(`${progressLabel} 候选人 ${candidate.name} 处理失败：${message}`);
    }
  }
}

function buildCandidateInstructions(targetProfile, rejectionMessage, candidateName, existingResumeSummary = '') {
  const resumeContext = existingResumeSummary
    ? `
该候选人上次已提取过简历，摘要如下：
${existingResumeSummary}

如果上述摘要信息足以判断是否匹配，你可以直接做出决策，无需重新提取简历。
如果信息不足或你认为需要更详细的内容，可以重新打开并提取简历。
`
    : '';

  return `
你是一个招聘筛选执行 agent。你这一次只处理一个候选人：${candidateName}。

目标候选人特征：
${targetProfile}

不匹配时发送给候选人的消息：
${rejectionMessage}
${resumeContext}
约束：
1. 只处理候选人"${candidateName}"。
2. 调用任何聊天操作前，先 read_chat_context 确认 isChatReady。
3. isChatReady=false 时必须先调用 navigate_to_candidate。
4. 查看简历：open_candidate_resume → extract_candidate_resume → close_candidate_resume（三步按顺序执行）。
5. extract_candidate_resume 只负责提取简历，不会替你判断是否匹配；你必须根据简历内容和岗位要求自行判断。
6. 操作工具和校验工具已经拆开，必须显式调用校验工具，不要默认动作已经成功。
7. 如果判定匹配，严格使用这个顺序：
   read_request_resume_status → 若未发起则 request_resume → 再次 read_request_resume_status 确认成功；
   read_pin_status → 若未置顶则 pin_candidate → 再次 read_pin_status 确认成功。
8. 如果判定不匹配，严格使用这个顺序：
   send_rejection_message → read_rejection_message_status 确认消息已发送。
9. 调用 request_resume 或 send_rejection_message 时，务必传入简短明确的 reason，概括你的判断依据。
10. 只有在校验工具明确返回成功后，才算动作闭环完成。

最终输出简洁总结：
- 候选人姓名
- 是否匹配
- 执行动作
- 一句话原因
  `.trim();
}
