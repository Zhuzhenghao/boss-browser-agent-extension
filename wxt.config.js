import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  manifest: {
    name: 'Boss Search Agent',
    description: 'Intercept Boss search results, match candidates with AI, and store uniqSigns.',
    permissions: ['storage', 'tabs', 'sidePanel', 'scripting', 'debugger'],
    host_permissions: ['https://www.zhipin.com/*', 'http://127.0.0.1/*', 'http://localhost/*'],
    action: {
      default_title: 'Boss Search Agent',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
