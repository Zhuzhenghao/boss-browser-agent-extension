function normalizeStepText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractTextPartsFromContent(content = []) {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .filter(part => part?.type === 'text' && typeof part?.text === 'string')
    .map(part => part.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function extractReasoningPartsFromContent(content = []) {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .filter(part => part?.type === 'reasoning' && typeof part?.text === 'string')
    .map(part => part.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function extractStepArtifacts(step) {
  const text = normalizeStepText(step?.text)
    || extractTextPartsFromContent(step?.content);
  const reasoningText = normalizeStepText(step?.reasoningText)
    || extractReasoningPartsFromContent(step?.content);
  return { text, reasoningText };
}

function summarizeStepDiagnostics(step) {
  const contentTypes = Array.isArray(step?.content)
    ? step.content.map(part => part?.type || 'unknown').join(', ')
    : '';
  const responseMessageRoles = Array.isArray(step?.response?.messages)
    ? step.response.messages.map(message => message?.role || 'unknown').join(', ')
    : '';
  return {
    hasText: Boolean(step?.text),
    hasContent: Boolean(contentTypes),
    hasReasoning: Boolean(step?.reasoningText),
    hasResponseMessages: Boolean(responseMessageRoles),
    stepNumber: step?.stepNumber,
    finishReason: step?.finishReason,
  };
}

function buildCandidateStageEvent({
  toolName,
  phase,
  summary,
  taskId,
  candidateId,
  candidateName,
  payload = {},
}) {
  return {
    phase,
    toolName,
    candidateId,
    candidateName,
    taskId,
    summary,
    payload,
    at: new Date().toISOString(),
  };
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

/**
 * 创建 onStepFinish 回调，注入到 ToolLoopAgent.generate() 中。
 * 所有模型推理/回复/工具调用都会通过 emitCandidateStageEvent 推送。
 */
export function createAgentStepHandler({
  candidate,
  log,
  emitCandidateStageEvent,
}) {
  let lastReasoningText = '';
  let lastStepText = '';

  return async function handleAgentStep(step) {
    const stepNum = step.stepNumber + 1;
    const toolNames = (step.toolCalls || []).map(tc => tc.toolName).join(', ');
    const { text: rawStepText, reasoningText: rawReasoningText } = extractStepArtifacts(step);
    const reasoningText = rawReasoningText && rawReasoningText !== lastReasoningText
      ? rawReasoningText
      : '';
    const stepText = rawStepText && rawStepText !== lastStepText
      ? rawStepText
      : '';

    console.log(`[agent-step] candidate=${candidate.name} ${JSON.stringify(summarizeStepDiagnostics(step))}`);

    // 模型推理（先发送）
    if (reasoningText) {
      lastReasoningText = reasoningText;
      console.log(`[agent-model] candidate=${candidate.name} step=${stepNum} reasoning=${JSON.stringify(reasoningText.substring(0, 300))}`);
      log(`[Agent] Step ${stepNum} 推理: ${reasoningText.substring(0, 300)}`);
      await emitCandidateStageEvent({
        toolName: 'model_reasoning',
        phase: 'log',
        summary: reasoningText,
        candidateId: candidate.candidateId,
        candidateName: candidate.name,
        payload: {
          stepNumber: stepNum,
          finishReason: step.finishReason || '',
          reasoningText,
        },
      });
    }

    // 模型回复
    if (stepText) {
      lastStepText = stepText;
      console.log(`[agent-model] candidate=${candidate.name} step=${stepNum} text=${JSON.stringify(stepText.substring(0, 500))}`);
      log(`[Agent] Step ${stepNum} 模型文本: ${stepText.substring(0, 500)}`);
      await emitCandidateStageEvent({
        toolName: 'model_response',
        phase: 'log',
        summary: stepText,
        candidateId: candidate.candidateId,
        candidateName: candidate.name,
        payload: {
          stepNumber: stepNum,
          finishReason: step.finishReason || '',
          text: stepText,
        },
      });
    }

    if (toolNames) {
      log(`[Agent] Step ${stepNum} 工具调用: ${toolNames}`);
    }
    if (!stepText && !reasoningText) {
      console.log(`[agent-model] candidate=${candidate.name} step=${stepNum} no-text-output toolCalls=${toolNames || 'none'}`);
    }
    log(`[Agent] Step ${stepNum} 完成（finishReason: ${step.finishReason}）`);
  };
}

/**
 * 处理单个候选人的 agent 执行结果。
 */
export async function finalizeCandidateResult({
  candidate,
  candidateIndex,
  candidatesLength,
  result,
  log,
  latestTaskRef,
  candidateRecords,
  emitCandidateStageEvent,
  updateCandidate,
}) {
  const stepCount = Array.isArray(result?.steps) ? result.steps.length : 0;
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const toolCallCount = steps.reduce(
    (sum, step) => sum + (Array.isArray(step?.toolCalls) ? step.toolCalls.length : 0),
    0,
  );
  const toolResultCount = steps.reduce(
    (sum, step) => sum + (Array.isArray(step?.toolResults) ? step.toolResults.length : 0),
    0,
  );
  log(`[${candidateIndex}/${candidatesLength}] 候选人 ${candidate.name} agent 执行完成（步数: ${stepCount}，工具调用: ${toolCallCount}）`);

  const fallbackFinalText = steps.length
    ? [...steps]
        .reverse()
        .map(step => extractStepArtifacts(step).text)
        .find(Boolean) || ''
    : '';
  const finalText = normalizeStepText(result?.text) || fallbackFinalText;

  if (finalText) {
    console.log(`[agent-model] candidate=${candidate.name} final=${JSON.stringify(finalText.substring(0, 500))}`);
    log(`[Agent] 模型最终输出: ${finalText.substring(0, 500)}`);
    await emitCandidateStageEvent({
      toolName: 'model_final_output',
      phase: 'result',
      summary: finalText,
      candidateId: candidate.candidateId,
      candidateName: candidate.name,
      payload: { text: finalText },
    });
  } else {
    console.log(`[agent-model] candidate=${candidate.name} final=<empty>`);
  }

  const finalRecord = candidateRecords.get(candidate.candidateId) || {};
  const completionState = evaluateCandidateCompletion(finalRecord);
  log(`[${candidateIndex}/${candidatesLength}] 候选人 ${candidate.name} 闭环检查：ok=${completionState.ok}, status=${completionState.status}, matched=${completionState.matched}`);
  if (!completionState.ok) {
    throw new Error(completionState.summary);
  }
  await updateCandidate(candidate.candidateId, current => ({
    ...current,
    status: completionState.status,
    matched: completionState.matched,
    reason: completionState.reason || '',
    rejectionMessage: finalRecord.rejectionMessage || '',
    resumeSummary: finalRecord.resume?.summary || '',
    resume: finalRecord.resume || null,
    resumeSegments: finalRecord.resumeSegments || [],
    stepCount,
    toolCallCount,
    toolResultCount,
    finishedAt: new Date().toISOString(),
    error: null,
  }));

  log(`[${candidateIndex}/${candidatesLength}] 候选人 ${candidate.name} 已处理完成，结果：${completionState.summary}`);
}

export { buildTaskSummary, buildTaskStageEvent };
