import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  extensionApi: 'chrome',
  manifest: {
    name: 'Boss Unread Screening Agent',
    description: 'Run the unread-message screening workflow from the side panel.',
    permissions: ['sidePanel'],
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
    action: {
      default_title: 'Boss Unread Screening Agent',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
