import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined } from '@ant-design/icons';
import { PanelHeader, TaskDetailView } from '../ui';
import {
  BRIDGE_SUBSCRIBE_ENDPOINT,
  deleteTask as deleteTaskAPI,
  fetchTaskDetail,
  resolveToolTimeline,
  startTask,
  stopTask,
  waitForBridgeReady,
} from '../shared-hooks';

function getTaskHeaderTitle(targetProfile, taskId) {
  if (!targetProfile) return taskId || '任务详情';

  const normalized = targetProfile.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 30) return normalized;
  return `${normalized.slice(0, 30)}...`;
}

function getCandidateKey(candidate, index = 0) {
  return candidate?.candidateId || candidate?.name || `candidate-${index}`;
}

function TaskDetailContent({ task, running, toolTimeline, onResumeTask, onRetryFailed }) {
  const [selectedCandidateKey, setSelectedCandidateKey] = useState('');

  const candidates = Array.isArray(task?.candidates) ? task.candidates : [];

  useEffect(() => {
    if (!candidates.length) {
      setSelectedCandidateKey('');
      return;
    }

    const hasSelection = candidates.some((candidate, index) => (
      getCandidateKey(candidate, index) === selectedCandidateKey
    ));

    if (!hasSelection) {
      setSelectedCandidateKey(getCandidateKey(candidates[0], 0));
    }
  }, [candidates.length, selectedCandidateKey]); // 只依赖 candidates.length，避免数组引用变化

  // 使用 useMemo 避免每次都创建新对象
  const result = React.useMemo(() => {
    console.log('[Detail] Creating new result object');
    return { task, toolTimeline };
  }, [task, toolTimeline]);

  // 添加错误捕获
  try {
    return (
      <TaskDetailView
        result={result}
        running={running}
        selectedCandidateKey={selectedCandidateKey}
        onSelectCandidate={setSelectedCandidateKey}
        onResumeTask={onResumeTask}
        onRetryFailed={onRetryFailed}
      />
    );
  } catch (error) {
    console.error('[Detail] TaskDetailView render error:', error);
    return <div>渲染错误: {error.message}</div>;
  }
}

export default function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  
  const [task, setTask] = useState(null);
  const [toolTimeline, setToolTimeline] = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  const subscriptionRef = useRef({
    taskId: null,
    abortController: null,
  });

  // 使用 ref 跟踪加载状态，避免作为依赖
  const loadingRef = useRef(false);
  const loadedTaskIdRef = useRef(null);

  // 添加组件挂载日志
  useEffect(() => {
    console.log('[Detail] Component mounted, taskId:', taskId);
    return () => {
      console.log('[Detail] Component unmounting, taskId:', taskId);
      if (subscriptionRef.current.abortController) {
        console.log('[Detail] Aborting subscription on unmount');
        subscriptionRef.current.abortController.abort();
      }
    };
  }, []); // 空依赖，只在挂载/卸载时执行

  // 监听 taskId 变化
  useEffect(() => {
    console.log('[Detail] taskId changed to:', taskId);
  }, [taskId]);

  // SSE 订阅 - 使用 useRef 避免依赖问题
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
      // 使用新的按任务ID订阅的接口
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
                console.log('[Detail] Received tool-event, timeline length before:', toolTimeline.length);
                setToolTimeline(prev => {
                  const newTimeline = [...prev, data.data];
                  console.log('[Detail] Timeline updated, new length:', newTimeline.length);
                  return newTimeline;
                });
              }

              if (data.type === 'task-update' && data.data) {
                console.log('[Detail] Received task-update, task before:', task?.taskId);
                setTask(prevTask => {
                  console.log('[Detail] Task updated from', prevTask?.taskId, 'to', data.data.taskId);
                  return data.data;
                });
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
                } catch {
                  // ignore
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

  // 加载任务详情 - 只在 taskId 变化时执行一次
  useEffect(() => {
    if (!taskId) {
      return;
    }

    // 防止重复加载同一个任务
    if (loadingRef.current || loadedTaskIdRef.current === taskId) {
      console.log('[Detail] Skip loading, already loading or loaded:', taskId);
      return;
    }

    console.log('[Detail] Loading task:', taskId);
    loadingRef.current = true;
    loadedTaskIdRef.current = taskId;
    
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
      } finally {
        loadingRef.current = false;
      }
    })();

    // 清理函数：当 taskId 变化时，重置状态
    return () => {
      if (loadedTaskIdRef.current !== taskId) {
        loadedTaskIdRef.current = null;
      }
    };
  }, [taskId]); // 只依赖 taskId

  const handleDeleteTask = useCallback(async () => {
    const confirmed = window.confirm('确认删除这个任务吗？删除后无法恢复。');
    if (!confirmed) {
      return;
    }

    try {
      await deleteTaskAPI(taskId);
      navigate('/tasks');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }, [taskId, navigate]);

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
      setStatus(error instanceof Error ? error.message : String(error));
      setRunning(false);
    }
  }, [task]);

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
      setStatus(error instanceof Error ? error.message : String(error));
      setRunning(false);
    }
  }, [task]);

  const title = getTaskHeaderTitle(task?.targetProfile, taskId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelHeader
          eyebrow="任务详情"
          title={title}
          description={task?.targetProfile || '这里可以持续跟进这轮巡检的进度、候选人状态和详细处理记录。'}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<DeleteOutlined />}
            onClick={handleDeleteTask}
          >
            删除任务
          </Button>
          <Button
            icon={<ArrowLeftOutlined />}
          >
            <Link to="/tasks">返回任务列表</Link>
          </Button>
        </div>
      </div>

      <TaskDetailContent 
        task={task}
        running={running}
        toolTimeline={toolTimeline}
        onResumeTask={handleResumeTask}
        onRetryFailed={handleRetryFailed}
      />
    </div>
  );
}
