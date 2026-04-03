import { tool } from 'ai';
import { z } from 'zod';
import { wait, ensureCandidateChatReady } from '../services/browser-actions.js';
import { inspectCandidateResume, normalizeText } from '../services/resume-service.js';

const CHAT_INDEX_URL = 'https://www.zhipin.com/web/chat/index';
const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

function sanitizeNameList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(item => String(item || '').trim()).filter(Boolean);
}

export function createScreeningTools({
  browserAgent,
  targetProfile,
  rejectionMessage,
  operationLog,
  onProgress,
  candidateRecords,
  persistCandidateRecord,
}) {
  const log = message => {
    operationLog.push(
      `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`,
    );
    if (typeof onProgress === 'function') {
      onProgress({
        status: 'running',
        operationLog: [...operationLog],
      });
    }
  };

  return {
    open_chat_index: tool({
      description: '打开 Boss 直聘沟通页，并切换到未读消息列表。',
      inputSchema: z.object({}),
      execute: async () => {
        log('打开沟通页，并准备查看未读消息。');
        await browserAgent.aiAct(
          `在当前已经连接的这个 Chrome 标签页中，直接访问 ${CHAT_INDEX_URL}。必须复用当前 tab，不要新开标签页，不要切到别的标签页。页面打开后停留在 Boss 直聘沟通页。`,
        );
        await wait(1200);
        await browserAgent.aiAct(
          '如果页面中有“未读”标签或筛选项，点击它，确保当前展示的是未读消息列表。',
        );
        await wait(1000);
        return { ok: true, url: CHAT_INDEX_URL };
      },
    }),

    get_unread_sender_names: tool({
      description: '读取当前未读消息列表里所有发送消息人的名字。',
      inputSchema: z.object({}),
      execute: async () => {
        await browserAgent.aiAct(
          '确认当前页面展示的是未读消息列表，如果不是就切换到未读消息列表。',
        );
        await wait(800);
        const result = await browserAgent.aiQuery(
          '请提取当前未读消息列表中所有发送消息人的名字，只返回 JSON：{"names":["姓名1","姓名2"]}。如果没有未读消息，返回空数组。',
        );
        const names = sanitizeNameList(result?.names);
        log(`识别到未读消息发送人: ${names.join('、') || '无'}`);
        return { names };
      },
    }),

    inspect_candidate_resume: tool({
      description:
        '打开指定未读消息发送人的聊天会话，点击名字进入在线简历，并用视觉方式结构化提取候选人信息。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: async ({ name }) =>
        await inspectCandidateResume({
          browserAgent,
          name,
          targetProfile,
          log,
          candidateRecords,
        }),
    }),

    pin_candidate: tool({
      description: '将指定候选人的聊天会话置顶。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: async ({ name }) => {
        await ensureCandidateChatReady(browserAgent, name);
        await browserAgent.aiAct(
          `返回到名字为“${name}”的聊天会话页面，找到“置顶”相关按钮并点击，使这个候选人的会话被置顶。`,
        );
        await wait(1200);
        log(`已对候选人 ${name} 执行置顶。`);
        return { ok: true, name };
      },
    }),

    request_resume: tool({
      description: '向匹配的候选人发起“要简历/求简历”动作。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
        reason: z.string().optional().describe('一句话说明为什么判定该候选人符合'),
      }),
      execute: async ({ name, reason }) => {
        await ensureCandidateChatReady(browserAgent, name);
        await browserAgent.aiAct(
          `返回到名字为“${name}”的聊天会话页面。在聊天区域底部的操作工具条中，优先找到文字为“求简历”的按钮并点击。如果“求简历”不可用，再查找“要简历”按钮。若点击后出现确认弹窗、二次确认按钮或简历请求确认提示，就继续确认，直到成功向该候选人发起求简历。不要误点“换电话”“换微信”“约面试”或“不合适”。`,
        );
        await wait(1200);
        const nextRecord = {
          ...(candidateRecords.get(name) || {}),
          name,
          matched: true,
          reason: normalizeText(reason) || 'Agent 判定该候选人符合目标候选人特征。',
        };
        candidateRecords.set(name, nextRecord);
        await persistCandidateRecord(nextRecord);
        log(`已向候选人 ${name} 发起要简历。`);
        return { ok: true, name };
      },
    }),

    reject_candidate: tool({
      description: '给指定候选人发送不匹配消息。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
        message: z.string().optional().describe('发送给候选人的消息'),
        reason: z.string().optional().describe('一句话说明为什么判定该候选人不符合'),
      }),
      execute: async ({ name, message, reason }) => {
        const finalMessage = String(
          message || rejectionMessage || DEFAULT_REJECTION_MESSAGE,
        ).trim();
        await ensureCandidateChatReady(browserAgent, name);
        await browserAgent.aiAct(
          `返回到名字为“${name}”的聊天会话，在输入框中输入“${finalMessage}”，然后发送消息。`,
        );
        await wait(1200);
        const nextRecord = {
          ...(candidateRecords.get(name) || {}),
          name,
          matched: false,
          reason:
            normalizeText(reason) || 'Agent 判定该候选人不符合目标候选人特征。',
          rejectionMessage: finalMessage,
        };
        candidateRecords.set(name, nextRecord);
        await persistCandidateRecord(nextRecord);
        log(`已向候选人 ${name} 发送不匹配消息。`);
        return { ok: true, name, message: finalMessage };
      },
    }),

    return_to_unread_list: tool({
      description: '返回 Boss 沟通页未读消息列表，方便继续处理下一个人。',
      inputSchema: z.object({}),
      execute: async () => {
        await browserAgent.aiAct(
          '返回 Boss 直聘沟通页面的未读消息列表。如果当前不在未读列表，就继续操作直到看到未读消息列表。',
        );
        await wait(1200);
        log('已返回未读消息列表。');
        return { ok: true };
      },
    }),
  };
}
