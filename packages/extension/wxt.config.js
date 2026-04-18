import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
    server: {
      port: 3000,
    },
  }),
  extensionApi: 'chrome',
  manifest: {
    name: 'Boss 巡检台',
    description: 'Run the unread-message screening workflow from the side panel.',
    permissions: ['sidePanel'],
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
    action: {
      default_title: 'Boss 巡检台',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
  dev: {
    server: {
      port: 3000,
    },
  },
});
