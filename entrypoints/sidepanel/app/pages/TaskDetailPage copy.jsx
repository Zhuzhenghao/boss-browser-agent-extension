import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, Alert, App } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined } from '@ant-design/icons';
import TaskDetailView from '../ui/task-detail';
import {
  BRIDGE_SUBSCRIBE_ENDPOINT,
  deleteTask as deleteTaskAPI,
  fetchTaskDetail,
  resolveToolTimeline,
  startTask,
  waitForBridgeReady,
} from '../shared-hooks';

export default function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [task, setTask] = useState(null);
  const [toolTimeline, setToolTimeline] = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const subscriptionRef = useRef({
    taskId: null,
    abortController: null,
  });

  const loadingRef = useRef(false);
  const loadedTaskIdRef = useRef(null);

  // 组件挂载/卸载
  useEffect(() => {
    console.log('[Detail] Component mounted, taskId:', taskId);
    return () => {
      console.log('[Detail] Component unmounting, taskId:', taskId);
      if (subscriptionRef.current.abortController) {
        console.log('[Detail] Aborting subscription on unmount');
        subscriptionRef.current.abortController.abort();
      }
    };
  }, [taskId]);

  // SSE 订阅
  const subscribeTaskRef = useRef();
  subscribeTaskRef.current = async (taskId) => {
    if (!taskId) {
      console.error('[Detail] Cannot subscribe without taskId');
      return;
    }

    // 防止重复订阅
    if (subscriptionRef.current.taskId === taskId && subscriptionRef.current.abortController) {
      console.log('[Detail] Already subscribed to task:', taskId);
      return;
    }

    // 取消之前的订阅
    if (subscriptionRef.current.abortController) {
      console.log('[Detail] Cancelling previous subscription');
      subscriptionRef.current.abortController.abort();
    }

    console.log('[Detail] Starting subscription for task:', taskId);
    const abortController = new AbortController();
    subscriptionRef.current = { taskId, abortController };

    setRunning(true);
    setStatus('正在连接任务流...');

    try {
      const subscribeUrl = `${BRIDGE_SUBSCRIBE_ENDPOINT}/${encodeURIComponent(taskId)}`;
      console.log('[Detail] Subscribing to:', subscribeUrl);

      const response = await fetch(subscribeUrl, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`订阅失败: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      setStatus('任务执行中...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'tool-event' && data.data) {
                console.log('[Detail] Received tool-event');
                setToolTimeline(prev => [...prev, data.data]);
              }

              if (data.type === 'task-update' && data.data) {
                console.log('[Detail] Received task-update');
                setTask(data.data);
              }

              if (data.type === 'task-completed') {
                setStatus('执行完成');
                setRunning(false);
                subscriptionRef.current = { taskId: null, abortController: null };

                // 重新加载完整数据
                try {
                  const detail = await fetchTaskDetail(taskId);
                  if (detail) {
                    setTask(detail.task);
                    setToolTimeline(resolveToolTimeline(detail.task, detail.toolEvents));
                  }
                } catch (error) {
                  console.error('[Detail] Failed to reload task:', error);
                }
                return;
              }

              if (data.type === 'task-error' && data.data) {
                setStatus(data.data.error || '执行失败');
                setRunning(false);
                subscriptionRef.current = { taskId: null, abortController: null };
                return;
              }
            } catch (e) {
              console.error('[Detail] Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[Detail] Subscription aborted');
        return;
      }
      console.error('[Detail] Subscription error:', error);
      setStatus(error instanceof Error ? error.message : String(error));
      setRunning(false);
      subscriptionRef.current = { taskId: null, abortController: null };
    }
  };

  // 加载任务详情
  useEffect(() => {
    if (!taskId) return;

    // 防止重复加载
    if (loadingRef.current || loadedTaskIdRef.current === taskId) {
      console.log('[Detail] Skip loading, already loading or loaded:', taskId);
      return;
    }

    console.log('[Detail] Loading task:', taskId);
    loadingRef.current = true;
    loadedTaskIdRef.current = taskId;
    setLoading(true);

    (async () => {
      try {
        const detail = await fetchTaskDetail(taskId);
        if (detail) {
          console.log('[Detail] Task loaded, status:', detail.task?.status);
          setTask(detail.task);
          setToolTimeline(resolveToolTimeline(detail.task, detail.toolEvents));

          // 如果任务正在运行，订阅实时更新
          if (detail.task.status === 'running') {
            console.log('[Detail] Task is running, subscribing...');
            await subscribeTaskRef.current(taskId);
          } else {
            console.log('[Detail] Task is not running, status:', detail.task.status);
            setRunning(false);
            if (subscriptionRef.current.abortController) {
              subscriptionRef.current.abortController.abort();
            }
            subscriptionRef.current = { taskId: null, abortController: null };
          }
        } else {
          console.log('[Detail] No task detail returned');
        }
      } catch (error) {
        console.error('[Detail] Load task detail error:', error);
        message.error('加载任务详情失败');
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    })();

    return () => {
      if (loadedTaskIdRef.current !== taskId) {
        loadedTaskIdRef.current = null;
      }
    };
  }, [taskId, message]);

  const handleDeleteTask = useCallback(async () => {
    const confirmed = window.confirm('确认删除这个任务吗？删除后无法恢复。');
    if (!confirmed) return;

    try {
      await deleteTaskAPI(taskId);
      message.success('任务已删除');
      navigate('/tasks');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  }, [taskId, navigate, message]);

  const handleResumeTask = useCallback(async (taskId) => {
    try {
      await waitForBridgeReady(setStatus);
      const createdTaskId = await startTask({
        targetProfile: task?.targetProfile || '',
        rejectionMessage: task?.rejectionMessage || '',
        taskId,
        mode: 'unfinished',
        setStatusFn: setStatus,
      });
      setRunning(true);
      await subscribeTaskRef.current(createdTaskId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setStatus(errorMsg);
      setRunning(false);
      message.error(errorMsg);
    }
  }, [task, message]);

  const handleRetryFailed = useCallback(async (taskId) => {
    try {
      await waitForBridgeReady(setStatus);
      const createdTaskId = await startTask({
        targetProfile: task?.targetProfile || '',
        rejectionMessage: task?.rejectionMessage || '',
        taskId,
        mode: 'retry-failed',
        setStatusFn: setStatus,
      });
      setRunning(true);
      await subscribeTaskRef.current(createdTaskId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setStatus(errorMsg);
      setRunning(false);
      message.error(errorMsg);
    }
  }, [task, message]);

  // 加载中状态
  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Empty description="加载中..." />
      </div>
    );
  }

  // 未找到任务
  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-20">
        <Empty description="未找到任务数据" />
        <Button
          type="primary"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/tasks')}
        >
          返回任务列表
        </Button>
      </div>
    );
  }

  const result = { task, toolTimeline };

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-1">
        <Button
          variant="filled"
          color="default"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/tasks')}
        >
          返回
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-stone-300 uppercase tabular-nums">
            Task: {taskId?.slice(0, 8)}
          </span>
          <Button
            danger
            size="small"
            type="text"
            icon={<DeleteOutlined />}
            onClick={handleDeleteTask}
            className="!text-rose-400 hover:!text-rose-600"
          />
        </div>
      </div>

      {/* 状态提示 */}
      {status && (
        <Alert
          message={status}
          type={running ? 'info' : 'success'}
          showIcon
          closable
          onClose={() => setStatus('')}
          className="animate-in fade-in slide-in-from-top-2 duration-300"
        />
      )}

      {/* 任务详情内容 */}
      <TaskDetailView
        result={result}
        running={running}
        selectedCandidateKey=""
        onSelectCandidate={() => { }}
        onResumeTask={handleResumeTask}
        onRetryFailed={handleRetryFailed}
      />
    </div>
  );
}