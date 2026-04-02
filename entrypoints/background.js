const STORAGE_KEY = 'bossSearchAgentState';
const STATUS_KEY = 'bossSearchAgentStatus';
const CONFIG_KEY = 'bossSearchAgentConfig';
const DEBUGGER_VERSION = '1.3';
const SEARCH_PAGE_URL = 'https://www.zhipin.com/web/chat/search';
const SEARCH_API_PATH = '/wapi/zpitem/web/boss/search/geeks.json';
const CHAT_PAGE_URL = 'https://www.zhipin.com/web/chat/index';
const DEFAULT_REJECTION_MESSAGE = '您的简历很优秀，但是经验不匹配';

const DEFAULT_CONFIG = {
  searchPageUrl: SEARCH_PAGE_URL,
  targetCity: '上海',
  jdText: '',
  hiringHighlights: '',
  candidatePersona: '',
  generatedQuery: '',
  queryAlternatives: [],
  targetProfile: '',
  rejectionMessage: DEFAULT_REJECTION_MESSAGE,
  modelApiKey: '',
  modelName: 'doubao-seed-2.0-vision',
  modelBaseUrl: 'https://modelx-api.shizhi-inc.com/v2/',
};

let activeMonitor = null;
let bridgeNetworkMonitor = null;

function defaultState() {
  return {
    generatedQuery: '',
    queryAlternatives: [],
    matchedUniqSigns: [],
    matchedCandidates: {},
    requirementSnapshot: null,
    lastSearchMeta: null,
    updatedAt: null,
  };
}

function defaultStatus() {
  return {
    running: false,
    phase: 'idle',
    message: '等待生成搜索词并开始监听搜索结果',
    processedPages: 0,
    processedCandidates: 0,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeConfig(rawConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...rawConfig,
    targetCity: String(rawConfig.targetCity || DEFAULT_CONFIG.targetCity).trim(),
    jdText: String(rawConfig.jdText || '').trim(),
    hiringHighlights: String(rawConfig.hiringHighlights || '').trim(),
    candidatePersona: String(rawConfig.candidatePersona || '').trim(),
    targetProfile: String(rawConfig.targetProfile || '').trim(),
    rejectionMessage: String(rawConfig.rejectionMessage || DEFAULT_REJECTION_MESSAGE).trim(),
    generatedQuery: String(rawConfig.generatedQuery || '').trim(),
    queryAlternatives: Array.isArray(rawConfig.queryAlternatives) ? rawConfig.queryAlternatives.filter(Boolean) : [],
    modelApiKey: String(rawConfig.modelApiKey || '').trim(),
    modelName: String(rawConfig.modelName || DEFAULT_CONFIG.modelName).trim(),
    modelBaseUrl: String(rawConfig.modelBaseUrl || DEFAULT_CONFIG.modelBaseUrl).trim(),
  };
}

async function setStatus(partial) {
  const nextStatus = {
    ...defaultStatus(),
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STATUS_KEY]: nextStatus });
}

async function getConfig() {
  const result = await chrome.storage.local.get([CONFIG_KEY]);
  return normalizeConfig(result[CONFIG_KEY] || {});
}

async function getState() {
  const result = await chrome.storage.local.get([STORAGE_KEY, STATUS_KEY, CONFIG_KEY]);
  return {
    data: result[STORAGE_KEY] || defaultState(),
    status: result[STATUS_KEY] || defaultStatus(),
    config: normalizeConfig(result[CONFIG_KEY] || {}),
  };
}

async function updateState(updater) {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const previousState = result[STORAGE_KEY] || defaultState();
  const nextState = updater(previousState);
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      ...previousState,
      ...nextState,
      updatedAt: new Date().toISOString(),
    },
  });
}

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactWorks(works) {
  return (works || [])
    .map((item) => sanitizeText(item?.name))
    .filter(Boolean)
    .slice(0, 5);
}

function simplifyGeek(item) {
  const geekCard = item?.geekCard || {};
  return {
    uniqSign: sanitizeText(item?.uniqSign),
    name: sanitizeText(geekCard.name),
    city: sanitizeText(geekCard.city),
    workYear: sanitizeText(geekCard.workYear),
    salary: sanitizeText(geekCard.salary),
    degree: sanitizeText(geekCard.highestDegreeName || geekCard.degreeName),
    age: sanitizeText(geekCard.ageDesc || item?.ageDesc),
    activeDesc: sanitizeText(geekCard.activeDesc),
    current: sanitizeText(geekCard.current?.name || item?.highlightCurrentName),
    expect: sanitizeText(geekCard.expect?.name || item?.highlightExpectName),
    geekDesc: sanitizeText(geekCard.geekDesc?.name || item?.highlightGeekDescName),
    matches: (geekCard.matches || []).map((match) => sanitizeText(match)).filter(Boolean),
    works: compactWorks(geekCard.works || item?.works),
    applyStatusDesc: sanitizeText(item?.applyStatusDesc),
    securityId: sanitizeText(geekCard.securityId),
    encryptGeekId: sanitizeText(geekCard.encryptGeekId),
  };
}

function decodeResponseBody(bodyResult) {
  if (!bodyResult?.body) return '';
  if (!bodyResult.base64Encoded) return bodyResult.body;

  try {
    return atob(bodyResult.body);
  } catch {
    return '';
  }
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

async function callModel(config, systemPrompt, userPrompt) {
  if (!config.modelApiKey || !config.modelName || !config.modelBaseUrl) {
    throw new Error('请先配置模型 API Key / Model Name / Base URL');
  }

  const baseUrl = config.modelBaseUrl.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.modelApiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`模型请求失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return extractJson(data?.choices?.[0]?.message?.content || '');
}

function buildRequirementText(config) {
  return [
    config.targetCity ? `目标城市: ${config.targetCity}` : '',
    config.jdText ? `招聘 JD:\n${config.jdText}` : '',
    config.hiringHighlights ? `岗位招聘关键信息:\n${config.hiringHighlights}` : '',
    config.candidatePersona ? `招聘画像:\n${config.candidatePersona}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function generateSearchQuery(config) {
  const result = await callModel(
    config,
    '你是招聘搜索词生成助手。请根据招聘需求，生成适合 Boss 招聘端搜索候选人的简洁查询词。只返回 JSON。',
    `
请根据下面的招聘需求，输出 JSON：
{
  "query": string,
  "alternatives": string[]
}

要求：
- query 是最推荐的 1 条搜索词，尽量短，适合直接放进 Boss 搜索框
- alternatives 给出 2 到 4 条备选搜索词
- 不要输出解释

招聘需求：
${buildRequirementText(config)}
`.trim(),
  );

  return {
    query: sanitizeText(result.query),
    alternatives: Array.isArray(result.alternatives) ? result.alternatives.map((item) => sanitizeText(item)).filter(Boolean).slice(0, 4) : [],
  };
}

async function matchCandidates(config, candidates) {
  const result = await callModel(
    config,
    '你是招聘筛选助手。你会根据招聘需求判断候选人是否匹配。只返回 JSON。',
    `
请根据下面的招聘需求，判断候选人列表中哪些人值得保留。

输出 JSON：
{
  "matched": [
    {
      "uniqSign": string,
      "reason": string
    }
  ]
}

规则：
- 只保留你认为匹配招聘需求的候选人
- reason 控制在 1 到 2 句话，直接说明为什么匹配
- uniqSign 必须来自输入候选人
- 不要输出无关解释

招聘需求：
${buildRequirementText(config)}

候选人列表：
${JSON.stringify(candidates, null, 2)}
`.trim(),
  );

  return Array.isArray(result.matched)
    ? result.matched
        .map((item) => ({
          uniqSign: sanitizeText(item?.uniqSign),
          reason: sanitizeText(item?.reason),
        }))
        .filter((item) => item.uniqSign)
    : [];
}

async function getActiveSearchTab(searchPageUrl) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs.find((item) => item.url?.startsWith(searchPageUrl));
  if (!tab?.id) {
    throw new Error(`请先把当前激活标签页切到搜索页 ${searchPageUrl}`);
  }
  return tab;
}

async function attachDebugger(tabId) {
  const target = { tabId };
  await chrome.debugger.attach(target, DEBUGGER_VERSION);
  await chrome.debugger.sendCommand(target, 'Network.enable');
}

async function detachDebugger(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    return;
  }
}

function isJsonLikeResponse(response = {}) {
  const mimeType = String(response.mimeType || '').toLowerCase();
  return mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('text');
}

async function attachBridgeNetworkDebugger(tabId) {
  await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
  await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
}

async function detachBridgeNetworkDebugger(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    return;
  }
}

function trimLargeText(value, maxLength = 20000) {
  const text = String(value || '');
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function bridgeMonitorStatus() {
  return {
    active: Boolean(bridgeNetworkMonitor),
    tabId: bridgeNetworkMonitor?.tabId || null,
    entryCount: bridgeNetworkMonitor?.entries.length || 0,
  };
}

async function startBridgeNetworkMonitor(tabId) {
  if (bridgeNetworkMonitor?.tabId === tabId) {
    return bridgeMonitorStatus();
  }

  if (bridgeNetworkMonitor?.tabId) {
    await stopBridgeNetworkMonitor();
  }

  await attachBridgeNetworkDebugger(tabId);
  bridgeNetworkMonitor = {
    tabId,
    entries: [],
    pendingRequests: new Map(),
    seenRequestIds: new Set(),
  };

  return bridgeMonitorStatus();
}

async function stopBridgeNetworkMonitor() {
  if (!bridgeNetworkMonitor) {
    return bridgeMonitorStatus();
  }

  const tabId = bridgeNetworkMonitor.tabId;
  bridgeNetworkMonitor = null;
  await detachBridgeNetworkDebugger(tabId);
  return { active: false, tabId: null, entryCount: 0 };
}

function clearBridgeNetworkMonitorEntries() {
  if (!bridgeNetworkMonitor) {
    return { cleared: false, entryCount: 0 };
  }

  const entryCount = bridgeNetworkMonitor.entries.length;
  bridgeNetworkMonitor.entries = [];
  bridgeNetworkMonitor.seenRequestIds.clear();
  return { cleared: true, entryCount: 0, clearedCount: entryCount };
}

function getBridgeNetworkEntries({ sinceIndex = 0, limit = 20, urlIncludes = '' } = {}) {
  const entries = bridgeNetworkMonitor?.entries || [];
  const filtered = urlIncludes
    ? entries.filter((entry) => String(entry.url || '').includes(urlIncludes))
    : entries;

  return {
    total: filtered.length,
    entries: filtered.slice(Number(sinceIndex) || 0, (Number(sinceIndex) || 0) + (Number(limit) || 20)),
  };
}

async function handleBridgeResponseBody(requestId) {
  if (!bridgeNetworkMonitor) return;
  const target = { tabId: bridgeNetworkMonitor.tabId };
  const requestMeta = bridgeNetworkMonitor.pendingRequests.get(requestId);
  if (!requestMeta) return;

  try {
    const bodyResult = await chrome.debugger.sendCommand(target, 'Network.getResponseBody', { requestId });
    const bodyText = trimLargeText(decodeResponseBody(bodyResult));
    bridgeNetworkMonitor.entries.push({
      requestId,
      url: requestMeta.url,
      method: requestMeta.method,
      status: requestMeta.status,
      mimeType: requestMeta.mimeType,
      body: bodyText,
      createdAt: new Date().toISOString(),
    });
    if (bridgeNetworkMonitor.entries.length > 200) {
      bridgeNetworkMonitor.entries = bridgeNetworkMonitor.entries.slice(-200);
    }
  } catch {
    return;
  }
}

async function executeOnTab(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return result?.result;
}

function getVisiblePageText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent) continue;
    const style = window.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    texts.push(text);
    if (texts.length >= 300) break;
  }
  return {
    title: document.title,
    url: location.href,
    text: texts.join('\n'),
  };
}

function clickTextOnPage(targetText) {
  const text = String(targetText || '').trim();
  if (!text) return { ok: false, reason: 'empty-text' };

  const candidates = Array.from(document.querySelectorAll('button, a, span, div, p, li'));
  const target = candidates.find((element) => {
    const value = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (!value) return false;
    if (value === text) return true;
    return value.includes(text) && value.length <= text.length + 20;
  });

  if (!target) {
    return { ok: false, reason: 'not-found', targetText: text };
  }

  target.click();
  return { ok: true, targetText: text, tagName: target.tagName };
}

function inputAndSendMessage(message) {
  const text = String(message || '').trim();
  if (!text) return { ok: false, reason: 'empty-message' };

  const input =
    document.querySelector('textarea') ||
    Array.from(document.querySelectorAll('[contenteditable="true"]')).find(Boolean);

  if (!input) {
    return { ok: false, reason: 'input-not-found' };
  }

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    if (setter) {
      setter.call(input, text);
    } else {
      input.value = text;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    input.textContent = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  }

  const sendButton = Array.from(document.querySelectorAll('button, span, div')).find((element) =>
    /发送/.test(String(element.textContent || '').trim()),
  );

  if (!sendButton) {
    return { ok: false, reason: 'send-button-not-found' };
  }

  sendButton.click();
  return { ok: true };
}

async function handleExtensionToolAction(action, payload, sender) {
  const tabId = sender?.tab?.id;
  if (!tabId) {
    throw new Error('未找到当前标签页，无法执行扩展工具');
  }

  if (action === 'bridge-network:start') {
    return await startBridgeNetworkMonitor(tabId);
  }

  if (action === 'bridge-network:stop') {
    return await stopBridgeNetworkMonitor();
  }

  if (action === 'bridge-network:clear') {
    return clearBridgeNetworkMonitorEntries();
  }

  if (action === 'bridge-network:status') {
    return bridgeMonitorStatus();
  }

  if (action === 'bridge-network:get') {
    return getBridgeNetworkEntries(payload || {});
  }

  throw new Error(`不支持的扩展工具动作: ${action}`);
}

function isSearchApi(url) {
  return String(url || '').includes(SEARCH_API_PATH);
}

function executeSearchInPage(query) {
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const candidates = Array.from(document.querySelectorAll('input, textarea')).filter((element) => {
    const placeholder = clean(element.getAttribute('placeholder') || '');
    const name = clean(element.getAttribute('name') || '');
    const ariaLabel = clean(element.getAttribute('aria-label') || '');
    return /搜索|牛人|候选人|关键词|人才/.test(`${placeholder} ${name} ${ariaLabel}`);
  });

  const input = candidates[0];
  if (!input) {
    return { ok: false, reason: 'search-input-not-found' };
  }

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) {
    setter.call(input, query);
  } else {
    input.value = query;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus();

  const button =
    input.closest('form')?.querySelector('button') ||
    input.parentElement?.querySelector('button') ||
    Array.from(document.querySelectorAll('button, span, div')).find((element) =>
      /搜索|查找/.test(clean(element.textContent || '')),
    );

  if (button) {
    button.click();
    return { ok: true, strategy: 'button' };
  }

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
  return { ok: true, strategy: 'enter' };
}

async function processSearchResponse(payload) {
  const geeks = Array.isArray(payload?.zpData?.geeks) ? payload.zpData.geeks : [];
  const candidates = geeks.map(simplifyGeek).filter((item) => item.uniqSign);
  if (!candidates.length) {
    return;
  }

  const config = await getConfig();
  const matched = await matchCandidates(config, candidates);
  const matchedMap = new Map(matched.map((item) => [item.uniqSign, item]));

  await updateState((previousState) => {
    const nextMatchedCandidates = { ...(previousState.matchedCandidates || {}) };
    const nextMatchedUniqSigns = new Set(previousState.matchedUniqSigns || []);

    candidates.forEach((candidate) => {
      const decision = matchedMap.get(candidate.uniqSign);
      if (!decision) return;

      nextMatchedUniqSigns.add(candidate.uniqSign);
      nextMatchedCandidates[candidate.uniqSign] = {
        ...candidate,
        reason: decision.reason,
        lastSeenAt: new Date().toISOString(),
        page: payload?.zpData?.page ?? null,
      };
    });

    return {
      matchedCandidates: nextMatchedCandidates,
      matchedUniqSigns: [...nextMatchedUniqSigns],
      lastSearchMeta: {
        page: payload?.zpData?.page ?? null,
        startIndex: payload?.zpData?.startIndex ?? null,
        totalCount: payload?.zpData?.totalCount ?? null,
        hasMore: Boolean(payload?.zpData?.hasMore),
        segs: sanitizeText(payload?.zpData?.segs),
        updatedAt: new Date().toISOString(),
      },
    };
  });

  if (activeMonitor) {
    activeMonitor.processedPages += 1;
    activeMonitor.processedCandidates += candidates.length;
  }

  await setStatus({
    running: true,
    phase: 'matching',
    message: `已处理第 ${payload?.zpData?.page ?? '?'} 页，当前页 ${candidates.length} 人，累计命中 ${matched.length} 人`,
    processedPages: activeMonitor?.processedPages || 0,
    processedCandidates: activeMonitor?.processedCandidates || 0,
  });
}

async function handleResponseBody(requestId) {
  if (!activeMonitor) return;
  const target = { tabId: activeMonitor.tabId };
  const bodyResult = await chrome.debugger.sendCommand(target, 'Network.getResponseBody', { requestId });
  const bodyText = decodeResponseBody(bodyResult);
  if (!bodyText) return;

  const payload = JSON.parse(bodyText);
  if (payload?.code !== 0 || !payload?.zpData) {
    return;
  }

  await processSearchResponse(payload);
}

async function stopMonitoring(message = '已停止监听搜索接口') {
  if (!activeMonitor) {
    await setStatus({
      running: false,
      phase: 'idle',
      message,
    });
    return;
  }

  const { tabId } = activeMonitor;
  activeMonitor = null;
  await detachDebugger(tabId);
  await setStatus({
    running: false,
    phase: 'idle',
    message,
  });
}

async function startMonitoring(applyQuery) {
  const config = await getConfig();
  const tab = await getActiveSearchTab(config.searchPageUrl);

  if (activeMonitor?.tabId && activeMonitor.tabId !== tab.id) {
    await stopMonitoring('切换到新的标签页，已停止旧监听');
  }
  if (activeMonitor?.tabId === tab.id) {
    throw new Error('当前搜索页已经在监听中');
  }

  await attachDebugger(tab.id);
  activeMonitor = {
    tabId: tab.id,
    pendingRequests: new Set(),
    seenRequestIds: new Set(),
    processing: Promise.resolve(),
    processedPages: 0,
    processedCandidates: 0,
  };

  await updateState((previousState) => ({
    ...previousState,
    requirementSnapshot: {
      targetCity: config.targetCity,
      jdText: config.jdText,
      hiringHighlights: config.hiringHighlights,
      candidatePersona: config.candidatePersona,
      generatedQuery: config.generatedQuery,
      queryAlternatives: config.queryAlternatives,
      updatedAt: new Date().toISOString(),
    },
  }));

  await setStatus({
    running: true,
    phase: applyQuery ? 'searching' : 'listening',
    message: applyQuery ? `已连接调试器，准备执行搜索: ${config.generatedQuery}` : '已连接调试器，等待搜索接口返回数据',
    processedPages: 0,
    processedCandidates: 0,
  });

  if (applyQuery) {
    if (!config.generatedQuery) {
      throw new Error('请先生成搜索词');
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: executeSearchInPage,
      args: [config.generatedQuery],
    });

    if (!result?.result?.ok) {
      throw new Error(`搜索页执行搜索失败: ${result?.result?.reason || 'unknown'}`);
    }
  }
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(async () => {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    const current = await chrome.storage.local.get([CONFIG_KEY, STATUS_KEY, STORAGE_KEY]);
    if (!current[CONFIG_KEY]) {
      await chrome.storage.local.set({ [CONFIG_KEY]: DEFAULT_CONFIG });
    }
    if (!current[STATUS_KEY]) {
      await chrome.storage.local.set({ [STATUS_KEY]: defaultStatus() });
    }
    if (!current[STORAGE_KEY]) {
      await chrome.storage.local.set({ [STORAGE_KEY]: defaultState() });
    }
  });

  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (bridgeNetworkMonitor && source.tabId === bridgeNetworkMonitor.tabId) {
      if (method === 'Network.responseReceived' && isJsonLikeResponse(params?.response)) {
        bridgeNetworkMonitor.pendingRequests.set(params.requestId, {
          url: params?.response?.url || '',
          method: params?.request?.method || 'GET',
          status: params?.response?.status ?? null,
          mimeType: params?.response?.mimeType || '',
        });
        return;
      }

      if (method === 'Network.loadingFinished' && bridgeNetworkMonitor.pendingRequests.has(params.requestId)) {
        const requestMeta = bridgeNetworkMonitor.pendingRequests.get(params.requestId);
        bridgeNetworkMonitor.pendingRequests.delete(params.requestId);
        if (!requestMeta) return;
        if (bridgeNetworkMonitor.seenRequestIds.has(params.requestId)) return;
        bridgeNetworkMonitor.seenRequestIds.add(params.requestId);
        handleBridgeResponseBody(params.requestId).catch(() => {});
        return;
      }
    }

    if (!activeMonitor || source.tabId !== activeMonitor.tabId) return;

    if (method === 'Network.responseReceived' && isSearchApi(params?.response?.url)) {
      activeMonitor.pendingRequests.add(params.requestId);
      return;
    }

    if (method === 'Network.loadingFinished' && activeMonitor.pendingRequests.has(params.requestId)) {
      activeMonitor.pendingRequests.delete(params.requestId);
      if (activeMonitor.seenRequestIds.has(params.requestId)) return;
      activeMonitor.seenRequestIds.add(params.requestId);
      activeMonitor.processing = activeMonitor.processing
        .then(() => handleResponseBody(params.requestId))
        .catch(async (error) => {
          await setStatus({
            running: true,
            phase: 'error',
            message: error instanceof Error ? error.message : String(error),
            processedPages: activeMonitor?.processedPages || 0,
            processedCandidates: activeMonitor?.processedCandidates || 0,
          });
        });
    }
  });

  chrome.debugger.onDetach.addListener((source) => {
    if (bridgeNetworkMonitor && source.tabId === bridgeNetworkMonitor.tabId) {
      bridgeNetworkMonitor = null;
    }

    if (!activeMonitor || source.tabId !== activeMonitor.tabId) return;
    activeMonitor = null;
    setStatus({
      running: false,
      phase: 'detached',
      message: '调试连接已断开，请重新开始监听',
    }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'boss-agent:extension-tool') {
      handleExtensionToolAction(message.action, message.payload, sender)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    if (message?.type === 'boss-agent:get-app-state') {
      getState()
        .then((state) => sendResponse(state))
        .catch((error) => sendResponse({ error: String(error) }));
      return true;
    }

    if (message?.type === 'boss-agent:save-config') {
      const config = normalizeConfig(message.payload || {});
      chrome.storage.local
        .set({ [CONFIG_KEY]: config })
        .then(async () => {
          await setStatus({
            running: Boolean(activeMonitor),
            phase: activeMonitor ? 'listening' : 'configured',
            message: activeMonitor ? '配置已更新，后续分页会使用新招聘要求继续匹配' : '招聘需求已保存',
            processedPages: activeMonitor?.processedPages || 0,
            processedCandidates: activeMonitor?.processedCandidates || 0,
          });
          sendResponse({ ok: true });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === 'boss-agent:generate-query') {
      getConfig()
        .then(async (config) => {
          const result = await generateSearchQuery(config);
          const nextConfig = {
            ...config,
            generatedQuery: result.query,
            queryAlternatives: result.alternatives,
          };
          await chrome.storage.local.set({ [CONFIG_KEY]: nextConfig });
          await updateState(() => ({
            generatedQuery: result.query,
            queryAlternatives: result.alternatives,
          }));
          await setStatus({
            running: Boolean(activeMonitor),
            phase: activeMonitor ? 'listening' : 'query-ready',
            message: `已生成搜索词: ${result.query}`,
            processedPages: activeMonitor?.processedPages || 0,
            processedCandidates: activeMonitor?.processedCandidates || 0,
          });
          sendResponse({ ok: true, data: result });
        })
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    if (message?.type === 'boss-agent:start-monitor') {
      startMonitoring(Boolean(message.applyQuery))
        .then(() => sendResponse({ ok: true }))
        .catch(async (error) => {
          await stopMonitoring(error instanceof Error ? error.message : String(error));
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    if (message?.type === 'boss-agent:stop-monitor') {
      stopMonitoring('已手动停止监听')
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === 'boss-agent:clear-results') {
      stopMonitoring('已清空结果并停止监听')
        .then(async () => {
          await chrome.storage.local.set({ [STORAGE_KEY]: defaultState() });
          sendResponse({ ok: true });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    return false;
  });
});
