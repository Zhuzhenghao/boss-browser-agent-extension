import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clearClipboardText() {
  await execFileAsync('/bin/sh', ['-lc', "printf '' | pbcopy"]);
}

async function readClipboardText() {
  const { stdout } = await execFileAsync('pbpaste');
  return String(stdout || '').trim();
}

async function copyResumeChunk(browserAgent, chunkLabel, chunkPrompt) {
  await clearClipboardText();
  await browserAgent.aiAct(
    `在当前在线简历 modal 中，执行一次针对“${chunkLabel}”的文本框选复制。要求：
1. 只在在线简历 modal 的正文区操作，不要碰左侧消息列表、聊天输入框、底部操作工具条、modal 外背景。
2. ${chunkPrompt}
3. 框选时宁可多覆盖一些正文和少量空白，也不要漏掉当前块中可见的正文主体内容。
4. 成功标准：当前块里可见的大部分正文文字都被高亮选中，尤其是标题、公司/项目名称、时间范围、段落正文应尽量一起被覆盖。
5. 如果你发现第一次高亮范围只覆盖了当前块里一小部分文字，或者只选中几行零散内容，这次选择视为失败；你必须立刻扩大选区重新选择一次，直到覆盖当前块的大部分正文。
6. 用拖拽完成整块文字选中后，在不破坏当前选区的前提下右键，并在弹出的菜单中点击“复制”。
7. 如果当前块里出现“其他牛人推荐”或推荐卡片，只复制当前候选人的简历正文，不要把推荐区选进去。
8. 复制完成后立刻停止，不要继续滚动。`,
  );
  await wait(600);
  return await readClipboardText();
}

export async function copyVisibleResumeText(browserAgent) {
  return await copyResumeChunk(
    browserAgent,
    '当前屏完整正文区域',
    '先识别当前屏可见简历正文区域，然后一次性覆盖当前屏里完整可见的正文主体内容，重点包含标题、公司/项目名称、时间范围、段落正文、工作经历、项目经验、教育经历、资格证书、专业技能等可见内容，不要只选一小段。',
  );
}

export async function ensureResumeModalClosed(browserAgent, name) {
  await browserAgent.aiAct(
    `如果当前页面仍然显示候选人“${name}”的在线简历 modal、简历弹窗、全屏简历层或遮罩层，就先把它关闭。优先点击弹窗右上角关闭按钮、返回按钮或遮罩层允许关闭的位置；如果页面已经回到聊天会话视图，就不要做多余操作。关闭后必须确保能看到聊天区域底部的输入框或操作工具条。`,
  );
  await wait(1000);
}

export async function ensureCandidateChatReady(browserAgent, name) {
  await ensureResumeModalClosed(browserAgent, name);
  await browserAgent.aiAct(
    `确认当前已经回到名字为“${name}”的聊天会话主视图。此时应该能看到聊天消息区，以及底部输入框或“求简历”“换电话”“换微信”“约面试”等聊天操作按钮。如果还没有回到聊天会话主视图，就继续返回直到回到该候选人的聊天页面。`,
  );
  await wait(800);
}
