import { generateText } from 'ai';
import { createLanguageModel } from './language-model.js';
import { copyVisibleResumeText, ensureResumeModalClosed, wait } from './browser-actions.js';

export function extractJson(text) {
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

export function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSegmentSignature(segment) {
  const payload = {
    rawText: normalizeText(segment?.rawText),
    resumeEndSignals: Array.isArray(segment?.resumeEndSignals) ? segment.resumeEndSignals : [],
    resumeEnded: Boolean(segment?.resumeEnded),
    segmentIndex: Number(segment?.segmentIndex || 0),
  };

  return JSON.stringify(payload);
}

function detectResumeEndFromText(text) {
  const normalized = normalizeText(text);
  const signals = [
    '为妥善保护牛人在BOSS直聘平台提交、发布、展示的简历',
    '其他名校毕业的牛人',
    '其他牛人推荐',
    '相似牛人',
    '隐私提示',
  ].filter(signal => normalized.includes(signal));

  return {
    resumeEnded: signals.length > 0,
    resumeEndSignals: signals,
  };
}

async function parseResumeSegmentFromText(rawText, segmentIndex) {
  const endState = detectResumeEndFromText(rawText);
  return {
    segmentIndex,
    rawText,
    resumeEndSignals: endState.resumeEndSignals,
    resumeEnded: endState.resumeEnded,
  };
}

export async function mergeResumeSegments(segments) {
  const model = createLanguageModel();
  const { text } = await generateText({
    model,
    temperature: 0.1,
    system:
      '你是候选人简历信息整理助手。请把多屏在线简历原始文本合并成一份完整、去重的候选人信息 JSON。',
    prompt: `
请根据下面的多屏在线简历原始文本，输出一份合并后的 JSON：
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
- 只基于输入原始文本合并，不能臆造
- 相同经历要去重
- summary 用 2 到 4 句话概括
- 没有的信息用空字符串或空数组
- 重点完整保留：期望职位、工作经历、项目经验、关键词、教育经历、资格证书、专业技能
- 如果这些栏目分散在不同屏文本中，务必合并，不要遗漏

在线简历原始文本片段：
${JSON.stringify(segments, null, 2)}
    `.trim(),
  });

  return extractJson(text)?.candidate || {};
}

export async function inspectCandidateResume({
  browserAgent,
  name,
  targetProfile,
  log,
  candidateRecords,
}) {
  log(`开始检查候选人 ${name}。`);
  await browserAgent.aiAct(
    `在未读消息列表或当前会话页面中找到名字为“${name}”的候选人，点击进入与他的聊天会话。`,
  );
  await wait(1000);
  await browserAgent.aiAct(
    `进入候选人“${name}”的聊天会话后，优先直接点击右上区域清晰可见的“在线简历”按钮来打开简历 modal。如果当前页面已经显示候选人的姓名、年龄、学历、工作经历摘要，并且旁边有“在线简历”按钮，就不要再去点击名字或头像，直接点击“在线简历”。只有在页面里完全看不到“在线简历”按钮时，才退回去点击名字或头像进入个人信息视图后再寻找“在线简历”入口。`,
  );
  await wait(1500);
  await browserAgent.aiAct(
    '确认在线简历 modal 已经打开并保持在前景。这个步骤的完成标准只有一个：当前屏幕上能清楚看到在线简历 modal 已经打开。不要在这一步继续判断简历是否完整，也不要在这一步继续尝试提取栏目内容。',
  );
  await wait(1800);
  log(`候选人 ${name} 的在线简历 modal 已打开，开始执行“收集一屏 -> 滚动 -> 再收集”的循环。`);

  const segments = [];
  const maxSegments = 8;
  let lastSignature = '';
  let repeatedSegments = 0;

  for (let index = 0; index < maxSegments; index += 1) {
    await wait(1200);
    const copiedText = await copyVisibleResumeText(browserAgent);
    if (!copiedText || copiedText.length < 20) {
      log(`候选人 ${name} 的第 ${index + 1} 屏复制文本过短，停止继续采集。`);
      break;
    }
    const segment = await parseResumeSegmentFromText(copiedText, index + 1);

    const signature = buildSegmentSignature(segment);
    const isRepeated = signature === lastSignature;

    if (!isRepeated) {
      segments.push(segment);
      lastSignature = signature;
      repeatedSegments = 0;
    } else {
      repeatedSegments += 1;
      log(`候选人 ${name} 的第 ${index + 1} 次采集与上一屏重复，准备尝试更深一点的滚动。`);
    }

    log(`已采集候选人 ${name} 的第 ${index + 1} 屏简历内容。`);

    if (segment?.resumeEnded === true) {
      log(`已识别到候选人 ${name} 的简历结束信号，停止继续滚动。`);
      break;
    }

    if (repeatedSegments >= 2) {
      break;
    }

    const scrollInstruction =
      repeatedSegments > 0
        ? '把鼠标放在在线简历 modal 的内容区域中间，只执行一次更大幅度的向下滚动；如果能看到简历 modal 内部的滚动条，就只拖动一次这个滚动条后立刻停止。不要自行连续滚动，不要继续浏览，不要滚动左侧消息列表或聊天消息区域。'
        : '在当前在线简历 modal 的内容区域里，只执行一次向下滚动动作，滚动完立刻停止并返回结果，不要自行连续滚动，不要继续浏览，不要滚动左侧消息列表或聊天消息区域。';

    await browserAgent.aiAct(scrollInstruction);
    await wait(1200);
  }

  const extractedResume = await mergeResumeSegments(segments);
  await ensureResumeModalClosed(browserAgent, name);

  log(`候选人 ${name} 的在线简历已提取完成，并已关闭简历弹窗返回聊天界面。`);
  candidateRecords.set(name, {
    ...(candidateRecords.get(name) || {}),
    name,
    resume: extractedResume || {},
    resumeSegments: segments,
  });

  return {
    name,
    targetProfile,
    resume: extractedResume || {},
    resumeSegments: segments,
  };
}
