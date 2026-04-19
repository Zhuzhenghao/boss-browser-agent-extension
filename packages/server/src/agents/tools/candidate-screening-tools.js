import { tool } from 'ai';
import { z } from 'zod';
import { wait } from '../services/browser-actions.js';
import {
  closeCandidateResume,
  extractCandidateResume,
  normalizeText,
  openCandidateChat,
  openCandidateResume,
} from '../services/resume-service.js';
import {
  ensureSelectableCandidateList,
  searchAndSelectCandidate,
} from './task-discovery.js';

const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

function summarizeToolEvent(toolName, phase, payload) {
  const name =
    typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : '';

  if (phase === 'call') {
    switch (toolName) {
      case 'navigate_to_candidate':
        return `准备导航到 ${name || '候选人'} 的聊天会话`;
      case 'open_candidate_resume':
        return `准备打开 ${name || '候选人'} 的在线简历`;
      case 'extract_candidate_resume':
        return `准备提取 ${name || '候选人'} 的在线简历内容`;
      case 'close_candidate_resume':
        return `准备关闭 ${name || '候选人'} 的在线简历`;
      case 'request_resume':
        return `准备向 ${name || '候选人'} 发起求简历`;
      case 'read_request_resume_status':
        return `准备读取 ${name || '候选人'} 的求简历状态`;
      case 'pin_candidate':
        return `准备置顶 ${name || '候选人'}`;
      case 'read_pin_status':
        return `准备读取 ${name || '候选人'} 的置顶状态`;
      case 'send_rejection_message':
        return `准备向 ${name || '候选人'} 发送不匹配消息`;
      case 'read_rejection_message_status':
        return `准备读取 ${name || '候选人'} 的消息发送状态`;
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
    case 'navigate_to_candidate':
      return payload?.ready === true
        ? `已进入 ${name || '候选人'} 的聊天会话`
        : `未能进入 ${name || '候选人'} 的聊天会话`;
    case 'open_candidate_resume':
      return `已打开 ${name || '候选人'} 的在线简历`;
    case 'extract_candidate_resume':
      return `已完成 ${name || '候选人'} 的简历提取`;
    case 'close_candidate_resume':
      return `已关闭 ${name || '候选人'} 的在线简历`;
    case 'request_resume':
      return `已向 ${name || '候选人'} 发起求简历`;
    case 'read_request_resume_status':
      return payload?.requested === true
        ? `已确认 ${name || '候选人'} 的求简历已发起`
        : `尚未确认 ${name || '候选人'} 的求简历已发起`;
    case 'pin_candidate':
      return payload?.alreadyPinned
        ? `${name || '候选人'} 已经是置顶状态`
        : `已置顶 ${name || '候选人'}`;
    case 'read_pin_status':
      return payload?.alreadyPinned
        ? `已确认 ${name || '候选人'} 当前处于置顶状态`
        : `尚未确认 ${name || '候选人'} 当前处于置顶状态`;
    case 'send_rejection_message':
      return payload?.sent === true
        ? `已向 ${name || '候选人'} 发送不匹配消息`
        : `未能确认已向 ${name || '候选人'} 发送不匹配消息`;
    case 'read_rejection_message_status':
      return payload?.sent === true
        ? `已确认 ${name || '候选人'} 的消息发送成功`
        : `尚未确认 ${name || '候选人'} 的消息发送成功`;
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
  const buildCandidateRecord = updates => ({
    ...getCandidateRecord(),
    candidateId,
    name: candidateName,
    ...updates,
  });
  const setCandidateRecord = updates => {
    candidateRecords.set(candidateId, buildCandidateRecord(updates));
  };
  const persistCandidateState = async updates => {
    const nextRecord = buildCandidateRecord(updates);
    candidateRecords.set(candidateId, nextRecord);
    await persistCandidateRecord(nextRecord);
    return nextRecord;
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
      throw new Error(
        `当前 agent 只能处理候选人 ${candidateName}，不能处理 ${name}。`,
      );
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

  const buildProgressEvent = (toolName, phase, payload) => ({
    phase,
    toolName,
    candidateId,
    candidateName:
      typeof payload?.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : candidateName,
    summary: summarizeToolEvent(toolName, phase, payload),
    payload,
    at: new Date().toISOString(),
  });

  const notifyToolCall = (toolName, input) => {
    if (typeof onProgress === 'function') {
      onProgress({
        status: 'running',
        latestToolEvent: buildProgressEvent(toolName, 'call', input ?? {}),
      });
    }
  };

  const notifyToolResult = (toolName, output, error) => {
    if (typeof onProgress === 'function') {
      const payload = error ? { message: String(error) } : (output ?? {});
      onProgress({
        status: error ? 'error' : 'running',
        latestToolEvent: buildProgressEvent(
          toolName,
          error ? 'error' : 'result',
          payload,
        ),
      });
    }
  };

  const readRequestResumeStatus = async name => {
    const requestState = await browserAgent.aiQuery(
      `现在只观察名字为”${name}”的聊天会话最近消息区域，以及页面右侧主聊天区域底部那一排聊天操作按钮。请判断是否已经成功向该候选人发起”求简历/要简历”。只返回 JSON：{“requested”:true|false,”reason”:”一句中文依据”}。只有当你能看到以下任一明确迹象时才返回 true：1. 最近消息区域出现“简历请求已发送”“已发送简历请求”“[送达] 简历请求已发送”之类明确文案；2. 底部原来的”求简历/要简历”按钮已消失、变灰、变成已发送态，或出现清晰的已请求状态。不要因为只是看到了底部按钮、输入区或聊天页面本身就返回 true。`,
    );
    log(`[AI:aiQuery] 求简历状态检查: ${JSON.stringify(requestState)}`);
    return {
      requested: requestState?.requested === true,
      reason: normalizeText(requestState?.reason) || '',
    };
  };

  const readPinStatus = async name => {
    const pinState = await browserAgent.aiQuery(
      `现在只观察名字为”${name}”的聊天会话页面右侧竖排工具栏中的”置顶当前会话”图标。这个图标像一个向上箭头进入一条横线/托盘，通常位于”收藏”图标下面、”更多”图标上面。请判断它当前是否已经处于置顶选中状态。只返回 JSON：{“alreadyPinned”:true|false,”reason”:”一句简短中文判断依据”}。如果页面上已经出现”取消置顶””已置顶”相关明确语义，或者图标明显处于选中/激活态，就返回 true。`,
    );
    log(`[AI:aiQuery] 置顶状态检查: ${JSON.stringify(pinState)}`);
    return {
      alreadyPinned: pinState?.alreadyPinned === true,
      reason: normalizeText(pinState?.reason) || '',
    };
  };

  const readMessageDeliveryStatus = async (name, message) => {
    const sendState = await browserAgent.aiQuery(
      `现在只观察名字为”${name}”的聊天会话最近消息区域。请判断刚才发送给候选人的消息”${message}”是否已经成功出现在会话中。只返回 JSON：{“sent”:true|false,”reason”:”一句中文依据”}。`,
    );
    log(`[AI:aiQuery] 消息发送状态检查: ${JSON.stringify(sendState)}`);
    return {
      sent: sendState?.sent === true,
      reason: normalizeText(sendState?.reason) || '',
    };
  };

  const wrapTool =
    (toolName, execute) =>
    async (input = {}) => {
      ensureNotAborted();
      const callSummary = summarizeToolEvent(toolName, 'call', input);
      log(`[Tool:${toolName}] ${callSummary}`);
      notifyToolCall(toolName, input);

      try {
        const output = await execute(input);
        ensureNotAborted();
        const resultSummary = summarizeToolEvent(toolName, 'result', output ?? {});
        log(`[Tool:${toolName}] ${resultSummary}`);
        notifyToolResult(toolName, output);
        return output;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`[Tool:${toolName}] 失败: ${msg}`);
        notifyToolResult(toolName, null, msg);
        throw error;
      }
    };

  return {
    navigate_to_candidate: tool({
      description:
        '强制进入目标候选人的聊天会话。执行：回到消息列表 → 搜索候选人 → 点击进入聊天。不做状态判断。返回 { ok, name, ready }。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('navigate_to_candidate', async ({ name }) => {
        ensureCurrentCandidate(name);

        await ensureSelectableCandidateList(browserAgent, log, {
          preferUnread: false,
        });

        const searchResult = await searchAndSelectCandidate(browserAgent, name, log);
        if (!searchResult?.ok) {
          throw new Error(
            normalizeText(searchResult?.reason) || `无法通过消息列表搜索找到候选人 ${name}。`,
          );
        }

        const result = await openCandidateChat({
          browserAgent,
          name,
          log,
        });

        setCandidateRecord({
          chatOpened: true,
        });

        return {
          ...result,
          ready: true,
          name,
        };
      }),
    }),

    open_candidate_resume: tool({
      description:
        '在当前聊天页中打开候选人的在线简历。需先调用 navigate_to_candidate 进入聊天。返回 { ok, name }。',
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
      description:
        '提取候选人的在线简历内容。需先调用 navigate_to_candidate + open_candidate_resume。返回 { ok, name, resumeSummary, resume }。是否匹配由外层 agent 根据简历和岗位要求自行判断。',
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

        const resumeSummary = result?.resume?.summary || '';

        setCandidateRecord({
          inspected: true,
          resumeOpened: true,
          resume: result?.resume || null,
          resumeSummary,
          resumeSegments: result?.resumeSegments || [],
        });
        await persistCandidateState({
          resumeSummary,
          resume: result?.resume || null,
          resumeSegments: result?.resumeSegments || [],
        });
        log(`已提取候选人 ${name} 的简历内容，等待 agent 基于岗位要求做判断。`);

        return {
          ok: true,
          name,
          resumeSummary,
          resume: result?.resume || {},
          resumeSegments: result?.resumeSegments || [],
        };
      }),
    }),

    close_candidate_resume: tool({
      description: '关闭已打开的在线简历，回到聊天页。返回 { ok, name }。',
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
      description:
        '向候选人发起”求简历”动作。只负责点击和确认流程，不负责最终校验。需先调用 navigate_to_candidate 进入聊天。返回 { ok, name, clicked }。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
        reason: z
          .string()
          .optional()
          .describe('一句话说明为什么判定该候选人符合（用于记录）'),
      }),
      execute: wrapTool('request_resume', async ({ name, reason }) => {
        ensureCurrentCandidate(name);
        log(`[AI:aiAct] 准备点击求简历按钮`);
        await browserAgent.aiAct(
          `返回到名字为”${name}”的聊天会话页面，只定位页面右侧主聊天区域底部那一排聊天操作按钮。目标按钮位于聊天消息列表下方、白色空白编辑区上方，和”换电话””换微信””不合适”等按钮处于同一排。优先点击文字明确为”求简历”的按钮；如果没有”求简历”，再查找并点击”要简历”按钮。只点击这个文字按钮本身，不要点击表情、常用语、定位、加号，不要点击白色编辑区，不要误点”换电话””换微信””约面试””不合适”。若点击后出现确认弹窗、二次确认按钮或简历请求确认提示，就继续确认，直到完成发起求简历。`,
        );
        log(`[AI:aiAct] 求简历按钮点击完成，等待确认`);
        await wait(1200);
        await persistCandidateState({
          requestedResumeAction: true,
          requestResumeReason:
            normalizeText(reason) || 'Agent 判定该候选人符合目标候选人特征。',
        });
        log(`已执行向候选人 ${name} 发起要简历的动作，等待单独校验。`);
        return {
          ok: true,
          name,
          clicked: true,
        };
      }),
    }),

    read_request_resume_status: tool({
      description:
        '读取当前候选人是否已经成功发起求简历。只观察页面状态，不执行点击。返回 { ok, name, requested, reason }。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('read_request_resume_status', async ({ name }) => {
        ensureCurrentCandidate(name);
        const requestState = await readRequestResumeStatus(name);
        await persistCandidateState({
          resumeRequested: requestState.requested,
        });
        return {
          ok: true,
          name,
          requested: requestState.requested,
          reason: requestState.reason,
        };
      }),
    }),

    pin_candidate: tool({
      description:
        '执行将当前聊天会话置顶的动作。只负责点击，不负责最终校验。需先调用 navigate_to_candidate 进入聊天。返回 { ok, name, clicked }。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('pin_candidate', async ({ name }) => {
        ensureCurrentCandidate(name);

        if (typeof browserAgent?.aiTap === 'function') {
          log(`[AI:aiTap] 准备点击置顶图标`);
          await browserAgent.aiTap(
            `名字为”${name}”的聊天会话页面右侧竖排工具栏中的”置顶当前会话”图标。这个图标像一个向上箭头进入一条横线/托盘，位于”收藏”图标下面、”更多”图标上面。只点击这一个图标，不要误点其他按钮。`,
          );
          log(`[AI:aiTap] 置顶图标点击完成`);
        } else {
          log(`[AI:aiAct] 准备点击置顶图标（fallback）`);
          await browserAgent.aiAct(
            `返回到名字为”${name}”的聊天会话页面。然后只观察聊天区域右侧的竖排工具栏，找到”置顶当前会话”的图标并点击。这个图标的特征是：像一个向上箭头进入一条横线/托盘，位于右侧竖排工具栏中部，通常在”收藏”图标下面、”更多”图标上面。不要误点收藏、更多、关闭简历、在线简历、附件简历或其他按钮。点击成功后停止。`,
          );
          log(`[AI:aiAct] 置顶图标点击完成`);
        }
        await wait(1200);
        setCandidateRecord({
          attemptedPin: true,
        });
        log(`已执行对候选人 ${name} 的置顶动作，等待单独校验。`);
        return {
          ok: true,
          name,
          clicked: true,
        };
      }),
    }),

    read_pin_status: tool({
      description:
        '读取当前聊天会话是否已经置顶。只观察页面状态，不执行点击。返回 { ok, name, alreadyPinned, reason }。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('read_pin_status', async ({ name }) => {
        ensureCurrentCandidate(name);
        const pinState = await readPinStatus(name);
        await persistCandidateState({
          pinned: pinState.alreadyPinned,
        });
        return {
          ok: true,
          name,
          alreadyPinned: pinState.alreadyPinned,
          reason: pinState.reason,
        };
      }),
    }),

    send_rejection_message: tool({
      description:
        '向候选人发送不匹配消息动作。只负责输入和发送，不负责最终校验。需先调用 navigate_to_candidate 进入聊天。若不传 message 则使用默认消息。返回 { ok, name, message, sentAction }。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
        message: z.string().optional().describe('发送给候选人的消息'),
        reason: z
          .string()
          .optional()
          .describe('一句话说明为什么判定该候选人不符合'),
      }),
      execute: wrapTool(
        'send_rejection_message',
        async ({ name, message, reason }) => {
          ensureCurrentCandidate(name);
          const finalMessage = String(
            message || rejectionMessage || DEFAULT_REJECTION_MESSAGE,
          ).trim();
          log(`[AI:aiAct] 准备聚焦输入框`);
          await browserAgent.aiAct(
            `在名字为”${name}”的聊天会话中，只定位页面右侧主聊天区域最底部的消息输入区并点击使其获得焦点。目标区域必须同时满足这些特征：1. 位于聊天消息列表最下方；2. 位于一整排聊天操作控件的下方，这排控件包含表情、常用语、定位、加号，以及”求简历””换电话””换微信””不合适”等按钮；3. 真正可输入的是最底部那块横向展开的白色空白编辑区，不是上面那排按钮；4. 编辑区右下角有”发送”按钮，未输入文字时它也可能是灰色禁用态。不要点击左侧会话列表搜索框，不要点击顶部搜索入口，不要点击表情、常用语、定位、加号或快捷操作按钮本身。只点击真正的空白编辑区使其获得焦点，不要输入文字。`,
          );
          log(`[AI:aiAct] 输入框聚焦完成`);
          await wait(500);
          log(`[AI:aiAct] 准备输入消息并发送: “${finalMessage}”`);
          await browserAgent.aiAct(
            `现在焦点已经在页面右侧主聊天区域最底部的白色空白编辑区内。直接输入”${finalMessage}”，确认文字已经出现在这个编辑区后，再点击编辑区右下角的”发送”按钮发送。不要改点搜索框，不要点击上方的表情、常用语、定位、加号，也不要点击”求简历””换电话””换微信””不合适”等按钮。`,
          );
          log(`[AI:aiAct] 输入并发送完成，等待确认`);
          await wait(1200);
          await persistCandidateState({
            attemptedRejectionMessage: true,
            rejectionReason:
              normalizeText(reason) ||
              'Agent 判定该候选人不符合目标候选人特征。',
            rejectionMessage: finalMessage,
          });
          log(`已执行向候选人 ${name} 发送不匹配消息的动作，等待单独校验。`);
          return {
            ok: true,
            name,
            sentAction: true,
            message: finalMessage,
          };
        },
      ),
    }),

    read_rejection_message_status: tool({
      description:
        '读取指定不匹配消息是否已经成功出现在当前聊天会话中。只观察页面状态，不执行输入或点击。返回 { ok, name, sent, message, reason }。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
        message: z.string().describe('需要确认是否已发送的消息内容'),
      }),
      execute: wrapTool('read_rejection_message_status', async ({ name, message }) => {
        ensureCurrentCandidate(name);
        const deliveryState = await readMessageDeliveryStatus(name, message);
        await persistCandidateState({
          sentRejectionMessage: deliveryState.sent,
          rejectionMessage: message,
        });
        return {
          ok: true,
          name,
          sent: deliveryState.sent,
          message,
          reason: deliveryState.reason,
        };
      }),
    }),

    read_chat_context: tool({
      description:
        '读取当前聊天页状态，返回 { ok, name, isChatReady, hasResumeButton, hasRequestResumeButton, hasHistoryMessages, summary }。isChatReady=false 时需先调用 navigate_to_candidate。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: wrapTool('read_chat_context', async ({ name }) => {
        ensureCurrentCandidate(name);
        const context = await browserAgent.aiQuery(
          `只观察名字为”${name}”的当前聊天会话主视图。读取关键信息，只返回 JSON：{“isChatReady”:true|false,”hasResumeButton”:true|false,”hasRequestResumeButton”:true|false,”hasHistoryMessages”:true|false,”summary”:”一句中文摘要”}。`,
        );
        log(`[AI:aiQuery] 聊天上下文: ${JSON.stringify(context)}`);
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
