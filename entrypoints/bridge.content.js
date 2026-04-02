export default defineContentScript({
  matches: ['https://www.zhipin.com/*'],
  main() {
    const REQUEST_SOURCE = 'boss-agent-extension-bridge';
    const RESPONSE_SOURCE = 'boss-agent-extension-bridge-response';

    window.addEventListener('message', async (event) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data || {};
      if (data?.source !== REQUEST_SOURCE || !data?.requestId || !data?.action) {
        return;
      }

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'boss-agent:extension-tool',
          action: data.action,
          payload: data.payload || {},
        });

        window.postMessage(
          {
            source: RESPONSE_SOURCE,
            requestId: data.requestId,
            ok: Boolean(result?.ok),
            data: result?.data ?? null,
            error: result?.error ?? null,
          },
          '*',
        );
      } catch (error) {
        window.postMessage(
          {
            source: RESPONSE_SOURCE,
            requestId: data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          '*',
        );
      }
    });
  },
});
