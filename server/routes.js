import { sendJson, setCorsHeaders } from './http.js';
import {
  handleBridgeStatus,
  handleDeleteJobProfile,
  handleDeleteScreeningTask,
  handleHealth,
  handleImportJobProfile,
  handleListJobProfiles,
  handleReadJobProfile,
  handleListScreeningTasks,
  handleReadScreeningTask,
  handleSaveJobProfile,
  handleScreenUnreadState,
  handleScreenUnreadStop,
  handleScreenUnreadStart,
  handleScreenUnreadSubscribeByTaskId,
} from './controllers/screening-controller.js';

export async function handleRequest(req, res, state, { host, port }) {
  const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/screen-unread/start') {
    await handleScreenUnreadStart(req, res, state);
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/screen-unread/subscribe/')) {
    const segments = pathname.split('/').filter(Boolean);
    const taskId = segments[3]; // api/screen-unread/subscribe/:taskId
    handleScreenUnreadSubscribeByTaskId(res, state, taskId);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/screen-unread/stop') {
    handleScreenUnreadStop(res, state);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/screen-unread/state') {
    handleScreenUnreadState(res, state);
    return;
  }

  if (
    req.method === 'GET'
    && pathname === '/api/screening-tasks'
  ) {
    const status = String(requestUrl.searchParams.get('status') || '').trim();
    await handleListScreeningTasks(res, status);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/job-profiles') {
    await handleListJobProfiles(res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/job-profiles') {
    await handleSaveJobProfile(req, res, '');
    return;
  }

  if (req.method === 'POST' && pathname === '/api/job-profiles/import') {
    await handleImportJobProfile(req, res);
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/job-profiles/')) {
    const segments = pathname.split('/').filter(Boolean);
    const profileId = segments[2];
    await handleReadJobProfile(res, profileId);
    return;
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/job-profiles/')) {
    const segments = pathname.split('/').filter(Boolean);
    const profileId = segments[2];
    await handleSaveJobProfile(req, res, profileId);
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/job-profiles/')) {
    const segments = pathname.split('/').filter(Boolean);
    const profileId = segments[2];
    await handleDeleteJobProfile(res, profileId);
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/screening-tasks/')) {
    const segments = pathname.split('/').filter(Boolean);
    const taskId = segments[2];
    await handleReadScreeningTask(res, state, taskId);
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/screening-tasks/')) {
    const segments = pathname.split('/').filter(Boolean);
    const taskId = segments[2];
    await handleDeleteScreeningTask(res, state, taskId);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    await handleHealth(res, state);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/bridge-status') {
    await handleBridgeStatus(res);
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
}
