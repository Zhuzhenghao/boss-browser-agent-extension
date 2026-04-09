import { wait } from '../services/browser-actions.js';
import { createMidsceneDebug } from '../services/midscene-debug.js';

const CHAT_INDEX_URL = 'https://www.zhipin.com/web/chat/index';
const debugDiscovery = createMidsceneDebug('boss-agent:discovery');

export async function switchToUnread(browserAgent, log) {
  const switchUnreadPrompt = [
    '只处理左侧消息列表区域，不要操作页面顶部那一排“全部 / 新招呼 / 沟通中 / 已约面 / 已获取简历 / 已交换电话”分类。',
    '',
    '目标区域特征：',
    '1. 左侧消息列表上方能看到“全部职位”下拉框和搜索按钮。',
    '2. 就在“全部职位”下拉框下面，有一行很短的筛选项，只有“全部”和“未读”两个词，右侧可能还有“批量”。',
    '3. 你这次只允许操作这一行里的“未读”，不要点击任何别的“全部”。',
    '',
    '选中态判断标准：',
    '1. 当前被选中的那个词，文字颜色会更亮，呈蓝绿色/青绿色。',
    '2. 没被选中的词，文字颜色更深，接近黑色或深灰色。',
    '3. 在你看到的这个区域里，如果“未读”是更亮的蓝绿色，而“全部”更深更暗，就说明“未读”已经选中。',
    '',
    '执行要求：',
    '1. 先观察“全部职位”下方这一行短筛选栏。',
    '2. 如果这里的“未读”已经是当前选中态，就不要重复点击，直接停止。',
    '3. 如果这里当前不是“未读”，就只点击这一行里的“未读”一次，然后停止。',
    '4. 严禁点击页面顶部沟通分类里的“全部”，严禁点击“全部职位”下拉框，严禁点击“批量”。',
  ].join('\n');

  try {
    await browserAgent.aiAct(switchUnreadPrompt);
    debugDiscovery('switch unread via aiAct ok=true');
    log?.('已尝试切换到左侧消息列表的未读筛选。');
    return { ok: true, via: 'aiAct' };
  } catch (error) {
    debugDiscovery(
      'switch unread via aiAct failed: %s',
      error instanceof Error ? error.message : String(error),
    );
    return { ok: false, reason: 'switch-unread-failed' };
  }
}

async function navigateToChatIndex(browserAgent) {
  if (typeof browserAgent?.page?.goto === 'function') {
    await browserAgent.page.goto(CHAT_INDEX_URL);
    debugDiscovery('navigate chat index via page.goto ok=true');
    return { ok: true, via: 'page.goto' };
  }

  if (typeof browserAgent?.page?.evaluateJavaScript === 'function') {
    try {
      await browserAgent.page.evaluateJavaScript(
        `window.location.href = ${JSON.stringify(CHAT_INDEX_URL)}`,
      );
      debugDiscovery('navigate chat index via location.href ok=true');
      return { ok: true, via: 'location.href' };
    } catch (error) {
      debugDiscovery(
        'navigate chat index via location.href failed: %s',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  await browserAgent.aiAct(
    `在当前已经连接的这个 Chrome 标签页中，直接访问 ${CHAT_INDEX_URL}。必须复用当前 tab，不要新开标签页，不要切到别的标签页。页面打开后停留在 Boss 直聘沟通页。`,
  );
  debugDiscovery('navigate chat index via aiAct fallback ok=true');
  return { ok: true, via: 'aiAct' };
}

export async function openChatIndex(browserAgent, log) {
  log?.('打开沟通页，并准备查看未读消息。');
  await navigateToChatIndex(browserAgent);
  await wait(1200);
  await switchToUnread(browserAgent, log);
  await wait(1000);
  return { ok: true, url: CHAT_INDEX_URL };
}

function sanitizeNameList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(item => String(item || '').trim()).filter(Boolean);
}

export async function readUnreadCandidates(browserAgent, log) {
  await switchToUnread(browserAgent, log);
  await wait(800);
  const unreadNamesPrompt = [
    '只观察左侧消息列表区域，不要观察页面顶部那一排沟通分类。',
    '只关注“全部职位”下拉框下面那一行短筛选栏，并以那里切到“未读”后的列表内容为准。',
    '在这个短筛选栏里，“未读”选中时通常显示为更亮的蓝绿色/青绿色；“全部”未选中时颜色更深，接近黑色或深灰色。',
    '请读取左侧消息列表中当前展示的所有未读候选人名字。',
    '只返回 JSON：{"names":["姓名1","姓名2"]}。',
    '如果当前未读列表为空，返回空数组。',
    '不要读取页面顶部分类，不要读取“全部”列表，也不要补充不存在的名字。',
  ].join('\n');
  const result = await browserAgent.aiQuery(
    unreadNamesPrompt,
  );
  const names = sanitizeNameList(result?.names);
  log?.(`识别到未读消息发送人: ${names.join('、') || '无'}`);
  return { names };
}

export async function getUnreadSenderNames(browserAgent, log) {
  return readUnreadCandidates(browserAgent, log);
}

export async function ensureSelectableCandidateList(
  browserAgent,
  log,
  options = {},
) {
  const { preferUnread = true } = options;
  const listPrompt = preferUnread
    ? '回到 Boss 直聘沟通页的左侧消息列表可操作状态。如果当前有在线简历弹层、遮罩或其他覆盖层，先关闭它们。然后把注意力放到左侧消息列表区域和“全部职位”下方那一行短筛选栏，只确保当前已经回到可以继续选择候选人的消息列表视图。若“未读”不是高亮态，就点击“未读”一次；若已经高亮，就不要重复点击。'
    : '回到 Boss 直聘沟通页的左侧消息列表可操作状态。如果当前有在线简历弹层、遮罩或其他覆盖层，先关闭它们。如果当前正在某位候选人的聊天页，就返回到左侧消息列表可以继续点选候选人的状态。不要强制切换到“未读”，也不要改动顶部沟通分类；只要左侧消息列表已经可见、可继续选择候选人，就停止。';

  await browserAgent.aiAct(listPrompt);
  await wait(1200);
  const statePrompt = preferUnread
    ? '只观察左侧消息列表区域和“全部职位”下方那一行短筛选栏。请判断当前是否已经处于可继续选择候选人的列表页。只返回 JSON：{"ready":true|false,"reason":"一句中文依据"}。如果左侧展示的是消息列表，并且“未读”高亮或当前列表 clearly 可继续点选候选人，就返回 true。'
    : '只观察左侧消息列表区域和“全部职位”下方那一行短筛选栏。请判断当前是否已经处于可继续选择候选人的列表页。只返回 JSON：{"ready":true|false,"reason":"一句中文依据"}。只要左侧展示的是消息列表，并且此时可以继续点选候选人，就返回 true；不要把“未读”是否高亮当成必要条件。';
  const state = await browserAgent.aiQuery(statePrompt);

  if (state?.ready !== true) {
    throw new Error(
      `未能回到可选择候选人的列表页：${String(state?.reason || '未知原因')}`,
    );
  }

  log?.(
    preferUnread
      ? '已回到可继续选择候选人的未读列表页。'
      : '已回到可继续选择候选人的消息列表页。',
  );
  return {
    ok: true,
    ready: true,
    reason: String(state?.reason || ''),
  };
}
