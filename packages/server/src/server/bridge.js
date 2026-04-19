import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';

export function normalizeBridgeError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (/no tab is connected/i.test(message)) {
    return 'Midscene 已连接到扩展，但当前没有绑定可操作的 Chrome 标签页。请先把目标 Boss 页面切到前台，并在 Midscene 扩展里重新连接当前 tab。';
  }

  if (/one client connected/i.test(message)) {
    return 'Midscene 扩展已连接，但当前桥接状态还没有准备好。请确认扩展已开启 Bridge Mode Listening，并重新连接当前标签页。';
  }

  return message;
}

export function isAbortError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    error?.name === 'AbortError' ||
    /aborted|abort|stopped|停止|断开/i.test(message)
  );
}

export async function checkBridgeReady() {
  const agent = new AgentOverChromeBridge({
    allowRemoteAccess: false,
    closeNewTabsAfterDisconnect: false,
  });

  try {
    await agent.connectCurrentTab({ forceSameTabNavigation: true });
    return {
      ok: true,
      message: 'Bridge 已连接到当前标签页',
    };
  } catch (error) {
    return {
      ok: false,
      message: normalizeBridgeError(error),
    };
  } finally {
    await agent.destroy().catch(() => {});
  }
}
