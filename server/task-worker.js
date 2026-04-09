import dotenv from 'dotenv';
import process from 'node:process';
import { runUnreadScreeningAgent } from '../agents/unread-screening-agent.js';
import { isAbortError, normalizeBridgeError } from './bridge.js';

dotenv.config();

let currentAbortController = null;

function sendMessage(message) {
  if (typeof process.send === 'function') {
    process.send(message);
  }
}

function createAbortController() {
  currentAbortController = new AbortController();
  return currentAbortController;
}

async function runTask(payload) {
  const abortController = createAbortController();

  try {
    const result = await runUnreadScreeningAgent({
      targetProfile: payload.targetProfile,
      rejectionMessage: payload.rejectionMessage,
      taskId: payload.taskId,
      mode: payload.mode,
      abortSignal: abortController.signal,
      onToolEvent: toolEvent => {
        sendMessage({
          type: 'tool-event',
          data: toolEvent,
        });
      },
      onTaskUpdate: taskData => {
        sendMessage({
          type: 'task-update',
          data: taskData,
        });
      },
    });

    sendMessage({
      type: 'task-finished',
      data: result,
    });
    process.exit(0);
  } catch (error) {
    const aborted = isAbortError(error) || abortController.signal.aborted;
    sendMessage({
      type: 'task-failed',
      data: {
        aborted,
        error: aborted ? '任务已停止' : normalizeBridgeError(error),
      },
    });
    process.exit(aborted ? 0 : 1);
  }
}

process.on('message', message => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'start-task') {
    void runTask(message.payload || {});
    return;
  }

  if (message.type === 'abort-task' && currentAbortController && !currentAbortController.signal.aborted) {
    currentAbortController.abort(new Error(message.reason || '任务已停止'));
  }
});

process.on('disconnect', () => {
  if (currentAbortController && !currentAbortController.signal.aborted) {
    currentAbortController.abort(new Error('父进程已断开，任务已停止'));
  }
});
