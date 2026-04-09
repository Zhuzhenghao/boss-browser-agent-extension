import http from 'node:http';
import process from 'node:process';
import dotenv from 'dotenv';
import { normalizeBridgeError } from './bridge.js';
import { recordFatalBridgeError } from './controllers/screening-controller.js';
import { handleRequest } from './routes.js';
import { createServerState } from './state.js';

dotenv.config();

const host = '127.0.0.1';
const port = Number(process.env.BRIDGE_DEMO_PORT || 3322);
const serverState = createServerState();

const server = http.createServer(async (req, res) => {
  await handleRequest(req, res, serverState, { host, port });
});

server.listen(port, host, () => {
  console.log(`Bridge demo is running at http://${host}:${port}`);
  console.log(
    '先确保 Midscene Chrome 扩展已开启 Bridge Mode Listening，并把要操作的 Chrome 标签页切到最前。',
  );
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
