import { ToolLoopAgent, stepCountIs } from 'ai';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { createLanguageModel } from './services/language-model.js';
import { writeSingleCandidateMarkdown } from './services/note-persistence.js';
import { createScreeningTools } from './tools/unread-screening-tools.js';

const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

function simplifySingleStep(step, index = 0) {
  return {
    stepNumber: index + 1,
    text: step?.text || '',
    finishReason: step?.finishReason || '',
    usage: step?.usage || null,
    toolCalls: Array.isArray(step?.toolCalls)
      ? step.toolCalls.map(call => ({
          toolName: call?.toolName || '',
          input: call?.input || null,
        }))
      : [],
    toolResults: Array.isArray(step?.toolResults)
      ? step.toolResults.map(result => ({
          toolName: result?.toolName || '',
          output: result?.output || null,
        }))
      : [],
  };
}

function simplifyAgentSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps.map((step, index) => ({
    stepNumber: index + 1,
    text: step?.text || '',
    finishReason: step?.finishReason || '',
    toolCalls: Array.isArray(step?.toolCalls)
      ? step.toolCalls.map(call => ({
          toolName: call?.toolName || '',
          input: call?.input || null,
        }))
      : [],
    toolResults: Array.isArray(step?.toolResults)
      ? step.toolResults.map(result => ({
          toolName: result?.toolName || '',
          output: result?.output || null,
        }))
      : [],
  }));
}

function buildAgentInstructions(targetProfile, rejectionMessage) {
  return `
你是一个招聘筛选执行 agent。你的任务是在 Boss 直聘沟通页中处理所有未读消息候选人。

目标候选人特征：
${targetProfile}

不匹配时发送给候选人的消息：
${rejectionMessage}

你必须遵守下面的流程：
1. 先打开沟通页并切换到未读消息列表。
2. 获取所有未读消息发送人的名字。
3. 按名字逐个处理候选人，不要跳过。
4. 对每个候选人，都必须调用 inspect_candidate_resume 获取在线简历的视觉提取结果。
5. 你根据目标候选人特征判断是否匹配。
6. 匹配就先调用 request_resume，再调用 pin_candidate。
7. 不匹配就调用 reject_candidate，并使用默认拒绝消息，除非我另行说明。
8. 每处理完一个候选人，都调用 return_to_unread_list。
9. 调用 request_resume 或 reject_candidate 时，必须额外传入一个简短的中文 reason 字段，长度控制在 1 句话，用来概括你做出该判断的主要依据。

判断时要谨慎：
- 重点看候选人的项目经验、行业背景、岗位方向、年限、核心技能、教育背景。
- 如果信息不足，默认判为不匹配，并说明是因为证据不足。
- 不要臆造页面中不存在的信息。

最终输出请简洁总结：
- 总共处理了多少人
- 哪些人匹配并已要简历且置顶
- 哪些人不匹配并已发送消息
- 每个人一句原因
  `.trim();
}

export async function runUnreadScreeningAgent({
  targetProfile,
  rejectionMessage = DEFAULT_REJECTION_MESSAGE,
  onProgress,
}) {
  if (!String(targetProfile || '').trim()) {
    throw new Error('请先填写目标候选人的特征');
  }

  const browserAgent = new AgentOverChromeBridge({
    allowRemoteAccess: false,
    closeNewTabsAfterDisconnect: false,
  });

  const operationLog = [];
  const candidateRecords = new Map();
  const persistedNoteFiles = [];
  const pushProgress = partial => {
    if (typeof onProgress === 'function') {
      onProgress(partial);
    }
  };
  const log = message => {
    operationLog.push(
      `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`,
    );
    pushProgress({
      status: 'running',
      operationLog: [...operationLog],
    });
  };

  try {
    log('正在连接当前已打开的 Chrome 标签页。');
    await browserAgent.connectCurrentTab({ forceSameTabNavigation: true });
    log('已连接到当前 Chrome 标签页，准备启动筛选流程。');

    const screeningAgent = new ToolLoopAgent({
      model: createLanguageModel(),
      instructions: buildAgentInstructions(
        String(targetProfile).trim(),
        String(rejectionMessage).trim(),
      ),
      tools: createScreeningTools({
        browserAgent,
        targetProfile: String(targetProfile).trim(),
        rejectionMessage: String(rejectionMessage).trim(),
        operationLog,
        onProgress: pushProgress,
        candidateRecords,
        persistCandidateRecord: async record => {
          const saved = await writeSingleCandidateMarkdown(record);
          if (saved) {
            const existingIndex = persistedNoteFiles.findIndex(
              item => item.name === saved.name,
            );
            if (existingIndex >= 0) {
              persistedNoteFiles[existingIndex] = saved;
            } else {
              persistedNoteFiles.push(saved);
            }
          }
        },
      }),
      stopWhen: stepCountIs(30),
    });

    pushProgress({
      status: 'running',
      operationLog: [...operationLog],
      steps: [],
      summary: '',
    });

    const result = await screeningAgent.generate({
      prompt: '开始执行未读消息候选人筛选任务。',
      onStepFinish: async stepResult => {
        pushProgress({
          status: 'running',
          operationLog: [...operationLog],
          latestStep: simplifySingleStep(
            stepResult,
            Number(stepResult?.stepNumber || 0),
          ),
        });
      },
    });

    const finalResult = {
      summary: result?.text || '任务执行完成',
      usage: result?.usage || null,
      finishReason: result?.finishReason || null,
      steps: simplifyAgentSteps(result?.steps),
      operationLog,
      noteFiles: persistedNoteFiles,
    };

    pushProgress({
      ...finalResult,
      status: 'completed',
    });

    return finalResult;
  } finally {
    await browserAgent.destroy();
  }
}
