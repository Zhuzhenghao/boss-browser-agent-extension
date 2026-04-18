import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Alert, Typography, Space, Popconfirm, Empty, Spin } from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { TaskDetailView } from '../ui'; // 请确保此路径指向下方的 TaskDetailView 文件
import {
  BRIDGE_SUBSCRIBE_ENDPOINT,
  deleteTask as deleteTaskAPI,
  fetchTaskDetail,
  resolveToolTimeline,
  startTask,
  waitForBridgeReady,
} from '../shared-hooks';

const { Text } = Typography;

export default function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [toolTimeline, setToolTimeline] = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const subscriptionRef = useRef({ taskId: null, abortController: null });

  // --- SSE 订阅核心逻辑 ---
  const subscribeTask = async id => {
    if (!id) return;
    if (
      subscriptionRef.current.taskId === id &&
      subscriptionRef.current.abortController
    )
      return;

    if (subscriptionRef.current.abortController) {
      subscriptionRef.current.abortController.abort();
    }

    const abortController = new AbortController();
    subscriptionRef.current = { taskId: id, abortController };
    setRunning(true);

    try {
      const response = await fetch(
        `${BRIDGE_SUBSCRIBE_ENDPOINT}/${encodeURIComponent(id)}`,
        {
          signal: abortController.signal,
        },
      );

      if (!response.ok) throw new Error(`订阅失败: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'tool-event') {
              setToolTimeline(prev => [...prev, data.data]);
            }
            if (data.type === 'task-update') {
              setTask(data.data);
            }
            if (data.type === 'task-completed' || data.type === 'task-error') {
              setRunning(false);
              setStatus(
                data.type === 'task-completed'
                  ? '执行完成'
                  : data.data?.error || '执行失败',
              );
              // 最终刷新
              const detail = await fetchTaskDetail(id);
              if (detail) {
                setTask(detail.task);
                setToolTimeline(
                  resolveToolTimeline(detail.task, detail.toolEvents),
                );
              }
              return;
            }
          } catch (e) {
            console.error('SSE Parse Error', e);
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Subscription error:', error);
        setRunning(false);
      }
    }
  };

  // --- 初始化加载 ---
  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setStatus('');
    setRunning(false);
    setTask(null);
    setToolTimeline([]);

    (async () => {
      try {
        const detail = await fetchTaskDetail(taskId);
        if (cancelled) return;

        if (detail) {
          setTask(detail.task);
          setToolTimeline(resolveToolTimeline(detail.task, detail.toolEvents));
          if (detail.task.status === 'running') {
            void subscribeTask(taskId);
          }
        } else {
          setLoadError('任务不存在或已被删除');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Load Error', error);
        setLoadError('加载任务详情失败');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current.abortController?.abort();
    };
  }, [taskId]);

  // --- 任务操作 ---
  const handleRunTask = useCallback(
    async mode => {
      try {
        setRunning(true);
        await waitForBridgeReady(setStatus);
        const id = await startTask({
          targetProfile: task?.targetProfile || '',
          jobTitle: task?.jobTitle || '',
          jobProfileId: task?.jobProfileId || null,
          taskId,
          mode,
          setStatusFn: setStatus,
        });
        await subscribeTask(id);
      } catch (error) {
        setStatus(error.message);
        setRunning(false);
      }
    },
    [task, taskId],
  );

  const handleDelete = async () => {
    try {
      await deleteTaskAPI(taskId);
      navigate('/tasks');
    } catch (error) {
      window.alert(error.message);
    }
  };

  const statusType = running
    ? 'info'
    : task?.status === 'failed' || loadError
      ? 'error'
      : 'success';

  // 仅展示 return 部分的核心 UI 修改
  return (
    <div className='flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100'>
      <div className='sticky top-0 z-50 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90'>
        <Space size={14}>
          <Button
            color='default'
            variant='filled'
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/tasks')}
          />
          <div className='flex flex-col'>
            <Text className='text-[14px] font-bold text-zinc-800 dark:text-zinc-100'>
              任务详情
            </Text>
          </div>
        </Space>

        <Popconfirm
          title='确定要永久删除此任务吗？'
          onConfirm={handleDelete}
          okText='确认删除'
          cancelText='取消'
          okButtonProps={{ danger: true }}
        >
          <Button type='text' danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>

      <div className='flex-1'>
        {status && !loadError && (
          <div className='px-4 pt-4'>
            <Alert
              message={status}
              type={statusType}
              showIcon
            />
          </div>
        )}

        <div className='p-4'>
          {loading ? (
            <div className='flex min-h-[320px] items-center justify-center'>
              <Spin size='default' tip='加载中...' />
            </div>
          ) : loadError ? (
            <div className='flex min-h-[320px] items-center justify-center'>
              <Empty
                description={
                  <span className='text-[14px] text-stone-500'>{loadError}</span>
                }
              />
            </div>
          ) : (
            <TaskDetailView
              result={{ task, toolTimeline }}
              running={running}
              onResumeTask={() => handleRunTask('unfinished')}
              onRetryFailed={() => handleRunTask('retry-failed')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
