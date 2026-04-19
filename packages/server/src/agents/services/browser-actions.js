import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';
import { createMidsceneDebug } from './midscene-debug.js';

const execFileAsync = promisify(execFile);
const debugResume = createMidsceneDebug('boss-agent:resume');
const debugClipboard = createMidsceneDebug('boss-agent:resume:clipboard');

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomBetween(minMs, maxMs) {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function readClipboardText() {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $text = Get-Clipboard -Raw; [Console]::Out.Write($text)',
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const text = String(stdout || '').trim();
    debugClipboard('read clipboard on win32, length=%d', text.length);
    return text;
  }

  const { stdout } = await execFileAsync('pbpaste');
  const text = String(stdout || '').trim();
  debugClipboard('read clipboard on darwin, length=%d', text.length);
  return text;
}

async function selectResumeCanvasByJs(browserAgent) {
  const script = `
(() => {
  const iframe =
    document.querySelector('iframe[src*="c-resume"]') ||
    document.querySelector('iframe[src*="chat-resume-online"]');
  const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
  const win = iframe?.contentWindow;
  const canvas =
    doc?.querySelector('canvas#resume') ||
    doc?.querySelector('canvas[id="resume"]') ||
    doc?.querySelector('canvas');

  if (!doc || !win || !canvas || !iframe) {
    return {
      ok: false,
      reason: 'iframe/doc/canvas missing',
    };
  }

  const rect = canvas.getBoundingClientRect();
  const inset = 6;
  const start = {
    x: Math.round(rect.left + inset),
    y: Math.round(rect.top + inset),
  };
  const end = {
    x: Math.round(rect.right - inset),
    y: Math.round(rect.bottom - inset),
  };

  const fireMouse = (type, x, y, buttons = 1) => {
    canvas.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
      view: win,
    }));
  };

  canvas.click();
  fireMouse('mousedown', start.x, start.y, 1);
  fireMouse('mousemove', start.x + 20, start.y + 20, 1);
  fireMouse('mousemove', Math.round((start.x + end.x) / 2), Math.round((start.y + end.y) / 2), 1);
  fireMouse('mousemove', end.x, end.y, 1);
  fireMouse('mouseup', end.x, end.y, 0);

  return {
    ok: true,
    start,
    end,
    canvasWidth: Math.round(rect.width),
    canvasHeight: Math.round(rect.height),
  };
})()
  `.trim();

  if (browserAgent?.page?.evaluateJavaScript) {
    try {
      const result = await browserAgent.page.evaluateJavaScript(script);
      const payload = result?.result?.value ?? result ?? {};
      debugResume(
        'js canvas select ok=%s canvas=%sx%s start=%o end=%o',
        String(payload?.ok ?? false),
        String(payload?.canvasWidth ?? '?'),
        String(payload?.canvasHeight ?? '?'),
        payload?.start ?? null,
        payload?.end ?? null,
      );
      return payload;
    } catch {
      debugResume('js canvas select failed during evaluateJavaScript');
      return null;
    }
  }

  debugResume('js canvas select skipped because page.evaluateJavaScript is unavailable');
  return null;
}

async function copyResumeChunk(browserAgent, chunkLabel, chunkPrompt) {
  await browserAgent.aiAct(
    `在当前在线简历中，执行一次针对“${chunkLabel}”的文本框选复制。要求：
1. 只在在线简历的正文区操作，不要碰左侧消息列表、聊天输入框、底部操作工具条、外背景。
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
  const selectionResult = await selectResumeCanvasByJs(browserAgent);
  const selectionPayload = selectionResult ?? {};

  if (selectionPayload?.ok === false) {
    debugResume('js copy aborted because canvas locate failed: %s', selectionPayload.reason);
    throw new Error(`无法通过脚本定位在线简历画布: ${selectionPayload.reason}`);
  }

  debugResume(
    'js selection ready, hand off to ai menu copy start=%o end=%o',
    selectionPayload?.start ?? null,
    selectionPayload?.end ?? null,
  );

  const copiedText = await copyResumeChunk(
    browserAgent,
    '当前屏完整正文区域',
    '当前屏正文已经处于高亮选中状态，不要重新框选，不要拖拽。直接在当前高亮选区内右键，在弹出菜单中点击“复制”，复制完成后立刻停止',
  );
  debugClipboard('ai menu copy clipboard length=%d', copiedText.length);
  if (copiedText && copiedText.length >= 20) {
    return copiedText;
  }

  debugResume('ai menu copy failed, clipboard length=%d', copiedText.length);
  throw new Error(
    `已完成程序化选中并尝试通过右键菜单复制，但剪贴板内容仍然过短（长度 ${copiedText.length}）。`,
  );
}

export async function scrollResumeCanvasByJs(browserAgent, distance = 820) {
  const script = `
(() => {
  const iframe =
    document.querySelector('iframe[src*="c-resume"]') ||
    document.querySelector('iframe[src*="chat-resume-online"]');
  const frameDoc =
    iframe?.contentDocument || iframe?.contentWindow?.document || null;
  const doc = frameDoc || document;
  const win = frameDoc?.defaultView || window;

  const canvas =
    doc.querySelector('canvas#resume') ||
    doc.querySelector('canvas[id="resume"]');
  const resumeRoot =
    canvas?.parentElement ||
    doc.querySelector('div#resume') ||
    doc.querySelector('[id="resume"]');

  let target = null;
  let targetSource = 'none';

  if (iframe) {
    let outerCursor = iframe.parentElement;
    while (outerCursor) {
      const style = window.getComputedStyle(outerCursor);
      const isScrollable =
        outerCursor.scrollHeight > outerCursor.clientHeight + 20 &&
        /(auto|scroll|overlay|hidden)/.test(
          style.overflowY || style.overflow || '',
        );

      if (isScrollable) {
        target = outerCursor;
        targetSource = 'iframe-ancestor';
        break;
      }

      outerCursor = outerCursor.parentElement;
    }
  }

  if (!target) {
    let innerCursor = resumeRoot || canvas;
    while (innerCursor && innerCursor.parentElement) {
      const parent = innerCursor.parentElement;
      const style = win.getComputedStyle(parent);
      const isScrollable =
        parent.scrollHeight > parent.clientHeight + 20 &&
        /(auto|scroll|overlay)/.test(
          style.overflowY || style.overflow || '',
        );

      if (isScrollable) {
        target = parent;
        targetSource = 'iframe-inner';
        break;
      }

      innerCursor = parent;
    }
  }

  if (!target) {
    const outerScroller = document.scrollingElement;
    if (
      outerScroller &&
      outerScroller.scrollHeight > outerScroller.clientHeight + 20
    ) {
      target = outerScroller;
      targetSource = 'outer-document';
    }
  }

  if (!target) {
    const innerScroller = doc.scrollingElement;
    if (
      innerScroller &&
      innerScroller.scrollHeight > innerScroller.clientHeight + 20
    ) {
      target = innerScroller;
      targetSource = 'iframe-document';
    }
  }

  const viewportHeight =
    Math.round(canvas?.getBoundingClientRect?.().height || 0) ||
    Math.round(iframe?.getBoundingClientRect?.().height || 0) ||
    Math.round(resumeRoot?.getBoundingClientRect?.().height || 0) ||
    window.innerHeight ||
    0;
  const requestedDistance = Number(${Number(distance)}) || 0;
  const safeDefaultDistance = Math.max(
    360,
    Math.round(viewportHeight * 0.9),
  );
  const effectiveDistance = requestedDistance > 0
    ? requestedDistance
    : safeDefaultDistance;
  const before = target
    ? (typeof target.scrollTop === 'number' ? target.scrollTop : 0)
    : window.scrollY;
  const maxScrollTop = target
    ? Math.max(
        0,
        (target.scrollHeight || 0) - (target.clientHeight || 0),
      )
    : Math.max(
        0,
        (document.scrollingElement?.scrollHeight || 0) -
          (window.innerHeight || 0),
      );
  const nextScrollTop = Math.min(before + effectiveDistance, maxScrollTop);

  if (target && typeof target.scrollTop === 'number') {
    target.scrollTop = nextScrollTop;
    target.dispatchEvent(new Event('scroll', { bubbles: true }));
  } else {
    win.scrollBy(0, effectiveDistance);
  }

  const after = target
    ? (typeof target.scrollTop === 'number' ? target.scrollTop : 0)
    : window.scrollY;
  return {
    before,
    after,
    changed: after !== before,
    maxScrollTop,
    nextScrollTop,
    viewportHeight,
    effectiveDistance,
    usedIframe: Boolean(frameDoc),
    targetSource,
    targetTag: target?.tagName || null,
    targetId: target?.id || null,
    targetClass: target?.className || null,
  };
})()
  `.trim();

  if (browserAgent?.page?.evaluateJavaScript) {
    try {
      const result = await browserAgent.page.evaluateJavaScript(script);
      const payload = result?.result?.value ?? result ?? {};
      debugResume(
        'js scroll source=%s before=%s after=%s next=%s max=%s distance=%s',
        payload?.targetSource ?? 'unknown',
        String(payload?.before ?? ''),
        String(payload?.after ?? ''),
        String(payload?.nextScrollTop ?? ''),
        String(payload?.maxScrollTop ?? ''),
        String(payload?.effectiveDistance ?? ''),
      );
      return result;
    } catch {
      debugResume('js scroll failed during evaluateJavaScript');
      return null;
    }
  }

  debugResume('js scroll skipped because page.evaluateJavaScript is unavailable');
  return null;
}

export async function ensureResumeModalClosed(browserAgent, name) {
  await browserAgent.aiAct(
    `如果当前页面仍然显示候选人“${name}”的在线简历、简历弹窗、全屏简历层或遮罩层，就先把它关闭。优先点击弹窗右上角关闭按钮、返回按钮或遮罩层允许关闭的位置；如果页面已经回到聊天会话视图，就不要做多余操作。关闭后必须确保能看到页面右侧主聊天区域底部的消息输入区：它位于聊天消息列表下方，也位于表情、常用语、定位、加号及”求简历””换电话””换微信””不合适”等按钮的下方，真正可输入的是最底部那块白色空白编辑区，右下角有明确的”发送”按钮。`,
  );
  await wait(1000);
}

export async function ensureCandidateChatReady(browserAgent, name) {
  await ensureResumeModalClosed(browserAgent, name);
  await browserAgent.aiAct(
    `确认当前已经回到名字为“${name}”的聊天会话主视图。此时必须能同时看到页面右侧主聊天区域中的聊天消息区，以及最底部的消息输入区。这个输入区位于对话气泡正下方，也位于表情、常用语、定位、加号以及“求简历”“换电话”“换微信”“约面试”“不合适”等按钮的下方；真正可输入的是最底部那块横向展开的白色空白编辑区，右下角有明确的”发送”按钮。不要因为只看到了部分聊天操作按钮就停止；如果还没有完整回到这个聊天会话主视图，就继续返回直到回到该候选人的聊天页面。`,
  );
  await wait(800);
}
