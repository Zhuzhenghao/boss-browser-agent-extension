import { sendJson, setCorsHeaders } from './http.js';
import {
  handleBridgeStatus,
  handleDeleteScreeningTask,
  handleHealth,
  handleListScreeningTasks,
  handleReadScreeningTask,
  handleScreenUnreadState,
  handleScreenUnreadStop,
  handleScreenUnreadStart,
  handleScreenUnreadSubscribeByTaskId,
} from './controllers/screening-controller.js';

export async function handleRequest(req, res, state, { host, port }) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/screen-unread/start') {
    await handleScreenUnreadStart(req, res, state);
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/screen-unread/subscribe/')) {
    const url = new URL(req.url, `http://${host}:${port}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const taskId = segments[3]; // api/screen-unread/subscribe/:taskId
    handleScreenUnreadSubscribeByTaskId(res, state, taskId);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/screen-unread/stop') {
    handleScreenUnreadStop(res, state);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/screen-unread/state') {
    handleScreenUnreadState(res, state);
    return;
  }

  if (
    req.method === 'GET'
    && (req.url === '/api/screening-tasks' || req.url?.startsWith('/api/screening-tasks?'))
  ) {
    const url = new URL(req.url, `http://${host}:${port}`);
    const status = String(url.searchParams.get('status') || '').trim();
    await handleListScreeningTasks(res, status);
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/screening-tasks/')) {
    const url = new URL(req.url, `http://${host}:${port}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const taskId = segments[2];
    await handleReadScreeningTask(res, state, taskId);
    return;
  }

  if (req.method === 'DELETE' && req.url?.startsWith('/api/screening-tasks/')) {
    const url = new URL(req.url, `http://${host}:${port}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const taskId = segments[2];
    await handleDeleteScreeningTask(res, state, taskId);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    await handleHealth(res, state);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/bridge-status') {
    await handleBridgeStatus(res);
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
}
