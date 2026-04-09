import {
  copyVisibleResumeText,
  ensureResumeModalClosed,
  randomBetween,
  scrollResumeCanvasByJs,
  wait,
} from './browser-actions.js';
import { createMidsceneDebug } from './midscene-debug.js';

const OPEN_RESUME_WAIT_MS = 900;
const BEFORE_COPY_WAIT_MS = 500;
const MAX_RESUME_SEGMENTS = 40;
const MAX_REPEATED_SEGMENTS = 2;
const debugResumeFlow = createMidsceneDebug('boss-agent:resume:flow');

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

function buildTextPreview(value, maxLength = 120) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function buildSegmentSignature(segment) {
  const payload = {
    rawText: normalizeText(segment?.rawText),
    resumeEndSignals: Array.isArray(segment?.resumeEndSignals)
      ? segment.resumeEndSignals
      : [],
    resumeEnded: Boolean(segment?.resumeEnded),
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

function joinResumeSegments(segments) {
  const texts = (segments || [])
    .map(segment => normalizeText(segment?.rawText || ''))
    .filter(Boolean);

  if (!texts.length) {
    return '';
  }

  const merged = [texts[0]];

  for (let index = 1; index < texts.length; index += 1) {
    const previous = merged[merged.length - 1];
    const current = texts[index];
    const overlap = findTextOverlap(previous, current);

    if (overlap > 0) {
      merged[merged.length - 1] = `${previous}${current.slice(overlap)}`;
    } else {
      merged.push(current);
    }
  }

  return merged.join('\n\n');
}

function findTextOverlap(previous, current) {
  const prev = normalizeText(previous);
  const next = normalizeText(current);

  const maxOverlap = Math.min(prev.length, next.length, 320);
  const minOverlap = 24;

  for (let size = maxOverlap; size >= minOverlap; size -= 1) {
    const prevSuffix = prev.slice(-size);
    const nextPrefix = next.slice(0, size);

    if (prevSuffix === nextPrefix) {
      return size;
    }
  }

  return 0;
}

function extractSectionRange(text, startLabel, nextLabels) {
  const startIndex = text.indexOf(startLabel);
  if (startIndex === -1) {
    return '';
  }

  const contentStart = startIndex + startLabel.length;
  let endIndex = text.length;

  for (const label of nextLabels) {
    const nextIndex = text.indexOf(label, contentStart);
    if (nextIndex !== -1 && nextIndex < endIndex) {
      endIndex = nextIndex;
    }
  }

  return normalizeText(text.slice(contentStart, endIndex));
}

function splitListLikeText(text) {
  return Array.from(
    new Set(
      normalizeText(text)
        .split(/[、,，;；|\n]/)
        .map(item => item.trim())
        .filter(item => item.length >= 2),
    ),
  );
}

function dedupeDescriptions(items, key = 'description') {
  const seen = new Set();
  return items.filter(item => {
    const value = normalizeText(item?.[key] || '');
    if (!value) {
      return false;
    }
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function extractExpectedPosition(text) {
  const normalized = normalizeText(text);
  const labelIndex = normalized.indexOf('期望职位');
  if (labelIndex === -1) {
    return { city: '', expectedPosition: '', expectedSalary: '' };
  }

  const snippet = normalized.slice(labelIndex, labelIndex + 120);
  const matched = snippet.match(/期望职位\s*([^\n]+)/);
  const value = normalizeText(matched?.[1] || '');
  const parts = value
    .split(/\s*[|｜]\s*/)
    .map(item => item.trim())
    .filter(Boolean);

  return {
    city: parts[0] || '',
    expectedPosition: parts[1] || '',
    expectedSalary: parts.find(part => /\d+\s*-\s*\d+\s*K/i.test(part)) || '',
  };
}

function extractEducation(sectionText) {
  if (!sectionText) {
    return [];
  }

  const chunks = sectionText
    .split(/(?=(?:20\d{2}|19\d{2})[.\-/]\d{1,2})/)
    .map(item => normalizeText(item))
    .filter(Boolean);

  return chunks.slice(0, 4).map(chunk => ({
    school: '',
    major: '',
    degree: '',
    dateRange: '',
    description: chunk,
  }));
}

function extractExperienceItems(sectionText, kind) {
  if (!sectionText) {
    return [];
  }

  const chunks = sectionText
    .split(/(?=(?:20\d{2}|19\d{2})[.\-/]\d{1,2})/)
    .map(item => normalizeText(item))
    .filter(Boolean);

  return chunks.slice(0, 8).map(chunk => ({
    company: kind === 'work' ? '' : undefined,
    title: '',
    name: kind === 'project' ? '' : undefined,
    role: kind === 'project' ? '' : undefined,
    dateRange: '',
    description: chunk,
  }));
}

function extractTopSummary(text) {
  const normalized = normalizeText(text);
  const topSlice = normalized.slice(0, 360);
  const sentences = topSlice
    .split(/(?<=[。！？])/)
    .map(item => item.trim())
    .filter(Boolean);
  return sentences.slice(0, 3).join('');
}

export function extractResumeSegmentsProgrammatically(segments) {
  const fullText = joinResumeSegments(segments);
  const normalized = normalizeText(fullText);
  const sectionLabels = [
    '期望职位',
    '工作经历',
    '项目经验',
    '教育经历',
    '资格证书',
    '专业技能',
  ];

  const expected = extractExpectedPosition(normalized);
  const workSection = extractSectionRange(normalized, '工作经历', [
    '项目经验',
    '教育经历',
    '资格证书',
    '专业技能',
  ]);
  const projectSection = extractSectionRange(normalized, '项目经验', [
    '教育经历',
    '资格证书',
    '专业技能',
  ]);
  const educationSection = extractSectionRange(normalized, '教育经历', [
    '资格证书',
    '专业技能',
  ]);
  const certificationSection = extractSectionRange(normalized, '资格证书', [
    '专业技能',
  ]);
  const skillSection = extractSectionRange(normalized, '专业技能', []);

  const summary = extractTopSummary(normalized);
  const keywords = Array.from(
    new Set(
      [
        ...splitListLikeText(skillSection),
        ...splitListLikeText(projectSection),
      ].filter(item => item.length <= 24),
    ),
  ).slice(0, 24);

  return {
    name: '',
    age: '',
    workYears: '',
    degree: '',
    city: expected.city,
    currentCompany: '',
    currentTitle: '',
    expectedPosition: expected.expectedPosition,
    expectedSalary: expected.expectedSalary,
    keywords,
    certifications: splitListLikeText(certificationSection).slice(0, 20),
    professionalSkills: splitListLikeText(skillSection).slice(0, 30),
    summary,
    workExperience: dedupeDescriptions(
      extractExperienceItems(workSection, 'work').map(item => ({
        company: '',
        title: '',
        dateRange: '',
        description: item.description,
      })),
    ),
    education: dedupeDescriptions(extractEducation(educationSection)),
    projectExperience: dedupeDescriptions(
      extractExperienceItems(projectSection, 'project').map(item => ({
        name: '',
        role: '',
        dateRange: '',
        description: item.description,
      })),
    ),
    rawText: fullText,
    rawSections: {
      expectedPosition: extractSectionRange(normalized, '期望职位', sectionLabels.filter(label => label !== '期望职位')),
      workExperience: workSection,
      projectExperience: projectSection,
      education: educationSection,
      certifications: certificationSection,
      professionalSkills: skillSection,
    },
  };
}

async function tryCopyResumeScreen({
  browserAgent,
  name,
  segmentIndex,
  log,
}) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      debugResumeFlow(
        'segment=%d copy attempt=%d begin',
        segmentIndex,
        attempt + 1,
      );
      const copiedText = await copyVisibleResumeText(browserAgent);
      debugResumeFlow(
        'segment=%d copy attempt=%d success length=%d',
        segmentIndex,
        attempt + 1,
        copiedText?.length || 0,
      );
      return copiedText;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      debugResumeFlow(
        'segment=%d copy attempt=%d failed: %s',
        segmentIndex,
        attempt + 1,
        message,
      );
      log(
        `候选人 ${name} 的第 ${segmentIndex} 屏复制失败，第 ${attempt + 1} 次重试：${message}`,
      );
      await wait(260 + attempt * 180);
    }
  }

  debugResumeFlow(
    'segment=%d copy failed after retries: %s',
    segmentIndex,
    lastError instanceof Error ? lastError.message : String(lastError || ''),
  );
  return '';
}

export async function inspectCandidateResume({
  browserAgent,
  candidateId,
  name,
  targetProfile,
  log,
  candidateRecords,
}) {
  log(`开始检查候选人 ${name}。`);
  await browserAgent.aiAct(
    `在未读消息列表或当前会话页面中找到名字为“${name}”的候选人，点击进入与他的聊天会话。`,
  );
  await wait(700);
  await browserAgent.aiAct(
    `优先直接点击右上区域清晰可见的“在线简历”按钮来打开简历。只有在页面里完全看不到“在线简历”按钮时，退回去点击右侧聊天会话内的名字${name}，打开简历弹窗。`,
  );
  await wait(OPEN_RESUME_WAIT_MS);
  log(
    `候选人 ${name} 的在线简历已打开，开始执行“收集一屏 -> 滚动 -> 再收集”的循环。`,
  );

  const segments = [];
  let lastSignature = '';
  let repeatedSegments = 0;

  for (let index = 0; index < MAX_RESUME_SEGMENTS; index += 1) {
    await wait(BEFORE_COPY_WAIT_MS);
    debugResumeFlow('segment=%d begin copy', index + 1);
    const copiedText = await tryCopyResumeScreen({
      browserAgent,
      name,
      segmentIndex: index + 1,
      log,
    });
    if (!copiedText || copiedText.length < 20) {
      debugResumeFlow(
        'segment=%d clipboard too short after retries length=%d',
        index + 1,
        copiedText?.length || 0,
      );
      log(`候选人 ${name} 的第 ${index + 1} 屏复制文本过短，先尝试继续下滚后再采集。`);
      await scrollResumeCanvasByJs(browserAgent, 0);
      const recoveryPauseMs = randomBetween(900, 1800);
      log(
        `候选人 ${name} 的简历在复制失败后已继续程序化下滚一屏，随机停留 ${recoveryPauseMs}ms 后重试下一屏。`,
      );
      await wait(recoveryPauseMs);
      continue;
    }
    debugResumeFlow('segment=%d copied length=%d', index + 1, copiedText.length);
    const segment = await parseResumeSegmentFromText(copiedText, index + 1);
    const preview = buildTextPreview(copiedText, 140);

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
      debugResumeFlow(
        'segment=%d repeated count=%d',
        index + 1,
        repeatedSegments,
      );
      if (repeatedSegments >= MAX_REPEATED_SEGMENTS) {
        log(
          `候选人 ${name} 的简历内容已连续 ${repeatedSegments} 屏重复，视为 canvas 已无法继续有效滚动，停止采集。`,
        );
        break;
      }
    }

    log(`已采集候选人 ${name} 的第 ${index + 1} 屏简历内容。`);
    if (preview) {
      log(`候选人 ${name} 的第 ${index + 1} 屏文本摘录：${preview}`);
    }

    if (segment?.resumeEnded === true) {
      log(`已识别到候选人 ${name} 的简历结束信号，停止继续滚动。`);
      break;
    }

    const jsScrollDistance = repeatedSegments > 0
      ? Math.min(1800, 1040 + (Math.max(0, repeatedSegments - 1) * 220))
      : 0;
    const jsScrollResult = await scrollResumeCanvasByJs(
      browserAgent,
      jsScrollDistance,
    );
    const scrollState = jsScrollResult?.result?.value ?? jsScrollResult ?? {};
    debugResumeFlow(
      'segment=%d scroll source=%s before=%s after=%s',
      index + 1,
      scrollState?.targetSource ?? 'unknown',
      String(scrollState?.before ?? ''),
      String(scrollState?.after ?? ''),
    );

    const pauseMs = randomBetween(900, 1800);
    log(
      `候选人 ${name} 的简历已程序化滚动一屏（${scrollState?.effectiveDistance || jsScrollDistance || 'auto'}px），随机停留 ${pauseMs}ms 后继续。`,
    );
    await wait(pauseMs);
  }

  if (segments.length >= MAX_RESUME_SEGMENTS) {
    debugResumeFlow(
      'resume loop stopped by safety cap maxSegments=%d',
      MAX_RESUME_SEGMENTS,
    );
    log(
      `候选人 ${name} 的简历采集已达到安全上限 ${MAX_RESUME_SEGMENTS} 屏，停止继续下滚。`,
    );
  }

  if (segments.length === 0) {
    debugResumeFlow('resume loop finished with zero segments, merge will receive empty array');
    log(`候选人 ${name} 的在线简历本轮没有成功采集到任何屏文本，准备结束并关闭简历。`);
  } else {
    debugResumeFlow('resume loop finished with %d segments', segments.length);
  }

  log(`候选人 ${name} 已完成 ${segments.length} 屏采集，开始程序化整理简历字段。`);
  debugResumeFlow('programmatic parse begin with segments=%d', segments.length);
  const extractedResume = extractResumeSegmentsProgrammatically(segments);
  debugResumeFlow(
    'programmatic parse done summaryLength=%d skills=%d work=%d project=%d education=%d',
    extractedResume.summary?.length || 0,
    extractedResume.professionalSkills?.length || 0,
    extractedResume.workExperience?.length || 0,
    extractedResume.projectExperience?.length || 0,
    extractedResume.education?.length || 0,
  );
  log(`候选人 ${name} 的简历字段已完成程序化整理。`);
  log(`候选人 ${name} 的简历采集循环已结束，准备关闭简历并返回聊天界面。`);
  await ensureResumeModalClosed(browserAgent, name);

  log(`候选人 ${name} 的在线简历已提取完成，并已关闭简历弹窗返回聊天界面。`);
  candidateRecords.set(candidateId, {
    ...(candidateRecords.get(candidateId) || {}),
    candidateId,
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

export async function openCandidateChat({
  browserAgent,
  name,
  log,
}) {
  log?.(`开始打开候选人 ${name} 的聊天会话。`);
  await browserAgent.aiAct(
    `在未读消息列表或当前页面中，只找到名字为“${name}”的候选人，并点击进入与他的聊天会话。不要点击其他候选人，不要打开简历，不要执行别的动作。`,
  );
  await wait(700);
  log?.(`已进入候选人 ${name} 的聊天会话。`);
  return { ok: true, name };
}

export async function openCandidateResume({
  browserAgent,
  name,
  log,
}) {
  log?.(`开始打开候选人 ${name} 的在线简历。`);
  await browserAgent.aiAct(
    `当前应处于名字为“${name}”的聊天会话。优先直接点击右上区域清晰可见的“在线简历”按钮来打开简历。只有在页面里完全看不到“在线简历”按钮时，才点击聊天区域中的候选人名字 ${name} 来打开简历弹窗。只执行打开简历这一个动作。`,
  );
  await wait(OPEN_RESUME_WAIT_MS);
  log?.(`候选人 ${name} 的在线简历已打开。`);
  return { ok: true, name };
}

export async function extractCandidateResume({
  browserAgent,
  candidateId,
  name,
  log,
  candidateRecords,
}) {
  log?.(
    `候选人 ${name} 的在线简历已打开，开始执行“收集一屏 -> 滚动 -> 再收集”的循环。`,
  );

  const segments = [];
  let lastSignature = '';
  let repeatedSegments = 0;

  for (let index = 0; index < MAX_RESUME_SEGMENTS; index += 1) {
    await wait(BEFORE_COPY_WAIT_MS);
    debugResumeFlow('segment=%d begin copy', index + 1);
    const copiedText = await tryCopyResumeScreen({
      browserAgent,
      name,
      segmentIndex: index + 1,
      log,
    });
    if (!copiedText || copiedText.length < 20) {
      debugResumeFlow(
        'segment=%d clipboard too short after retries length=%d',
        index + 1,
        copiedText?.length || 0,
      );
      log?.(`候选人 ${name} 的第 ${index + 1} 屏复制文本过短，先尝试继续下滚后再采集。`);
      await scrollResumeCanvasByJs(browserAgent, 0);
      const recoveryPauseMs = randomBetween(900, 1800);
      log?.(
        `候选人 ${name} 的简历在复制失败后已继续程序化下滚一屏，随机停留 ${recoveryPauseMs}ms 后重试下一屏。`,
      );
      await wait(recoveryPauseMs);
      continue;
    }
    debugResumeFlow('segment=%d copied length=%d', index + 1, copiedText.length);
    const segment = await parseResumeSegmentFromText(copiedText, index + 1);
    const preview = buildTextPreview(copiedText, 140);

    const signature = buildSegmentSignature(segment);
    const isRepeated = signature === lastSignature;

    if (!isRepeated) {
      segments.push(segment);
      lastSignature = signature;
      repeatedSegments = 0;
    } else {
      repeatedSegments += 1;
      log?.(
        `候选人 ${name} 的第 ${index + 1} 次采集与上一屏重复，准备尝试更深一点的滚动。`,
      );
      debugResumeFlow(
        'segment=%d repeated count=%d',
        index + 1,
        repeatedSegments,
      );
      if (repeatedSegments >= MAX_REPEATED_SEGMENTS) {
        log?.(
          `候选人 ${name} 的简历内容已连续 ${repeatedSegments} 屏重复，视为 canvas 已无法继续有效滚动，停止采集。`,
        );
        break;
      }
    }

    log?.(`已采集候选人 ${name} 的第 ${index + 1} 屏简历内容。`);
    if (preview) {
      log?.(`候选人 ${name} 的第 ${index + 1} 屏文本摘录：${preview}`);
    }

    if (segment?.resumeEnded === true) {
      log?.(`已识别到候选人 ${name} 的简历结束信号，停止继续滚动。`);
      break;
    }

    const jsScrollDistance = repeatedSegments > 0
      ? Math.min(1800, 1040 + (Math.max(0, repeatedSegments - 1) * 220))
      : 0;
    const jsScrollResult = await scrollResumeCanvasByJs(
      browserAgent,
      jsScrollDistance,
    );
    const scrollState = jsScrollResult?.result?.value ?? jsScrollResult ?? {};
    debugResumeFlow(
      'segment=%d scroll source=%s before=%s after=%s',
      index + 1,
      scrollState?.targetSource ?? 'unknown',
      String(scrollState?.before ?? ''),
      String(scrollState?.after ?? ''),
    );

    const pauseMs = randomBetween(900, 1800);
    log?.(
      `候选人 ${name} 的简历已程序化滚动一屏（${scrollState?.effectiveDistance || jsScrollDistance || 'auto'}px），随机停留 ${pauseMs}ms 后继续。`,
    );
    await wait(pauseMs);
  }

  if (segments.length >= MAX_RESUME_SEGMENTS) {
    debugResumeFlow(
      'resume loop stopped by safety cap maxSegments=%d',
      MAX_RESUME_SEGMENTS,
    );
    log?.(
      `候选人 ${name} 的简历采集已达到安全上限 ${MAX_RESUME_SEGMENTS} 屏，停止继续下滚。`,
    );
  }

  if (segments.length === 0) {
    debugResumeFlow('resume loop finished with zero segments, merge will receive empty array');
    log?.(`候选人 ${name} 的在线简历本轮没有成功采集到任何屏文本。`);
  } else {
    debugResumeFlow('resume loop finished with %d segments', segments.length);
  }

  log?.(`候选人 ${name} 已完成 ${segments.length} 屏采集，开始程序化整理简历字段。`);
  debugResumeFlow('programmatic parse begin with segments=%d', segments.length);
  const extractedResume = extractResumeSegmentsProgrammatically(segments);
  debugResumeFlow(
    'programmatic parse done summaryLength=%d skills=%d work=%d project=%d education=%d',
    extractedResume.summary?.length || 0,
    extractedResume.professionalSkills?.length || 0,
    extractedResume.workExperience?.length || 0,
    extractedResume.projectExperience?.length || 0,
    extractedResume.education?.length || 0,
  );
  log?.(`候选人 ${name} 的简历字段已完成程序化整理。`);

  candidateRecords.set(candidateId, {
    ...(candidateRecords.get(candidateId) || {}),
    candidateId,
    name,
    resume: extractedResume || {},
    resumeSegments: segments,
  });

  return {
    ok: true,
    name,
    resume: extractedResume || {},
    resumeSegments: segments,
  };
}

export async function closeCandidateResume({
  browserAgent,
  name,
  log,
}) {
  log?.(`候选人 ${name} 的简历采集循环已结束，准备关闭简历并返回聊天界面。`);
  await ensureResumeModalClosed(browserAgent, name);
  log?.(`候选人 ${name} 的在线简历已关闭，并已返回聊天界面。`);
  return { ok: true, name };
}
