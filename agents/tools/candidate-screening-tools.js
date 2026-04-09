import { tool } from 'ai';
import { z } from 'zod';
import { wait, ensureCandidateChatReady } from '../services/browser-actions.js';
import {
  closeCandidateResume,
  extractCandidateResume,
  normalizeText,
  openCandidateChat,
  openCandidateResume,
} from '../services/resume-service.js';

const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

function summarizeToolEvent(toolName, phase, payload) {
  const name =
    typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : '';

  if (phase === 'call') {
    switch (toolName) {
      case 'open_candidate_chat':
        return `准备打开 ${name || '候选人'} 的聊天会话`;
      case 'open_candidate_resume':
        return `准备打开 ${name || '候选人'} 的在线简历`;
      case 'extract_candidate_resume':
        return `准备提取 ${name || '候选人'} 的在线简历内容`;
      case 'close_candidate_resume':
        return `准备关闭 ${name || '候选人'} 的在线简历`;
      case 'request_resume':
        return `准备向 ${name || '候选人'} 发起求简历`;
      case 'pin_candidate':
        return `准备置顶 ${name || '候选人'}`;
      case 'send_rejection_message':
        return `准备向 ${name || '候选人'} 发送不匹配消息`;
      case 'read_chat_context':
        return `准备读取 ${name || '候选人'} 的聊天上下文`;
      default:
        return `${toolName} 开始执行`;
    }
  }

  if (phase === 'error') {
    return payload?.message
      ? `执行失败：${payload.message}`
      : `${toolName} 执行失败`;
  }

  switch (toolName) {
    case 'open_candidate_chat':
      return `已进入 ${name || '候选人'} 的聊天会话`;
    case 'open_candidate_resume':
      return `已打开 ${name || '候选人'} 的在线简历`;
    case 'extract_candidate_resume':
      return `已完成 ${name || '候选人'} 的简历提取`;
    case 'close_candidate_resume':
      return `已关闭 ${name || '候选人'} 的在线简历`;
    case 'request_resume':
      return `已向 ${name || '候选人'} 发起求简历`;
    case 'pin_candidate':
      return payload?.alreadyPinned
        ? `${name || '候选人'} 已经是置顶状态`
        : `已置顶 ${name || '候选人'}`;
    case 'send_rejection_message':
      return payload?.sent === true
        ? `已向 ${name || '候选人'} 发送不匹配消息`
        : `未能确认已向 ${name || '候选人'} 发送不匹配消息`;
    case 'read_chat_context':
      return `已读取 ${name || '候选人'} 的聊天上下文`;
    default:
      return `${toolName} 执行完成`;
  }
}

export function createScreeningTools({
  browserAgent,
  candidateId,
  candidateName,
  rejectionMessage,
  operationLog,
  onProgress,
  candidateRecords,
  abortSignal,
  persistCandidateRecord,
}) {
  const getCandidateRecord = () => candidateRecords.get(candidateId) || {};
  const setCandidateRecord = updates => {
    candidateRecords.set(candidateId, {
      ...getCandidateRecord(),
      candidateId,
      name: candidateName,
      ...updates,
    });
  };

  const ensureNotAborted = () => {
    if (abortSignal?.aborted) {
      throw abortSignal.reason instanceof Error
        ? abortSignal.reason
        : new Error('任务已停止');
    }
  };

  const ensureCurrentCandidate = name => {
    if (name !== candidateName) {
      throw new Error(`当前 agent 只能处理候选人 ${candidateName}，不能处理 ${name}。`);
    }
  };

  const log = message => {
    operationLog.push(
      `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`,
    );
    if (typeof onProgress === 'function') {
      onProgress({
        status: 'running',
      });
    }
  };

  const notifyToolCall = (toolName, input) => {
    if (typeof onProgress === 'function') {
      onProgress({
        status: 'running',
        latestToolEvent: {
          phase: 'call',
          toolName,
          candidateId,
          candidateName:
            typeof input?.name === 'string' && input.name.trim()
              ? input.name.trim()
              : candidateName,
          summary: summarizeToolEvent(toolName, 'call', input ?? {}),
          payload: input ?? {},
          at: new Date().toISOString(),
        },
      });
    }
  };

  const notifyToolResult = (toolName, output, error) => {
    if (typeof onProgress === 'function') {
      onProgress({
        status: error ? 'error' : 'running',
        latestToolEvent: {
          phase: error ? 'error' : 'result',
          toolName,
          candidateId,
          candidateName:
            typeof output?.name === 'string' && output.name.trim()
              ? output.name.trim()
              : candidateName,
          summary: summarizeToolEvent(
            toolName,
            error ? 'error' : 'result',
            error ? { message: String(error) } : (output ?? {}),
          ),
          payload: error ? { message: String(error) } : (output ?? {}),
          at: new Date().toISOString(),
        },
      });
    }
  };

  const wrapTool =
    (toolName, execute) =>
    async (input = {}) => {
      ensureNotAborted();
      notifyToolCall(toolName, input);

      try {
        const output = await execute(input);
        ensureNotAborted();
        notifyToolResult(toolName, output);
        return output;
      } catch (error) {
        notifyToolResult(
          toolName,
          null,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    };

  return {
    open_candidate_chat: tool({
      description: '进入指定候选人的聊天会话，只负责打开聊天，不做简历或其他动作。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('open_candidate_chat', async ({ name }) => {
        ensureCurrentCandidate(name);
        const result = await openCandidateChat({
          browserAgent,
          name,
          log,
        });
        setCandidateRecord({
          chatOpened: true,
        });
        return result;
      }),
    }),

    open_candidate_resume: tool({
      description: '在当前候选人聊天会话中打开在线简历，只负责打开，不做提取或关闭。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('open_candidate_resume', async ({ name }) => {
        ensureCurrentCandidate(name);
        const result = await openCandidateResume({
          browserAgent,
          name,
          log,
        });
        setCandidateRecord({
          resumeOpened: true,
        });
        return result;
      }),
    }),

    extract_candidate_resume: tool({
      description: '提取当前已打开的在线简历内容，只负责采集与结构化提取。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('extract_candidate_resume', async ({ name }) => {
        ensureCurrentCandidate(name);
        const result = await extractCandidateResume({
          browserAgent,
          candidateId,
          name,
          log,
          candidateRecords,
        });
        setCandidateRecord({
          inspected: true,
          resumeOpened: true,
        });
        log(`已完成候选人 ${name} 的简历检查，下一步请根据提取结果决定后续动作。`);
        return result;
      }),
    }),

    close_candidate_resume: tool({
      description: '关闭当前在线简历层，回到候选人聊天会话。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('close_candidate_resume', async ({ name }) => {
        ensureCurrentCandidate(name);
        const result = await closeCandidateResume({
          browserAgent,
          name,
          log,
        });
        setCandidateRecord({
          resumeOpened: false,
        });
        return result;
      }),
    }),

    request_resume: tool({
      description: '在当前候选人聊天会话里执行“求简历/要简历”动作。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
        reason: z.string().optional().describe('一句话说明为什么判定该候选人符合'),
      }),
      execute: wrapTool('request_resume', async ({ name, reason }) => {
        ensureCurrentCandidate(name);
        await ensureCandidateChatReady(browserAgent, name);
        await browserAgent.aiAct(
          `返回到名字为“${name}”的聊天会话页面。在聊天区域底部的操作工具条中，优先找到文字为“求简历”的按钮并点击。如果“求简历”不可用，再查找“要简历”按钮。若点击后出现确认弹窗、二次确认按钮或简历请求确认提示，就继续确认，直到成功向该候选人发起求简历。不要误点“换电话”“换微信”“约面试”或“不合适”。`,
        );
        await wait(1200);
        const requestState = await browserAgent.aiQuery(
          `现在只观察名字为“${name}”的聊天会话底部操作区和最近消息区域。请判断是否已经成功向该候选人发起“求简历/要简历”。只返回 JSON：{"requested":true|false,"reason":"一句中文依据"}。`,
        );
        if (requestState?.requested !== true) {
          throw new Error(
            normalizeText(requestState?.reason) || '未能确认已成功发起求简历。',
          );
        }
        const nextRecord = {
          ...getCandidateRecord(),
          candidateId,
          name,
          resumeRequested: true,
          requestResumeReason:
            normalizeText(reason) || 'Agent 判定该候选人符合目标候选人特征。',
        };
        candidateRecords.set(candidateId, nextRecord);
        await persistCandidateRecord(nextRecord);
        log(`已向候选人 ${name} 发起要简历。`);
        return {
          ok: true,
          name,
          requested: true,
          reason: normalizeText(requestState?.reason) || '',
        };
      }),
    }),

    pin_candidate: tool({
      description: '将指定候选人的聊天会话置顶。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('pin_candidate', async ({ name }) => {
        ensureCurrentCandidate(name);
        await ensureCandidateChatReady(browserAgent, name);

        const pinState = await browserAgent.aiQuery(
          `现在只观察名字为“${name}”的聊天会话页面右侧竖排工具栏中的“置顶当前会话”图标。这个图标像一个向上箭头进入一条横线/托盘，通常位于“收藏”图标下面、“更多”图标上面。请判断它当前是否已经处于置顶选中状态。只返回 JSON：{"alreadyPinned":true|false,"reason":"一句简短中文判断依据"}。如果页面上已经出现“取消置顶”“已置顶”相关明确语义，或者图标明显处于选中/激活态，就返回 true。`,
        );

        if (pinState?.alreadyPinned === true) {
          setCandidateRecord({
            pinned: true,
          });
          log(`候选人 ${name} 当前已经是置顶状态，本次不再重复点击。`);
          return {
            ok: true,
            name,
            alreadyPinned: true,
            reason: normalizeText(pinState?.reason) || '检测到当前会话已经置顶。',
          };
        }

        if (typeof browserAgent?.aiTap === 'function') {
          await browserAgent.aiTap(
            `名字为“${name}”的聊天会话页面右侧竖排工具栏中的“置顶当前会话”图标。这个图标像一个向上箭头进入一条横线/托盘，位于“收藏”图标下面、“更多”图标上面。只点击这一个图标，不要误点其他按钮。`,
          );
        } else {
          await browserAgent.aiAct(
            `返回到名字为“${name}”的聊天会话页面。然后只观察聊天区域右侧的竖排工具栏，找到“置顶当前会话”的图标并点击。这个图标的特征是：像一个向上箭头进入一条横线/托盘，位于右侧竖排工具栏中部，通常在“收藏”图标下面、“更多”图标上面。不要误点收藏、更多、关闭简历、在线简历、附件简历或其他按钮。点击成功后停止。`,
          );
        }
        await wait(1200);
        const pinVerify = await browserAgent.aiQuery(
          `现在只观察名字为“${name}”的聊天会话页面右侧竖排工具栏中的“置顶当前会话”图标。请判断它现在是否已经处于置顶选中状态。只返回 JSON：{"alreadyPinned":true|false,"reason":"一句简短中文判断依据"}。`,
        );
        if (pinVerify?.alreadyPinned !== true) {
          throw new Error(
            normalizeText(pinVerify?.reason) || '未能确认当前会话已经置顶。',
          );
        }
        setCandidateRecord({
          pinned: true,
        });
        log(`已对候选人 ${name} 执行置顶。`);
        return {
          ok: true,
          name,
          alreadyPinned: false,
          reason: normalizeText(pinVerify?.reason) || '',
        };
      }),
    }),

    send_rejection_message: tool({
      description: '在当前候选人聊天会话中发送不匹配消息。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
        message: z.string().optional().describe('发送给候选人的消息'),
        reason: z.string().optional().describe('一句话说明为什么判定该候选人不符合'),
      }),
      execute: wrapTool('send_rejection_message', async ({ name, message, reason }) => {
        ensureCurrentCandidate(name);
        const finalMessage = String(
          message || rejectionMessage || DEFAULT_REJECTION_MESSAGE,
        ).trim();
        await ensureCandidateChatReady(browserAgent, name);
        await browserAgent.aiAct(
          `返回到名字为“${name}”的聊天会话，在输入框中输入“${finalMessage}”，然后发送消息。`,
        );
        await wait(1200);
        const sendState = await browserAgent.aiQuery(
          `现在只观察名字为“${name}”的聊天会话最近消息区域。请判断刚才发送给候选人的消息“${finalMessage}”是否已经成功出现在会话中。只返回 JSON：{"sent":true|false,"reason":"一句中文依据"}。`,
        );
        if (sendState?.sent !== true) {
          return {
            ok: false,
            name,
            sent: false,
            message: finalMessage,
            reason: normalizeText(sendState?.reason) || '未能确认不匹配消息已经发送成功。',
          };
        }
        const nextRecord = {
          ...getCandidateRecord(),
          candidateId,
          name,
          sentRejectionMessage: true,
          rejectionReason:
            normalizeText(reason) || 'Agent 判定该候选人不符合目标候选人特征。',
          rejectionMessage: finalMessage,
        };
        candidateRecords.set(candidateId, nextRecord);
        await persistCandidateRecord(nextRecord);
        log(`已向候选人 ${name} 发送不匹配消息。`);
        return {
          ok: true,
          name,
          sent: true,
          message: finalMessage,
          reason: normalizeText(sendState?.reason) || '',
        };
      }),
    }),

    read_chat_context: tool({
      description: '读取当前候选人聊天会话中的关键信息，例如是否已在聊天页、是否出现求简历按钮、是否有历史消息。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('read_chat_context', async ({ name }) => {
        ensureCurrentCandidate(name);
        const context = await browserAgent.aiQuery(
          `只观察名字为“${name}”的当前聊天会话主视图。读取关键信息，只返回 JSON：{"isChatReady":true|false,"hasResumeButton":true|false,"hasRequestResumeButton":true|false,"hasHistoryMessages":true|false,"summary":"一句中文摘要"}。`,
        );
        return {
          ok: true,
          name,
          isChatReady: context?.isChatReady === true,
          hasResumeButton: context?.hasResumeButton === true,
          hasRequestResumeButton: context?.hasRequestResumeButton === true,
          hasHistoryMessages: context?.hasHistoryMessages === true,
          summary: normalizeText(context?.summary) || '',
        };
      }),
    }),
  };
}
