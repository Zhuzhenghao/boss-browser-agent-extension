import React, { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { PanelHeader, RunTaskPanel } from '../ui';
import {
  DEFAULT_REJECTION_MESSAGE,
  startTask,
  waitForBridgeReady,
} from '../shared-hooks';

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
    <div className="flex flex-col gap-4">
      <PanelHeader
        title="创建任务"
        description="填写筛选要求后开始执行。"
        action={(
          <Button
            icon={<ArrowLeftOutlined />}
            className="min-h-10 rounded-full border-stone-200 bg-stone-50 px-4 font-medium text-stone-700 shadow-none hover:!border-stone-300 hover:!bg-stone-100 hover:!text-stone-900"
          >
            <Link to="/tasks">返回任务列表</Link>
          </Button>
        )}
      />

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
  );
}
