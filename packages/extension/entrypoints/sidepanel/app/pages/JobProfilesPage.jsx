import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Empty, Space, Switch, Tag, Typography, Collapse } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, RocketOutlined, ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { deleteJobProfile, fetchJobProfiles, fetchTaskList } from '../shared-hooks';
import { buildTargetProfileFromJobProfile } from '../job-profiles';

const { Text, Title } = Typography;
const { Panel } = Collapse;

export default function JobProfilesPage() {
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profileTasks, setProfileTasks] = useState({});

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJobProfiles();
      setProfiles(data);
      
      // 加载每个 JD 的关联任务
      const tasksMap = {};
      for (const profile of data) {
        try {
          const tasks = await fetchTaskList('all', profile.id);
          tasksMap[profile.id] = tasks || [];
        } catch (error) {
          console.error(`Failed to load tasks for profile ${profile.id}:`, error);
          tasksMap[profile.id] = [];
        }
      }
      setProfileTasks(tasksMap);
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
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Title level={5} className="!mb-0 dark:!text-zinc-100">
                    {profile.title || '未命名岗位'}
                  </Title>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="primary"
                      icon={<RocketOutlined />}
                      onClick={() => handleCreateTask(profile)}
                      disabled={!profile.enabled}
                      size="small"
                    >
                      巡检
                    </Button>
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => navigate(`/job-profiles/${encodeURIComponent(profile.id)}`)}
                      size="small"
                    >
                      编辑
                    </Button>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(profile)}
                      size="small"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Tag color={profile.enabled ? 'green' : 'default'} className="m-0 rounded-full">
                    {profile.enabled ? '启用中' : '已停用'}
                  </Tag>
                  {profile.autoInspection && (
                    <Tag icon={<ClockCircleOutlined />} color="blue" className="m-0 rounded-full">
                      {profile.inspectionInterval}分钟
                    </Tag>
                  )}
                </div>

                <Text className="block text-[13px] leading-relaxed text-stone-500 dark:text-zinc-400">
                  {profile.recruitmentInfo || '还没有填写招聘信息'}
                </Text>

                <div className="flex flex-wrap gap-2">
                  {(profile.keywords || []).slice(0, 8).map(keyword => (
                    <Tag key={keyword} className="m-0 rounded-full text-[11px]">
                      {keyword}
                    </Tag>
                  ))}
                </div>

                {profileTasks[profile.id]?.length > 0 && (
                  <Collapse ghost className="!border-0 !bg-transparent -mx-6 -mb-6">
                    <Panel 
                      header={
                        <Text className="text-[12px] text-stone-600 dark:text-zinc-400">
                          历史任务 ({profileTasks[profile.id].length})
                        </Text>
                      }
                      key="tasks"
                      className="!border-0"
                    >
                      <div className="flex flex-col gap-2 px-6 pb-2">
                        {profileTasks[profile.id].slice(0, 5).map(task => (
                          <div
                            key={task.taskId}
                            className="flex cursor-pointer items-center justify-between rounded-xl border border-stone-200 px-3 py-2 hover:bg-stone-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                            onClick={() => navigate(`/tasks/${encodeURIComponent(task.taskId)}`)}
                          >
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <Text className="text-[11px] text-stone-500 dark:text-zinc-500">
                                {new Date(task.startedAt).toLocaleString('zh-CN', { 
                                  month: '2-digit', 
                                  day: '2-digit', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </Text>
                              <div className="flex flex-wrap gap-1.5">
                                <Tag color="green" className="m-0 text-[10px] px-1.5 py-0">
                                  ✓ {task.matchedCount}
                                </Tag>
                                <Tag color="default" className="m-0 text-[10px] px-1.5 py-0">
                                  ✗ {task.rejectedCount}
                                </Tag>
                                {task.failedCount > 0 && (
                                  <Tag color="orange" className="m-0 text-[10px] px-1.5 py-0">
                                    ! {task.failedCount}
                                  </Tag>
                                )}
                              </div>
                            </div>
                            <Tag 
                              color={task.status === 'completed' ? 'success' : task.status === 'running' ? 'processing' : 'default'}
                              className="m-0 text-[10px] shrink-0"
                            >
                              {task.status === 'completed' ? '完成' : task.status === 'running' ? '运行中' : task.status}
                            </Tag>
                          </div>
                        ))}
                        {profileTasks[profile.id].length > 5 && (
                          <Button 
                            type="link" 
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate('/tasks');
                            }}
                            className="!p-0 !h-auto text-[11px]"
                          >
                            查看全部 {profileTasks[profile.id].length} 个
                          </Button>
                        )}
                      </div>
                    </Panel>
                  </Collapse>
                )}
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
