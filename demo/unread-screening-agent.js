import { ToolLoopAgent, generateText, stepCountIs, tool } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { z } from 'zod';

const CHAT_INDEX_URL = 'https://www.zhipin.com/web/chat/index';
const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assertEnv(name) {
  if (!process.env[name]) {
    throw new Error(`缺少环境变量 ${name}`);
  }
}

function createLanguageModel() {
  assertEnv('MIDSCENE_MODEL_API_KEY');
  assertEnv('MIDSCENE_MODEL_NAME');
  assertEnv('MIDSCENE_MODEL_BASE_URL');

  const provider = createOpenAICompatible({
    name: 'custom-openai-compatible',
    baseURL: process.env.MIDSCENE_MODEL_BASE_URL.replace(/\/$/, ''),
    apiKey: process.env.MIDSCENE_MODEL_API_KEY,
  });

  return provider.chatModel(process.env.MIDSCENE_MODEL_NAME);
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('模型返回为空');
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('模型返回中未找到 JSON');
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSegmentSignature(segment) {
  const payload = {
    basicInfo: segment?.basicInfo || {},
    expectedPosition: normalizeText(segment?.expectedPosition),
    keywords: Array.isArray(segment?.keywords) ? segment.keywords : [],
    certifications: Array.isArray(segment?.certifications)
      ? segment.certifications
      : [],
    professionalSkills: Array.isArray(segment?.professionalSkills)
      ? segment.professionalSkills
      : [],
    workExperience: Array.isArray(segment?.workExperience)
      ? segment.workExperience
      : [],
    education: Array.isArray(segment?.education) ? segment.education : [],
    projectExperience: Array.isArray(segment?.projectExperience)
      ? segment.projectExperience
      : [],
    notes: Array.isArray(segment?.notes) ? segment.notes : [],
    sectionsVisible: Array.isArray(segment?.sectionsVisible)
      ? segment.sectionsVisible
      : [],
    visibleAnchor: normalizeText(segment?.visibleAnchor),
  };

  return JSON.stringify(payload);
}

const IMPORTANT_RESUME_SECTIONS = ['工作经历', '项目经验', '教育经历', '专业技能'];

function collectSeenSections(segments) {
  return new Set(
    segments
      .flatMap(segment =>
        Array.isArray(segment?.sectionsVisible) ? segment.sectionsVisible : [],
      )
      .map(item => normalizeText(item))
      .filter(Boolean),
  );
}

function getMissingImportantSections(segments) {
  const seenSections = collectSeenSections(segments);
  return IMPORTANT_RESUME_SECTIONS.filter(section => !seenSections.has(section));
}

async function mergeResumeSegments(segments) {
  const model = createLanguageModel();
  const { text } = await generateText({
    model,
    temperature: 0.1,
    system:
      '你是候选人简历信息整理助手。请把多屏在线简历片段合并成一份完整、去重的候选人信息 JSON。',
    prompt: `
请根据下面的多屏在线简历片段，输出一份合并后的 JSON：
{
  "candidate": {
    "name": "",
    "age": "",
    "workYears": "",
    "degree": "",
    "city": "",
    "currentCompany": "",
    "currentTitle": "",
    "expectedPosition": "",
    "expectedSalary": "",
    "keywords": [],
    "certifications": [],
    "professionalSkills": [],
    "summary": "",
    "workExperience": [
      {
        "company": "",
        "title": "",
        "dateRange": "",
        "description": ""
      }
    ],
    "education": [
      {
        "school": "",
        "major": "",
        "degree": "",
        "dateRange": ""
      }
    ],
    "projectExperience": [
      {
        "name": "",
        "role": "",
        "dateRange": "",
        "description": ""
      }
    ]
  }
}

要求：
- 只基于输入片段合并，不能臆造
- 相同经历要去重
- summary 用 2 到 4 句话概括
- 没有的信息用空字符串或空数组
- 重点完整保留：期望职位、工作经历、项目经验、关键词、教育经历、资格证书、专业技能
- 如果这些栏目分散在不同屏中，务必合并，不要遗漏

简历片段：
${JSON.stringify(segments, null, 2)}
    `.trim(),
  });

  return extractJson(text)?.candidate || {};
}

async function extractVisibleResumeSegment(browserAgent, segmentIndex) {
  const result = await browserAgent.aiQuery(
    `
请基于当前页面这一屏可见的在线简历内容，提取本屏简历片段，只返回 JSON：
{
  "segmentIndex": ${segmentIndex},
  "sectionsVisible": ["期望职位","工作经历","项目经验","关键词","教育经历","资格证书","专业技能"],
  "basicInfo": {
    "name": "",
    "age": "",
    "workYears": "",
    "degree": "",
    "city": "",
    "currentCompany": "",
    "currentTitle": "",
    "expectedSalary": ""
  },
  "expectedPosition": "",
  "keywords": [],
  "certifications": [],
  "professionalSkills": [],
  "workExperience": [
    {
      "company": "",
      "title": "",
      "dateRange": "",
      "description": ""
    }
  ],
  "education": [
    {
      "school": "",
      "major": "",
      "degree": "",
      "dateRange": ""
    }
  ],
  "projectExperience": [
    {
      "name": "",
      "role": "",
      "dateRange": "",
      "description": ""
    }
  ],
  "notes": [],
  "visibleAnchor": "",
  "hasMoreBelow": true
}

要求：
- 只能提取当前这一屏看得到的内容
- 如果某项看不到，就返回空字符串或空数组
- sectionsVisible 只填写当前屏明确看得到的栏目标题
- 特别关注并尽量完整提取：工作经历、项目经验、关键词、教育经历、资格证书、专业技能
- visibleAnchor 请提取当前屏幕底部附近最能代表位置变化的1到2条文字，方便判断是否滚动到了新内容
- hasMoreBelow 表示这份在线简历在当前 modal 下方是否还有明显未读取内容
- 如果当前还没看到“项目经验”或“专业技能”等下半部分栏目，并且简历 modal 明显还能继续下滑，那么 hasMoreBelow 必须返回 true
    `.trim(),
  );

  return result || {};
}

function sanitizeNameList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(item => String(item || '').trim()).filter(Boolean);
}

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

function createScreeningTools({
  browserAgent,
  targetProfile,
  rejectionMessage,
  operationLog,
}) {
  const log = message => {
    operationLog.push(
      `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`,
    );
  };

  return {
    open_chat_index: tool({
      description: '打开 Boss 直聘沟通页，并切换到未读消息列表。',
      inputSchema: z.object({}),
      execute: async () => {
        log('打开沟通页，并准备查看未读消息。');
        await browserAgent.connectNewTabWithUrl(CHAT_INDEX_URL, {
          forceSameTabNavigation: true,
        });
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
      execute: async ({ name }) => {
        log(`开始检查候选人 ${name}。`);
        await browserAgent.aiAct(
          `在未读消息列表或当前会话页面中找到名字为“${name}”的候选人，点击进入与他的聊天会话。`,
        );
        await wait(1000);
        await browserAgent.aiAct(
          `在当前聊天页面中，点击名字为“${name}”的候选人名字或头像，打开他的个人信息视图。注意：点击后如果页面右侧已经出现候选人的姓名、年龄、学历、工作经历、期望职位、在线简历入口或类似的个人资料卡片，就说明已经成功进入候选人主页视图，不要因为没有跳转到全新页面而反复点击。`,
        );
        await wait(1500);
        await browserAgent.aiAct(
          `如果页面中有“在线简历”按钮、简历弹窗入口，或可以展开完整简历的区域，就打开它，并保持这个在线简历 modal 在前景。注意：我们要提取的栏目包括 期望职位、工作经历、项目经验、关键词、教育经历、资格证书、专业技能。`,
        );
        await wait(1800);

        const segments = [];
        const maxSegments = 8;
        let lastSignature = '';
        let repeatedSegments = 0;

        for (let index = 0; index < maxSegments; index += 1) {
          await wait(1200);
          const segment = await extractVisibleResumeSegment(
            browserAgent,
            index + 1,
          );
          const signature = buildSegmentSignature(segment);
          const isRepeated = signature === lastSignature;

          if (!isRepeated) {
            segments.push(segment);
            lastSignature = signature;
            repeatedSegments = 0;
          } else {
            repeatedSegments += 1;
            log(
              `候选人 ${name} 的第 ${index + 1} 次采集与上一屏重复，准备尝试更深一点的滚动。`,
            );
          }

          log(`已采集候选人 ${name} 的第 ${index + 1} 屏简历内容。`);

          const missingImportantSections = getMissingImportantSections(segments);
          if (segment?.hasMoreBelow === false && missingImportantSections.length === 0) {
            break;
          }

          if (segment?.hasMoreBelow === false && missingImportantSections.length > 0) {
            log(`当前仍缺少栏目: ${missingImportantSections.join('、')}，继续向下滚动采集。`);
          }

          if (repeatedSegments >= 2) {
            break;
          }

          const scrollInstruction =
            repeatedSegments > 0
              ? '把鼠标放在在线简历 modal 的内容区域中间，继续向下滚动更大一段距离；如果能看到简历 modal 内部的滚动条，就拖动这个滚动条继续向下，不要滚动左侧消息列表或聊天消息区域。'
              : '在当前在线简历 modal 的内容区域向下滚动一屏，确保看到新的简历内容，尤其继续寻找项目经验、资格证书、专业技能等下方栏目，不要滚动左侧消息列表或聊天消息区域。';

          await browserAgent.aiAct(scrollInstruction);
          await wait(1200);
        }

        const extractedResume = await mergeResumeSegments(segments);

        log(`候选人 ${name} 的在线简历已打开，并完成视觉提取。`);
        return {
          name,
          targetProfile,
          resume: extractedResume || {},
          resumeSegments: segments,
        };
      },
    }),

    pin_candidate: tool({
      description: '将指定候选人的聊天会话置顶。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
      }),
      execute: async ({ name }) => {
        await browserAgent.aiAct(
          `返回到名字为“${name}”的聊天会话页面，找到“置顶”相关按钮并点击，使这个候选人的会话被置顶。`,
        );
        await wait(1200);
        log(`已对候选人 ${name} 执行置顶。`);
        return { ok: true, name };
      },
    }),

    reject_candidate: tool({
      description: '给指定候选人发送不匹配消息。',
      inputSchema: z.object({
        name: z.string().describe('候选人姓名'),
        message: z.string().optional().describe('发送给候选人的消息'),
      }),
      execute: async ({ name, message }) => {
        const finalMessage = String(
          message || rejectionMessage || DEFAULT_REJECTION_MESSAGE,
        ).trim();
        await browserAgent.aiAct(
          `返回到名字为“${name}”的聊天会话，在输入框中输入“${finalMessage}”，然后发送消息。`,
        );
        await wait(1200);
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
6. 匹配就调用 pin_candidate。
7. 不匹配就调用 reject_candidate，并使用默认拒绝消息，除非我另行说明。
8. 每处理完一个候选人，都调用 return_to_unread_list。

判断时要谨慎：
- 重点看候选人的项目经验、行业背景、岗位方向、年限、核心技能、教育背景。
- 如果信息不足，默认判为不匹配，并说明是因为证据不足。
- 不要臆造页面中不存在的信息。

最终输出请简洁总结：
- 总共处理了多少人
- 哪些人匹配并已置顶
- 哪些人不匹配并已发送消息
- 每个人一句原因
  `.trim();
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
  const pushProgress = partial => {
    if (typeof onProgress === 'function') {
      onProgress(partial);
    }
  };

  try {
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
