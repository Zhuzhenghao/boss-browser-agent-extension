import React, { memo, useMemo, useState, useEffect } from 'react';
import { Button, Tag, Typography } from 'antd';
import {
  CheckCircleFilled,
  SyncOutlined,
  UserOutlined,
  ThunderboltFilled,
  FileTextOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { TimelineSection } from './timeline'; // 请确保路径正确
import {
  getCandidateKey,
  getCandidateStatusLabel,
  getCandidateTimeline,
  getSystemTimeline,
  resolveResultToolTimeline,
  summarizeCandidateAction,
  formatDateTime,
  buildCandidateStatusCounts,
} from './shared'; // 请确保路径正确

const { Text, Title } = Typography;

const CARD_BASE = 'bg-white rounded-[20px] border border-stone-200/70 shadow-sm';
const SECTION_ICON_CLS = '!text-[12px] !text-stone-400';
const SECTION_ICON_ACCENT_CLS = '!text-[12px] !text-brand-500';
const INLINE_ICON_CLS = '!text-[12px] !text-stone-400';
const STATUS_ICON_BASE_CLS = 'mt-[3px] shrink-0 !text-base';

function SectionHeading({ icon, title, meta }) {
  return (
    <div className='flex items-center justify-between gap-3 px-1'>
      <div className='flex items-center gap-2'>
        {icon}
        <Text className='text-[13px] font-semibold tracking-[0.04em] text-stone-700'>
          {title}
        </Text>
      </div>
      {meta ? (
        <span className='rounded-full bg-stone-100 px-3 py-1 text-[12px] font-medium text-stone-500'>
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function FoldSection({ icon, title, meta, children, defaultOpen = false, className = '' }) {
  return (
    <details open={defaultOpen} className={className}>
      <summary className='cursor-pointer list-none'>
        <SectionHeading icon={icon} title={title} meta={meta} />
      </summary>
      <div className='mt-2.5'>{children}</div>
    </details>
  );
}

const TaskSummary = memo(({ task, running, onResume, onRetry }) => {
  if (!task) return null;

  const matchedCount = task.matchedCount ?? 0;
  const rejectedCount = task.rejectedCount ?? 0;
  const failedCount = task.failedCount ?? 0;
  const candidateStatusCounts = useMemo(
    () => buildCandidateStatusCounts(task),
    [task],
  );
  const pendingCount =
    (candidateStatusCounts.queued ?? 0) + (candidateStatusCounts.running ?? 0);
  const hasFailed = (task.failedCount ?? 0) > 0;
  const canResume = pendingCount > 0;
  const showAction = !running && (hasFailed || canResume);
  const actionLabel = hasFailed ? '重试失败项' : '继续任务';
  const actionHandler = hasFailed ? onRetry : onResume;
  const actionHint = running
    ? '任务正在执行中'
    : hasFailed
      ? `有 ${failedCount} 个失败项等待重试`
      : canResume
        ? `还有 ${pendingCount} 位候选人待处理`
        : '当前没有可执行操作';
  const statusToneCls = running
    ? 'border-brand-100 bg-brand-50'
    : hasFailed
      ? 'border-rose-100 bg-rose-50'
      : 'border-emerald-100 bg-emerald-50';

  const metrics = useMemo(
    () => [
      {
        label: '匹配成功',
        val: matchedCount,
        numCls: 'text-emerald-600',
        borderCls: 'border-emerald-100 bg-emerald-50/60',
        labelCls: 'text-stone-600',
      },
      {
        label: '不匹配',
        val: rejectedCount,
        numCls: 'text-stone-700',
        borderCls: 'border-stone-200 bg-stone-50/80',
        labelCls: 'text-stone-600',
      },
      {
        label: '执行失败',
        val: failedCount,
        numCls: 'text-rose-500',
        borderCls: 'border-rose-100 bg-rose-50/60',
        labelCls: 'text-rose-500',
      },
      {
        label: '待处理',
        val: pendingCount,
        numCls: 'text-brand-600',
        borderCls: 'border-brand-100 bg-brand-50/60',
        labelCls: 'text-brand-600',
      },
    ],
    [failedCount, matchedCount, pendingCount, rejectedCount],
  );

  const statusText = running
    ? `正在分析: ${task.currentCandidateName || '准备中...'}`
    : hasFailed
      ? '存在失败项，可重新执行失败任务'
      : canResume
        ? '还有候选人在队列中，可继续执行剩余任务'
        : '流程已完成，所有指令执行完毕';
  const statusIconCls = running
    ? '!text-brand-500'
    : hasFailed
      ? '!text-rose-500'
      : '!text-emerald-500';

  return (
    <div className='mb-4 overflow-hidden rounded-[28px] border border-stone-200/80 bg-white shadow-[0_8px_24px_rgba(24,24,27,0.05)]'>
      <div className='border-b border-stone-100 bg-[radial-gradient(circle_at_top_left,_rgba(66,133,244,0.08),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(250,250,250,0.98)_100%)] px-6 py-5'>
        <div className='mb-4 flex items-start justify-between gap-4'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <h3 className='m-0 truncate text-[18px] font-semibold tracking-[-0.03em] text-stone-900'>
                {task.targetProfile || '前端开发工程师'}
              </h3>

              <Tag
                bordered={false}
                color={running ? 'processing' : hasFailed ? 'error' : canResume ? 'warning' : 'success'}
                className='m-0 rounded-full px-3 py-1 text-[12px] font-semibold leading-none'
              >
                {running ? '进行中' : hasFailed ? '待处理' : canResume ? '可继续' : '已完成'}
              </Tag>
            </div>
          </div>

          {showAction ? (
            <div className='flex min-w-[156px] flex-col items-end gap-1.5'>
              <Button
                type='primary'
                icon={<ThunderboltFilled />}
                onClick={actionHandler}
                className='!h-11 w-full shrink-0 rounded-full px-4 text-[13px] font-semibold shadow-sm'
              >
                {actionLabel}
              </Button>
              <div className='text-right text-[12px] leading-6 text-stone-400'>
                {actionHint}
              </div>
            </div>
          ) : null}
        </div>

        <div className='grid grid-cols-2 gap-2.5 xl:grid-cols-4'>
          {metrics.map((m, index) => (
            <div
              key={m.label}
              className={`relative flex min-h-[78px] flex-col justify-center rounded-2xl border px-4 py-2.5 xl:min-h-[74px] ${
                index === 0
                  ? 'border-emerald-100 bg-emerald-50/45'
                  : 'border-stone-200 bg-stone-50/55'
              }`}
            >
              <span className={`mb-1.5 text-[12px] font-medium ${index === 0 ? 'text-emerald-700' : 'text-stone-500'}`}>
                {m.label}
              </span>
              <span
                className={`tabular-nums text-[34px] leading-none font-semibold tracking-[-0.04em] ${
                  index === 0
                    ? 'text-emerald-600'
                    : failedCount > 0 && m.label === '执行失败'
                      ? 'text-rose-600'
                      : canResume && m.label === '待处理'
                        ? 'text-brand-700'
                        : 'text-stone-800'
                }`}
              >
                {m.val ?? 0}
              </span>
              {index === 0 ? (
                <div className='absolute inset-y-3 left-0 w-[3px] rounded-full bg-emerald-600' />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className='p-4'>
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-2 ${statusToneCls}`}>
          {running ? (
            <SyncOutlined spin className={`${STATUS_ICON_BASE_CLS} ${statusIconCls}`} />
          ) : (
            <CheckCircleFilled className={`${STATUS_ICON_BASE_CLS} ${statusIconCls}`} />
          )}

          <div className='min-w-0'>
            <div className='text-[14px] font-medium leading-5 text-stone-700'>
              {statusText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const CandidateRow = memo(({ candidate, isActive, onClick }) => {
  const matchedLabel = candidate.matched === true
    ? '匹配'
    : candidate.matched === false
      ? '不匹配'
      : '';
  const statusLabel = getCandidateStatusLabel(candidate.status);
  const summary = summarizeCandidateAction(candidate);
  const matchedStatusCls = candidate.matched === true
    ? 'bg-emerald-50 text-emerald-600'
    : 'bg-stone-100 text-stone-500';
  const statusCls = isActive
    ? 'bg-brand-50 text-brand-600'
    : 'bg-stone-100 text-stone-500';

  return (
    <button
      type='button'
      onClick={onClick}
      className={`group mb-2.5 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all ${
        isActive
          ? 'border-brand-200 bg-brand-50/45 shadow-[0_4px_14px_rgba(66,133,244,0.08)]'
          : 'border-stone-200/80 bg-white hover:border-brand-100 hover:bg-stone-50/70'
      }`}
    >
      <div className='min-w-0 flex-1 pr-3'>
        <div className='mb-1.5 flex items-center gap-2'>
          <span
            className='truncate text-[15px] font-semibold tracking-[-0.02em] text-stone-900'
          >
            {candidate.name}
          </span>

          {matchedLabel ? (
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${matchedStatusCls}`}>
              {matchedLabel}
            </span>
          ) : null}

          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusCls}`}>
            {statusLabel}
          </span>
        </div>

        <div className='text-[14px] leading-6 text-stone-500 break-words'>
          {summary}
        </div>
      </div>

    </button>
  );
});

export const TaskDetailView = memo(function TaskDetailView({
  result,
  running,
  onResumeTask,
  onRetryFailed,
  selectedCandidateKey: externalKey,
  onSelectCandidate,
}) {
  const [internalKey, setInternalKey] = useState('');
  const activeKey = externalKey || internalKey;

  const task = result?.task;
  const candidates = useMemo(
    () => (Array.isArray(task?.candidates) ? task.candidates : []),
    [task],
  );

  useEffect(() => {
    if (candidates.length && !activeKey) {
      const firstKey = getCandidateKey(candidates[0], 0);
      setInternalKey(firstKey);
      onSelectCandidate?.(firstKey);
    }
  }, [candidates, activeKey, onSelectCandidate]);

  const selectedCandidate = useMemo(
    () =>
      candidates.find((c, i) => getCandidateKey(c, i) === activeKey) ||
      candidates[0],
    [candidates, activeKey],
  );

  const allTimeline = useMemo(
    () => resolveResultToolTimeline(result, task),
    [result, task],
  );
  const systemTimeline = useMemo(
    () => getSystemTimeline(allTimeline),
    [allTimeline],
  );
  const candidateTimeline = useMemo(
    () => getCandidateTimeline(allTimeline, selectedCandidate),
    [allTimeline, selectedCandidate],
  );

  if (!task)
    return (
      <div className='p-20 text-center'>
        <SyncOutlined spin className='!text-2xl !text-brand-500' />
      </div>
    );

  return (
    <div className='flex flex-col pb-8'>
      <TaskSummary
        task={task}
        running={running}
        onResume={onResumeTask}
        onRetry={onRetryFailed}
      />

      <div className='mt-2.5 mb-2'>
        <SectionHeading
          icon={<UserOutlined className={SECTION_ICON_CLS} />}
          title='候选人列表'
          meta={`${candidates.length} 人`}
        />
      </div>

      <div className='mb-5'>
        {candidates.map((c, i) => (
          <CandidateRow
            key={getCandidateKey(c, i)}
            candidate={c}
            isActive={activeKey === getCandidateKey(c, i)}
            onClick={() => {
              setInternalKey(getCandidateKey(c, i));
              onSelectCandidate?.(getCandidateKey(c, i));
            }}
          />
        ))}
      </div>

      {selectedCandidate && (
        <div className='mb-6 space-y-3'>
          <SectionHeading
            icon={<div className='h-4 w-1.5 rounded-full bg-stone-300' />}
            title={`候选人详情：${selectedCandidate.name}`}
          />

          <div className={`${CARD_BASE} bg-white p-4`}>
            <div className='mb-4 flex items-center justify-between border-b border-stone-100 pb-3'>
              <div className='flex flex-col gap-1'>
                <span className='text-[12px] font-semibold tracking-[0.03em] text-stone-400'>
                  处理结论
                </span>
                <div className='flex items-center gap-2'>
                  {selectedCandidate.matched ? (
                    <CheckCircleFilled className='!text-[16px] !text-emerald-500' />
                  ) : (
                    <div className='h-4 w-4 rounded-full border-2 border-stone-200' />
                  )}
                  <span className='text-[15px] font-semibold text-stone-800'>
                    {selectedCandidate.matched ? '符合岗位要求' : '暂不匹配'}
                  </span>
                </div>
              </div>
              <div className='text-right flex flex-col items-end gap-1'>
                <span className='text-[12px] font-semibold tracking-[0.03em] text-stone-400'>
                  最后同步
                </span>
                <div className='flex items-center gap-1.5 rounded bg-stone-50 px-2.5 py-1.5 font-mono text-[12px] text-stone-500'>
                  <ClockCircleOutlined className={INLINE_ICON_CLS} />
                  <span>{formatDateTime(selectedCandidate.updatedAt)}</span>
                </div>
              </div>
            </div>

            <div className='relative'>
              <div className='mb-2 flex items-center gap-1.5'>
                <FileTextOutlined className={SECTION_ICON_CLS} />
                <span className='text-[12px] font-semibold tracking-[0.03em] text-stone-500'>
                  简历摘要
                </span>
              </div>
              <div className='rounded-xl border border-stone-200/70 bg-stone-50/70 p-3.5 text-[14px] leading-6 text-stone-700'>
                {selectedCandidate.resumeSummary || '该候选人暂无摘要记录'}
              </div>
            </div>
          </div>

          <FoldSection
            icon={<SyncOutlined className={SECTION_ICON_CLS} />}
            title='候选人处理记录'
            className={`${CARD_BASE} overflow-hidden border-stone-200/70 bg-stone-50/30 p-3`}
            defaultOpen={false}
          >
            <div className='overflow-hidden rounded-[16px] border border-stone-200/70 bg-white'>
              <TimelineSection
                toolTimeline={candidateTimeline}
                emptyText='暂无记录'
                defaultOpen={false}
              />
            </div>
          </FoldSection>
        </div>
      )}

      {/* 系统级流水记录 */}
      <FoldSection
        icon={<SettingOutlined className={SECTION_ICON_CLS} />}
        title='任务准备记录'
        meta={`${systemTimeline.length} 步`}
        className='mt-6'
        defaultOpen={false}
      >
          <div
            className={`${CARD_BASE} overflow-hidden border-stone-200/70 bg-stone-50/40 transition-opacity`}
          >
          <div className='flex items-center justify-between border-b border-stone-100 bg-white px-4 py-2.5'>
            <div className='flex items-center gap-2'>
              <RocketOutlined className={SECTION_ICON_CLS} />
              <span className='text-[12px] font-semibold tracking-[0.04em] text-stone-500'>
                任务准备与分发
              </span>
            </div>
          </div>
          <TimelineSection
            toolTimeline={systemTimeline}
            emptyText='暂无系统记录'
            defaultOpen={false}
          />
        </div>
      </FoldSection>
    </div>
  );
});
