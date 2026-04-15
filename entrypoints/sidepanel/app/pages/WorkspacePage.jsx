import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Input, Select, Space, Typography } from 'antd';
import { ArrowLeftOutlined, ProfileOutlined } from '@ant-design/icons';
import { RunTaskPanel } from '../ui';
import {
  DEFAULT_REJECTION_MESSAGE,
  fetchJobProfiles,
  startTask,
  waitForBridgeReady,
} from '../shared-hooks';
import { buildTargetProfileFromJobProfile } from '../../../../shared/job-profiles.js';

const { Text } = Typography;

export default function WorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [targetProfile, setTargetProfile] = useState('');
  const [rejectionMessage, setRejectionMessage] = useState(DEFAULT_REJECTION_MESSAGE);
  const [jobProfiles, setJobProfiles] = useState([]);
  const [selectedJobProfileId, setSelectedJobProfileId] = useState('');
  const [testCandidateNames, setTestCandidateNames] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  // 从路由 state 中获取预设的 JD 信息
  useEffect(() => {
    if (location.state?.jobProfileId) {
      setSelectedJobProfileId(location.state.jobProfileId);
      if (location.state.targetProfile) {
        setTargetProfile(location.state.targetProfile);
      }
      if (location.state.rejectionMessage) {
        setRejectionMessage(location.state.rejectionMessage);
      }
      if (location.state.jobProfileTitle) {
        setStatus(`已载入岗位：${location.state.jobProfileTitle}`);
      }
    }
  }, [location.state]);

  useEffect(() => {
    let active = true;

    const loadJobProfiles = async () => {
      try {
        const profiles = await fetchJobProfiles();
        if (!active) {
          return;
        }
        const enabledProfiles = profiles.filter(profile => profile.enabled !== false);
        setJobProfiles(enabledProfiles);
        setSelectedJobProfileId(current => current || enabledProfiles[0]?.id || '');
      } catch (error) {
        if (!active) {
          return;
        }
        console.error('[Workspace] Failed to load job profiles:', error);
      }
    };

    void loadJobProfiles();
    return () => {
      active = false;
    };
  }, []);

  const selectedJobProfile = useMemo(
    () => jobProfiles.find(profile => profile.id === selectedJobProfileId) || null,
    [jobProfiles, selectedJobProfileId],
  );

  const applyJobProfile = useCallback((profileId) => {
    setSelectedJobProfileId(profileId);
    const nextProfile = jobProfiles.find(profile => profile.id === profileId);
    if (!nextProfile) {
      return;
    }

    setTargetProfile(buildTargetProfileFromJobProfile(nextProfile));
    setRejectionMessage(
      nextProfile.rejectionMessage?.trim() || DEFAULT_REJECTION_MESSAGE,
    );
    setStatus(`已载入岗位模板：${nextProfile.title || '未命名岗位'}`);
  }, [jobProfiles]);

  useEffect(() => {
    if (!selectedJobProfile || targetProfile.trim()) {
      return;
    }

    setTargetProfile(buildTargetProfileFromJobProfile(selectedJobProfile));
    setRejectionMessage(
      selectedJobProfile.rejectionMessage?.trim() || DEFAULT_REJECTION_MESSAGE,
    );
  }, [selectedJobProfile, targetProfile]);

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
      
      // 解析测试候选人姓名
      const candidateNames = testCandidateNames
        .split(/[,，、\n]/)
        .map(name => name.trim())
        .filter(Boolean);
      
      console.log('[Workspace] Parsed candidate names:', candidateNames);
      
      const createdTaskId = await startTask({
        targetProfile: targetProfile.trim(),
        rejectionMessage: rejectionMessage.trim(),
        jobTitle: selectedJobProfile?.title || '',
        jobProfileId: selectedJobProfile?.id || null,
        testCandidateNames: candidateNames.length > 0 ? candidateNames : undefined,
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
  }, [navigate, targetProfile, rejectionMessage, selectedJobProfile, testCandidateNames]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <Space size={14}>
          <Button
            color="default"
            variant="filled"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/tasks')}
          />
          <div className="flex flex-col">
            <Text className="text-[14px] font-bold text-zinc-800 dark:text-zinc-100">
              创建任务
            </Text>
          </div>
        </Space>
      </div>

      <div className="flex-1 p-4">
        <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Text className="text-[14px] font-semibold text-stone-800 dark:text-zinc-100">
                选择岗位 JD
              </Text>
              <Text className="text-[12px] leading-5 text-stone-500 dark:text-zinc-400">
                选中后会自动带入招聘信息、画像和禁忌条件，仍然可以继续手动微调。
              </Text>
            </div>
            <Button
              icon={<ProfileOutlined />}
              onClick={() => navigate('/job-profiles')}
            >
              管理 JD
            </Button>
          </div>

          <Select
            value={selectedJobProfileId || undefined}
            placeholder={jobProfiles.length ? '请选择岗位 JD' : '暂无可用岗位，请先去管理页创建'}
            options={jobProfiles.map(profile => ({
              value: profile.id,
              label: profile.title || '未命名岗位',
            }))}
            onChange={applyJobProfile}
            allowClear
            onClear={() => setSelectedJobProfileId('')}
          />
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col">
            <Text className="text-[14px] font-semibold text-stone-800 dark:text-zinc-100">
              指定候选人（可选）
            </Text>
            <Text className="text-[12px] leading-5 text-stone-500 dark:text-zinc-400">
              输入候选人姓名（多个用逗号分隔），直接处理指定候选人。留空则自动读取未读消息列表。
            </Text>
          </div>

          <Input.TextArea
            value={testCandidateNames}
            onChange={e => setTestCandidateNames(e.target.value)}
            placeholder="例如：张三，李四，王五"
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </div>

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
