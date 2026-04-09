import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { RunTaskPanel } from '../ui';
import {
  DEFAULT_REJECTION_MESSAGE,
  startTask,
  waitForBridgeReady,
} from '../shared-hooks';

const { Text } = Typography;

export default function WorkspacePage() {
  const navigate = useNavigate();
  const [targetProfile, setTargetProfile] = useState('');
  const [rejectionMessage, setRejectionMessage] = useState(DEFAULT_REJECTION_MESSAGE);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  const handleRun = useCallback(async () => {
    if (!targetProfile.trim()) {
      setStatus('请先填写目标候选人的特征');
      return;
    }

    try {
      setRunning(true);
      setStatus('正在准备创建任务...');
      await waitForBridgeReady(setStatus);
      
      console.log('[Workspace] Starting task...');
      const createdTaskId = await startTask({
        targetProfile: targetProfile.trim(),
        rejectionMessage: rejectionMessage.trim(),
        taskId: '',
        mode: 'start',
        setStatusFn: setStatus,
      });

      console.log('[Workspace] Task started with ID:', createdTaskId);
      setRunning(true);
      setStatus('任务已启动，正在跳转详情...');
      navigate(`/tasks/${encodeURIComponent(createdTaskId)}`);
    } catch (error) {
      console.error('[Workspace] Error in handleRun:', error);
      setStatus(error instanceof Error ? error.message : String(error));
      setRunning(false);
    }
  }, [navigate, targetProfile, rejectionMessage]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FA]">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur-md">
        <Space size={14}>
          <Button
            color="default"
            variant="filled"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/tasks')}
          />
          <div className="flex flex-col">
            <Text className="text-[14px] font-bold text-zinc-800">
              创建任务
            </Text>
          </div>
        </Space>
      </div>

      <div className="flex-1 p-4">
        <RunTaskPanel
          targetProfile={targetProfile}
          setTargetProfile={setTargetProfile}
          rejectionMessage={rejectionMessage}
          setRejectionMessage={setRejectionMessage}
          status={status}
          running={running}
          error=""
          onRun={handleRun}
          onStop={() => {}}
          defaultRejectionMessage={DEFAULT_REJECTION_MESSAGE}
          showHeader={false}
          runLabel="创建并执行"
          runningLabel="正在创建..."
          hideStop
        />
      </div>
    </div>
  );
}
