import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import process from 'node:process';
import { normalizeBridgeError } from './bridge.js';
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
} from './controllers/screening-controller.js';
import { createServerState } from './state.js';
import { startScheduler, stopScheduler } from '../agents/services/job-profile-scheduler.js';
import { buildTargetProfileFromJobProfile } from '../../../shared/job-profiles.js';

dotenv.config();

const host = '127.0.0.1';
const port = Number(process.env.BRIDGE_DEMO_PORT || 3322);
const serverState = createServerState();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 15 * 1024 * 1024,
  },
});

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
    String(req.query.jobProfileId || '').trim()
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

app.get('/api/health', (req, res) =>
  handleHealth(res, serverState));
app.get('/api/bridge-status', (req, res) =>
  handleBridgeStatus(res));

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

const server = app.listen(port, host, () => {
  console.log(`Bridge demo is running at http://${host}:${port}`);
  console.log(
    '先确保 Midscene Chrome 扩展已开启 Bridge Mode Listening，并把要操作的 Chrome 标签页切到最前。',
  );
  
  // 启动定时任务调度器
  startScheduler(async (profile) => {
    console.log(`[Scheduler] Creating auto-inspection task for: ${profile.title}`);
    
    const targetProfile = buildTargetProfileFromJobProfile(profile);
    const rejectionMessage = profile.rejectionMessage || '您的简历很优秀，但是经验不匹配';
    
    // 模拟一个请求对象来调用现有的启动逻辑
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
      status: function(code) { return this; },
      json: (data) => {
        console.log(`[Scheduler] Task creation response:`, data);
        return mockRes;
      },
      setHeader: () => mockRes,
      on: () => mockRes,
    };
    
    try {
      await handleScreenUnreadStart(mockReq, mockRes, serverState);
    } catch (error) {
      console.error(`[Scheduler] Failed to create task for ${profile.title}:`, error);
    }
  }, 120); // 每2小时检查一次
});

server.on('error', error => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。`);

    if (process.platform === 'win32') {
      console.error(
        `Windows 下可以先执行: Get-NetTCPConnection -LocalPort ${port} -State Listen`,
      );
      console.error(
        '再执行: Stop-Process -Id <OwningProcess> -Force',
      );
    } else {
      console.error(
        `如果是上一次的 demo 还在运行，可以先执行: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
      );
    }

    console.error(
      `然后结束对应进程，或改用其他端口启动: BRIDGE_DEMO_PORT=3333 npm run bridge-demo`,
    );
    process.exit(1);
  }

  throw error;
});

process.on('unhandledRejection', error => {
  recordFatalBridgeError(serverState, error);
});

process.on('uncaughtException', error => {
  recordFatalBridgeError(serverState, error);
});

process.on('SIGTERM', () => {
  stopScheduler();
  server.close();
});

process.on('SIGINT', () => {
  stopScheduler();
  server.close();
});
