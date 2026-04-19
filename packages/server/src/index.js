import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizeBridgeError } from './server/bridge.js';
import {
  recordFatalBridgeError,
  handleBridgeStatus,
  handleDeleteJobProfile,
  handleDeleteScreeningTask,
  handleHealth,
  handleImportJobProfile,
  handleListJobProfiles,
  handleListScreeningTasks,
  handleReadJobProfile,
  handleReadScreeningTask,
  handleSaveJobProfile,
  handleScreenUnreadStart,
  handleScreenUnreadState,
  handleScreenUnreadStop,
  handleScreenUnreadSubscribeByTaskId,
} from './server/controllers/screening-controller.js';
import { handleGetModelConfig, handleSaveModelConfig } from './server/controllers/model-config-controller.js';
import { createServerState } from './server/state.js';
import { startScheduler, stopScheduler } from './agents/services/job-profile-scheduler.js';
import { buildTargetProfileFromJobProfile } from './shared/job-profiles.js';
import { getModelConfig } from './server/model-config-store.js';
import { applyModelConfigToMidscene } from './server/midscene-model-config.js';
import { getMidsceneRunDirName, getRuntimeRoot } from './server/runtime-paths.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const host = '127.0.0.1';

let activeServer = null;
let activeServerState = null;
let shutdownRegistered = false;

function renderStartupBanner({ serverUrl, dataDir }) {
  const lines = [
    'Boss AI Agent',
    `Server   ${serverUrl}`,
    `Data Dir ${dataDir}`,
    'Mode     Chrome Bridge',
  ];
  const width = Math.max(...lines.map(line => line.length), 18);
  const border = `+${'-'.repeat(width + 2)}+`;

  return [
    '',
    border,
    ...lines.map(line => `| ${line.padEnd(width)} |`),
    border,
  ];
}

// 从数据库加载模型配置到环境变量，供 Midscene 使用
function syncModelEnvFromDb() {
  try {
    const config = getModelConfig();
    process.env.MIDSCENE_RUN_DIR = getMidsceneRunDirName();
    applyModelConfigToMidscene(config);
  } catch {
    // 忽略，env vars 已有 dotenv 加载的默认值
  }
}
syncModelEnvFromDb();

function createUploadMiddleware() {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      files: 10,
      fileSize: 15 * 1024 * 1024,
    },
  });
}

function createSchedulerTaskStarter(serverState) {
  return async profile => {
    console.log(`[Scheduler] Creating auto-inspection task for: ${profile.title}`);

    const targetProfile = buildTargetProfileFromJobProfile(profile);
    const rejectionMessage =
      profile.rejectionMessage || '您的简历很优秀，但是经验不匹配';

    const mockReq = {
      body: {
        targetProfile,
        rejectionMessage,
        jobTitle: profile.title,
        jobProfileId: profile.id,
        testCandidateNames: [],
        mode: 'start',
      },
    };

    const mockRes = {
      status() {
        return this;
      },
      json(data) {
        console.log('[Scheduler] Task creation response:', data);
        return this;
      },
      setHeader() {
        return this;
      },
      on() {
        return this;
      },
    };

    try {
      await handleScreenUnreadStart(mockReq, mockRes, serverState);
    } catch (error) {
      console.error(`[Scheduler] Failed to create task for ${profile.title}:`, error);
    }
  };
}

function createApp(serverState) {
  const upload = createUploadMiddleware();
  const app = express();

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.post('/api/screen-unread/start', (req, res) =>
    handleScreenUnreadStart(req, res, serverState));
  app.get('/api/screen-unread/subscribe/:taskId', (req, res) =>
    handleScreenUnreadSubscribeByTaskId(res, serverState, req.params.taskId));
  app.post('/api/screen-unread/stop', (req, res) =>
    handleScreenUnreadStop(res, serverState));
  app.get('/api/screen-unread/state', (req, res) =>
    handleScreenUnreadState(res, serverState));

  app.get('/api/screening-tasks', (req, res) =>
    handleListScreeningTasks(
      res,
      String(req.query.status || '').trim(),
      String(req.query.jobProfileId || '').trim(),
    ));
  app.get('/api/screening-tasks/:taskId', (req, res) =>
    handleReadScreeningTask(res, serverState, req.params.taskId));
  app.delete('/api/screening-tasks/:taskId', (req, res) =>
    handleDeleteScreeningTask(res, serverState, req.params.taskId));

  app.get('/api/job-profiles', (req, res) =>
    handleListJobProfiles(res));
  app.post('/api/job-profiles', (req, res) =>
    handleSaveJobProfile(req, res, ''));
  app.get('/api/job-profiles/:profileId', (req, res) =>
    handleReadJobProfile(res, req.params.profileId));
  app.put('/api/job-profiles/:profileId', (req, res) =>
    handleSaveJobProfile(req, res, req.params.profileId));
  app.delete('/api/job-profiles/:profileId', (req, res) =>
    handleDeleteJobProfile(res, req.params.profileId));
  app.post('/api/job-profiles/import', upload.array('files'), (req, res) =>
    handleImportJobProfile(req, res));

  app.get('/api/model-config', (req, res) =>
    handleGetModelConfig(res));
  app.put('/api/model-config', (req, res) =>
    handleSaveModelConfig(req, res));

  app.get('/api/health', (req, res) =>
    handleHealth(res, serverState));
  app.get('/api/bridge-status', (req, res) =>
    handleBridgeStatus(res));

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  return app;
}

function registerShutdownHandlers() {
  if (shutdownRegistered) {
    return;
  }

  process.on('unhandledRejection', error => {
    if (activeServerState) {
      recordFatalBridgeError(activeServerState, error);
    }
  });

  process.on('uncaughtException', error => {
    if (activeServerState) {
      recordFatalBridgeError(activeServerState, error);
    }
  });

  const shutdown = () => {
    stopScheduler();
    activeServer?.close();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  shutdownRegistered = true;
}

export async function startServer() {
  if (activeServer) {
    return activeServer;
  }

  syncModelEnvFromDb();

  const port = Number(process.env.BRIDGE_DEMO_PORT || 3322);
  const serverState = createServerState();
  const app = createApp(serverState);

  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => {
      const bannerLines = renderStartupBanner({
        serverUrl: `http://${host}:${port}`,
        dataDir: getRuntimeRoot(),
      });
      for (const line of bannerLines) {
        console.log(line);
      }
      console.log(
        '先确保 Midscene Chrome 扩展已开启 Bridge Mode Listening，并把要操作的 Chrome 标签页切到最前。',
      );

      startScheduler(createSchedulerTaskStarter(serverState), 120);
      resolve(instance);
    });

    instance.on('error', error => {
      if (error && error.code === 'EADDRINUSE') {
        console.error(`端口 ${port} 已被占用。`);

        if (process.platform === 'win32') {
          console.error(
            `Windows 下可以先执行: Get-NetTCPConnection -LocalPort ${port} -State Listen`,
          );
          console.error('再执行: Stop-Process -Id <OwningProcess> -Force');
        } else {
          console.error(
            `如果是上一次的 demo 还在运行，可以先执行: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
          );
        }

        console.error(
          `然后结束对应进程，或改用其他端口启动: BRIDGE_DEMO_PORT=3333 npm run bridge-demo`,
        );
        reject(error);
        return;
      }

      reject(error);
    });
  });

  activeServer = server;
  activeServerState = serverState;
  registerShutdownHandlers();
  return server;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  startServer().catch(error => {
    if (error?.code === 'EADDRINUSE') {
      process.exit(1);
      return;
    }

    throw error;
  });
}
