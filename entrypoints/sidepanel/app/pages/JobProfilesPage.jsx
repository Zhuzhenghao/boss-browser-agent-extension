import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Empty, Space, Switch, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons';
import { deleteJobProfile, fetchJobProfiles } from '../shared-hooks';
import { buildTargetProfileFromJobProfile } from '../../../../shared/job-profiles.js';

const { Text, Title } = Typography;

export default function JobProfilesPage() {
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJobProfiles();
      setProfiles(data);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const handleDelete = useCallback((profile) => {
    modal.confirm({
      title: '删除岗位 JD',
      content: `确认删除"${profile.title || '未命名岗位'}"吗？`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteJobProfile(profile.id);
        setProfiles(current => current.filter(item => item.id !== profile.id));
        message.success('岗位 JD 已删除');
      },
    });
  }, [message, modal]);

  const handleCreateTask = useCallback((profile) => {
    const targetProfile = buildTargetProfileFromJobProfile(profile);
    navigate('/tasks/new', {
      state: {
        jobProfileId: profile.id,
        jobProfileTitle: profile.title,
        targetProfile,
        rejectionMessage: profile.rejectionMessage || '您的简历很优秀，但是经验不匹配',
      },
    });
  }, [navigate]);

  return (
    <div className="flex flex-col gap-4 px-3 py-4 text-zinc-900 dark:text-zinc-100">
      <section className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-stone-900 dark:text-zinc-100">
            JD 管理
          </h1>
          <p className="mt-1 text-[14px] text-stone-500 dark:text-zinc-400">
            选择岗位创建巡检任务，或新增编辑岗位 JD
          </p>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/job-profiles/new')}
        >
          新增岗位
        </Button>
      </section>

      {profiles.length ? (
        <div className="flex flex-col gap-3">
          {profiles.map(profile => (
            <Card key={profile.id} className="rounded-3xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Title level={5} className="!mb-0 dark:!text-zinc-100">
                        {profile.title || '未命名岗位'}
                      </Title>
                      <Tag color={profile.enabled ? 'green' : 'default'} className="m-0 rounded-full">
                        {profile.enabled ? '启用中' : '已停用'}
                      </Tag>
                    </div>
                    <Text className="mt-2 block text-[13px] leading-6 text-stone-500 dark:text-zinc-400">
                      {profile.recruitmentInfo || '还没有填写招聘信息'}
                    </Text>
                  </div>

                  <Space size={8} direction="vertical">
                    <Space size={8}>
                      <Button
                        type="primary"
                        icon={<RocketOutlined />}
                        onClick={() => handleCreateTask(profile)}
                        disabled={!profile.enabled}
                      >
                        创建巡检
                      </Button>
                      <Button
                        icon={<EditOutlined />}
                        onClick={() => navigate(`/job-profiles/${encodeURIComponent(profile.id)}`)}
                      >
                        编辑
                      </Button>
                    </Space>
                    <Button
                      danger
                      block
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(profile)}
                    >
                      删除
                    </Button>
                  </Space>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(profile.keywords || []).slice(0, 8).map(keyword => (
                    <Tag key={keyword} className="m-0 rounded-full">
                      {keyword}
                    </Tag>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-3xl dark:border-zinc-800 dark:bg-zinc-900">
          <Empty
            description="还没有岗位 JD，点击右上角开始新增"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      )}

      {loading ? (
        <Text className="px-1 text-[12px] text-stone-500 dark:text-zinc-400">
          正在加载岗位列表...
        </Text>
      ) : null}
    </div>
  );
}
