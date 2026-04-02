import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { runUnreadScreeningAgent } from './unread-screening-agent.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(__dirname, 'index.html');
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

function assertEnv(name) {
  if (!process.env[name]) {
    throw new Error(`缺少环境变量 ${name}`);
  }
}

async function runPrompt(prompt) {
  assertEnv('MIDSCENE_MODEL_API_KEY');
  assertEnv('MIDSCENE_MODEL_NAME');
  assertEnv('MIDSCENE_MODEL_BASE_URL');
  assertEnv('MIDSCENE_MODEL_FAMILY');

  const agent = new AgentOverChromeBridge({
    allowRemoteAccess: false,
    closeNewTabsAfterDisconnect: false,
  });

  try {
    await agent.connectCurrentTab({ forceSameTabNavigation: true });
    return await agent.aiAct(prompt);
  } finally {
    await agent.destroy();
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

  if (req.method === 'GET' && req.url === '/') {
    const html = await fs.readFile(pagePath, 'utf8');
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/run') {
    if (running) {
      sendJson(res, 409, { ok: false, error: '已有任务在执行，请稍后再试' });
      return;
    }

    (async () => {
      try {
        const body = await parseRequestBody(req);
        const prompt = String(body.prompt || '').trim();

        if (!prompt) {
          sendJson(res, 400, { ok: false, error: '请输入要执行的指令' });
          return;
        }

        running = true;
        const planResult = await runPrompt(prompt);
        sendJson(res, 200, { ok: true, data: planResult });
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        running = false;
      }
    })();
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
          error: error instanceof Error ? error.message : String(error),
        });
        sendJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
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
    sendJson(res, 200, { ok: true, running });
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
