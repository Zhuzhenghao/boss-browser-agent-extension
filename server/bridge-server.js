import http from 'node:http';
import process from 'node:process';
import dotenv from 'dotenv';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { runUnreadScreeningAgent } from '../agents/unread-screening-agent.js';

dotenv.config();

const host = '127.0.0.1';
const port = Number(process.env.BRIDGE_DEMO_PORT || 3322);

let running = false;
let unreadTaskState = {
  running: false,
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  summary: '',
  operationLog: [],
  steps: [],
  latestStep: null,
  error: null,
};

function recordFatalBridgeError(error) {
  const message = normalizeBridgeError(error);
  running = false;
  mergeUnreadTaskState({
    running: false,
    status: 'error',
    finishedAt: new Date().toISOString(),
    error: message,
  });
  console.error(message);
}

function resetUnreadTaskState() {
  unreadTaskState = {
    running: false,
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    summary: '',
    operationLog: [],
    steps: [],
    latestStep: null,
    error: null,
  };
}

function mergeUnreadTaskState(partial) {
  unreadTaskState = {
    ...unreadTaskState,
    ...partial,
  };

  if (partial?.latestStep) {
    const nextSteps = [...(unreadTaskState.steps || [])];
    const index = Math.max(0, Number(partial.latestStep.stepNumber || 1) - 1);
    nextSteps[index] = partial.latestStep;
    unreadTaskState.steps = nextSteps;
  }
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function normalizeBridgeError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (/no tab is connected/i.test(message)) {
    return 'Midscene 已连接到扩展，但当前没有绑定可操作的 Chrome 标签页。请先把目标 Boss 页面切到前台，并在 Midscene 扩展里重新连接当前 tab。';
  }

  if (/one client connected/i.test(message)) {
    return 'Midscene 扩展已连接，但当前桥接状态还没有准备好。请确认扩展已开启 Bridge Mode Listening，并重新连接当前标签页。';
  }

  return message;
}

async function checkBridgeReady() {
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

async function parseRequestBody(req) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));

  return await new Promise((resolve, reject) => {
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/screen-unread') {
    if (running) {
      sendJson(res, 409, { ok: false, error: '已有任务在执行，请稍后再试' });
      return;
    }

    (async () => {
      try {
        const body = await parseRequestBody(req);
        const targetProfile = String(body.targetProfile || '').trim();
        const rejectionMessage = String(body.rejectionMessage || '').trim();

        if (!targetProfile) {
          sendJson(res, 400, { ok: false, error: '请先填写目标候选人的特征' });
          return;
        }

        const bridgeStatus = await checkBridgeReady();
        if (!bridgeStatus.ok) {
          mergeUnreadTaskState({
            running: false,
            status: 'error',
            finishedAt: new Date().toISOString(),
            error: bridgeStatus.message,
          });
          sendJson(res, 409, { ok: false, error: bridgeStatus.message });
          return;
        }

        running = true;
        resetUnreadTaskState();
        mergeUnreadTaskState({
          running: true,
          status: 'running',
          startedAt: new Date().toISOString(),
        });
        const result = await runUnreadScreeningAgent({
          targetProfile,
          rejectionMessage,
          onProgress: progress => {
            mergeUnreadTaskState(progress);
          },
        });
        mergeUnreadTaskState({
          ...result,
          running: false,
          status: 'completed',
          finishedAt: new Date().toISOString(),
          error: null,
        });
        sendJson(res, 200, { ok: true, data: result });
      } catch (error) {
        mergeUnreadTaskState({
          running: false,
          status: 'error',
          finishedAt: new Date().toISOString(),
          error: normalizeBridgeError(error),
        });
        sendJson(res, 500, {
          ok: false,
          error: normalizeBridgeError(error),
        });
      } finally {
        running = false;
      }
    })();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/screen-unread/state') {
    sendJson(res, 200, { ok: true, data: unreadTaskState });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    const bridgeStatus = await checkBridgeReady();
    sendJson(res, 200, { ok: true, running, bridge: bridgeStatus });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/bridge-status') {
    const bridgeStatus = await checkBridgeReady();
    sendJson(res, 200, { ok: true, data: bridgeStatus });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(port, host, () => {
  console.log(`Bridge demo is running at http://${host}:${port}`);
  console.log('先确保 Midscene Chrome 扩展已开启 Bridge Mode Listening，并把要操作的 Chrome 标签页切到最前。');
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。`);
    console.error(`如果是上一次的 demo 还在运行，可以先执行: lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    console.error(`然后结束对应进程，或改用其他端口启动: BRIDGE_DEMO_PORT=3333 npm run bridge-demo`);
    process.exit(1);
  }

  throw error;
});

process.on('unhandledRejection', error => {
  recordFatalBridgeError(error);
});

process.on('uncaughtException', error => {
  recordFatalBridgeError(error);
});
