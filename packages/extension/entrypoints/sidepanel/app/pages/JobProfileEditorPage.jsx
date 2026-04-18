import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Alert, Button, Card, Input, Space, Switch, Typography } from 'antd';
import { ArrowLeftOutlined, ImportOutlined, SaveOutlined } from '@ant-design/icons';
import {
  createJobProfile,
  fetchJobProfile,
  importJobProfile,
  updateJobProfile,
} from '../shared-hooks';
import {
  buildTargetProfileFromJobProfile,
  createEmptyJobProfile,
  getJobProfileMissingFields,
} from '@boss-agent/shared';

const { Text, Title } = Typography;
const { TextArea } = Input;

function FieldBlock({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 px-1">
        <Text className="text-[14px] font-medium text-stone-800 dark:text-zinc-200">
          {label}
        </Text>
        {hint ? (
          <Text className="text-[12px] leading-5 text-stone-500 dark:text-zinc-400">
            {hint}
          </Text>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function JobProfileEditorPage() {
  const navigate = useNavigate();
  const { profileId } = useParams();
  const isCreateMode = !profileId || profileId === 'new';
  const { message } = App.useApp();
  const [profile, setProfile] = useState(createEmptyJobProfile());
  const [loading, setLoading] = useState(!isCreateMode);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');
  const [importFiles, setImportFiles] = useState([]);

  useEffect(() => {
    if (isCreateMode) {
      setProfile(createEmptyJobProfile());
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      try {
        setLoading(true);
        const data = await fetchJobProfile(profileId);
        if (!cancelled) {
          setProfile(data);
        }
      } catch (error) {
        if (!cancelled) {
          message.error(error instanceof Error ? error.message : String(error));
          navigate('/job-profiles');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [isCreateMode, message, navigate, profileId]);

  const missingFields = useMemo(
    () => getJobProfileMissingFields(profile),
    [profile],
  );

  const updateProfile = useCallback((updates) => {
    setProfile(current => ({
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleImport = useCallback(async () => {
    if (!importFiles.length) {
      setStatus('请先上传一个 Word/PDF/Excel/PPT 文件');
      return;
    }

    try {
      setImporting(true);
      setStatus('正在读取文件，并使用大模型分析岗位内容...');
      const result = await importJobProfile(importFiles, profile);
      setProfile(current => ({
        ...current,
        ...result.profile,
        id: current.id,
        updatedAt: new Date().toISOString(),
      }));
      setStatus(result.missingFields?.length ? '大模型已自动填充，请继续补充缺失字段' : '大模型识别完成，表单已自动填充');
      message.success('文件已通过大模型分析并填入表单');
    } catch (error) {
      const nextStatus = error instanceof Error ? error.message : String(error);
      setStatus(nextStatus);
      message.error(nextStatus);
    } finally {
      setImporting(false);
    }
  }, [importFiles, message, profile]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setStatus('正在保存岗位 JD...');
      const saved = isCreateMode
        ? await createJobProfile(profile)
        : await updateJobProfile(profile.id, profile);
      setProfile(saved);
      setStatus('保存成功');
      message.success('岗位 JD 已保存到数据库');
      navigate('/job-profiles');
    } catch (error) {
      const nextStatus = error instanceof Error ? error.message : String(error);
      setStatus(nextStatus);
      message.error(nextStatus);
    } finally {
      setSaving(false);
    }
  }, [isCreateMode, message, navigate, profile]);

  const previewText = buildTargetProfileFromJobProfile(profile);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <Space size={14}>
          <Button
            color="default"
            variant="filled"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/job-profiles')}
          />
          <div className="flex flex-col">
            <Text className="text-[14px] font-bold text-zinc-800 dark:text-zinc-100">
              {isCreateMode ? '新增岗位 JD' : '编辑岗位 JD'}
            </Text>
            <Text className="text-[12px] text-zinc-500 dark:text-zinc-400">
              支持上传 Word 自动识别，也支持人工修改后保存到数据库
            </Text>
          </div>
        </Space>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
        >
          保存
        </Button>
      </div>

      <div className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          <Card className="rounded-3xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Title level={5} className="!mb-0 dark:!text-zinc-100">
                  上传文件自动填充
                </Title>
                <Text className="text-[12px] text-stone-500 dark:text-zinc-400">
                  上传 Word 优先，也支持 PDF、Excel、PPT。系统会先提取文字，再调用大模型分析成我们需要的字段并填入下面表单。
                </Text>
              </div>

              <input
                type="file"
                multiple
                accept=".docx,.pdf,.xlsx,.xls,.csv,.pptx,.txt,.md"
                onChange={event => {
                  setImportFiles(Array.from(event.target.files || []));
                  setImportResult(null);
                }}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="primary"
                  icon={<ImportOutlined />}
                  loading={importing}
                  onClick={handleImport}
                >
                  {importing ? '分析中...' : '开始识别'}
                </Button>
                <Text className="text-[12px] leading-5 text-stone-500 dark:text-zinc-400">
                  {importFiles.length
                    ? `已选择 ${importFiles.length} 个文件：${importFiles.map(file => file.name).join('、')}`
                    : '还没有选择文件'}
                </Text>
              </div>

              {status ? (
                <Alert
                  type={missingFields.length ? 'warning' : 'info'}
                  showIcon
                  message={status}
                />
              ) : null}

              <Card size="small" className="rounded-2xl border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <div className="flex flex-col gap-2">
                  <Text className="text-[13px] font-medium text-amber-800 dark:text-amber-200">
                    需要补充的板块
                  </Text>
                  <Text className="text-[12px] leading-6 text-amber-700 dark:text-amber-300">
                    {missingFields.length
                      ? missingFields.map(item => item.label).join('、')
                      : '当前核心板块已较完整'}
                  </Text>
                </div>
              </Card>
            </div>
          </Card>

          <Card className="rounded-3xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Title level={5} className="!mb-0 dark:!text-zinc-100">
                  JD 表单
                </Title>
                <Text className="text-[12px] text-stone-500 dark:text-zinc-400">
                  自动识别后可继续人工修改，最终保存到数据库。
                </Text>
              </div>

              <FieldBlock label="岗位名称" hint="例如：高级前端工程师 / 海外投放运营 / AI 产品经理">
                <Input
                  value={profile.title}
                  onChange={event => updateProfile({ title: event.target.value })}
                  placeholder="请输入岗位名称"
                />
              </FieldBlock>

              <div className="flex items-center justify-between rounded-2xl border border-stone-200 px-4 py-3 dark:border-zinc-800">
                <div className="flex flex-col gap-1">
                  <Text className="text-[14px] font-medium text-stone-800 dark:text-zinc-200">
                    启用该岗位
                  </Text>
                  <Text className="text-[12px] text-stone-500 dark:text-zinc-400">
                    保存后会进入岗位列表，可用于后续任务创建。
                  </Text>
                </div>
                <Switch
                  checked={profile.enabled}
                  onChange={checked => updateProfile({ enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-stone-200 px-4 py-3 dark:border-zinc-800">
                <div className="flex flex-col gap-1">
                  <Text className="text-[14px] font-medium text-stone-800 dark:text-zinc-200">
                    开启定时巡检
                  </Text>
                  <Text className="text-[12px] text-stone-500 dark:text-zinc-400">
                    自动定时创建巡检任务，无需手动触发。
                  </Text>
                </div>
                <Switch
                  checked={profile.autoInspection}
                  onChange={checked => updateProfile({ autoInspection: checked })}
                />
              </div>

              {profile.autoInspection && (
                <FieldBlock label="巡检间隔（分钟）" hint="多久执行一次自动巡检，建议 30-120 分钟。">
                  <Input
                    type="number"
                    min={10}
                    max={1440}
                    value={profile.inspectionInterval}
                    onChange={event => updateProfile({ inspectionInterval: Number(event.target.value) || 60 })}
                    placeholder="60"
                  />
                </FieldBlock>
              )}

              <FieldBlock label="招聘信息" hint="岗位背景、级别、汇报对象、地点、年限、学历等基础信息。">
                <TextArea value={profile.recruitmentInfo} onChange={event => updateProfile({ recruitmentInfo: event.target.value })} autoSize={{ minRows: 3, maxRows: 8 }} />
              </FieldBlock>

              <FieldBlock label="职责要求" hint="岗位要做什么，最好按 3-5 条关键职责写。">
                <TextArea value={profile.responsibilities} onChange={event => updateProfile({ responsibilities: event.target.value })} autoSize={{ minRows: 4, maxRows: 10 }} />
              </FieldBlock>

              <FieldBlock label="硬性要求" hint="必须满足的经验、技能、行业背景、项目类型。">
                <TextArea value={profile.requirements} onChange={event => updateProfile({ requirements: event.target.value })} autoSize={{ minRows: 4, maxRows: 10 }} />
              </FieldBlock>

              <FieldBlock label="加分项" hint="非必须，但命中时可明显加分。">
                <TextArea value={profile.preferredQualifications} onChange={event => updateProfile({ preferredQualifications: event.target.value })} autoSize={{ minRows: 3, maxRows: 8 }} />
              </FieldBlock>

              <FieldBlock label="人员画像" hint="理想候选人的工作风格、沟通方式、能力特征。">
                <TextArea value={profile.candidatePersona} onChange={event => updateProfile({ candidatePersona: event.target.value })} autoSize={{ minRows: 3, maxRows: 8 }} />
              </FieldBlock>

              <FieldBlock label="禁忌条件" hint="出现这些情况时优先判为不匹配。">
                <TextArea value={profile.dealBreakers} onChange={event => updateProfile({ dealBreakers: event.target.value })} autoSize={{ minRows: 3, maxRows: 8 }} />
              </FieldBlock>

              <FieldBlock label="关键词" hint="支持逗号、顿号、换行分隔。">
                <TextArea value={profile.keywords.join('，')} onChange={event => updateProfile({ keywords: event.target.value })} autoSize={{ minRows: 2, maxRows: 6 }} />
              </FieldBlock>

              <FieldBlock label="不匹配回复语" hint="用于自动筛选时的回复语。">
                <TextArea value={profile.rejectionMessage} onChange={event => updateProfile({ rejectionMessage: event.target.value })} autoSize={{ minRows: 3, maxRows: 6 }} />
              </FieldBlock>

              <FieldBlock label="备注" hint="留给招聘团队的补充说明。">
                <TextArea value={profile.notes} onChange={event => updateProfile({ notes: event.target.value })} autoSize={{ minRows: 2, maxRows: 6 }} />
              </FieldBlock>

              <FieldBlock label="执行前生成的筛选依据" hint="创建任务时会自动用这份内容作为目标岗位信息。">
                <TextArea value={previewText} readOnly autoSize={{ minRows: 12, maxRows: 24 }} />
              </FieldBlock>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
