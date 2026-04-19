import React, { memo, useMemo, useState, useEffect } from 'react';
import { Button, Typography } from 'antd';
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
  mergeToolEvents,
  resolveResultToolTimeline,
  summarizeCandidateAction,
  formatDateTime,
  buildCandidateStatusCounts,
} from './shared'; // 请确保路径正确

const { Text } = Typography;

const PANEL_BASE = 'rounded-[24px] border border-stone-200/70 bg-white/95 shadow-[0_12px_32px_rgba(24,24,27,0.06)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/96 dark:shadow-[0_18px_46px_rgba(0,0,0,0.32)]';
const SUBTLE_PANEL = 'rounded-[18px] border border-stone-200/70 bg-stone-50/80 dark:border-zinc-800 dark:bg-zinc-800/72';
const SECTION_ICON_CLS = '!text-[12px] !text-stone-400';
const INLINE_ICON_CLS = '!text-[12px] !text-stone-400';
const STATUS_ICON_BASE_CLS = 'mt-[3px] shrink-0 !text-base';

function SignalBadge({ tone = 'neutral', children }) {
  const toneClass = {
    neutral: 'border-[var(--signal-neutral-border)] bg-[var(--signal-neutral-bg)] text-[var(--signal-neutral-text)]',
    success: 'border-[var(--signal-success-border)] bg-[var(--signal-success-bg)] text-[var(--signal-success-text)]',
    danger: 'border-[var(--signal-danger-border)] bg-[var(--signal-danger-bg)] text-[var(--signal-danger-text)]',
    warning: 'border-[var(--signal-brand-border)] bg-[var(--signal-brand-bg)] text-[var(--signal-brand-text)]',
    active: 'border-[var(--signal-brand-strong-border)] bg-[var(--signal-brand-strong-bg)] text-[var(--signal-brand-strong-text)]',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ${toneClass[tone] || toneClass.neutral}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      <span>{children}</span>
    </span>
  );
}

function MetaBadge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--meta-border)] bg-[var(--meta-bg)] px-3 py-1 text-[12px] font-medium text-[var(--meta-text)]">
      {children}
    </span>
  );
}

function SectionHeading({ icon, title, meta }) {
  return (
    <div className='flex items-center justify-between gap-3 px-1'>
      <div className='flex items-center gap-2'>
        {icon}
        <Text className='text-[12px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-zinc-400'>
          {title}
        </Text>
      </div>
      {meta ? (
        React.isValidElement(meta) ? meta : (
          <span className='rounded-full bg-stone-100 px-3 py-1 text-[12px] font-medium text-stone-500 dark:bg-zinc-800 dark:text-zinc-300'>
            {meta}
          </span>
        )
      ) : null}
    </div>
  );
}

function FoldSection({ icon, title, meta, children, defaultOpen = false, className = '' }) {
  return (
    <details open={defaultOpen} className={`group ${className}`}>
      <summary className='cursor-pointer list-none rounded-[18px] transition-colors group-open:mb-0'>
        <SectionHeading icon={icon} title={title} meta={meta} />
      </summary>
      <div className='mt-2.5'>{children}</div>
    </details>
  );
}

const TaskSummary = memo(({ task, running, onResume, onRetry }) => {
  if (!task) return null;

  const effectiveRunning = running || task?.status === 'running';
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
  const hasProcessedAny =
    (task.processedCount ?? 0) > 0
    || matchedCount > 0
    || rejectedCount > 0
    || failedCount > 0;
  const showAction = !effectiveRunning && (hasFailed || canResume);
  const actionLabel = hasFailed ? '重试失败项' : '继续任务';
  const actionHandler = hasFailed ? onRetry : onResume;
  const actionHint = effectiveRunning
    ? '任务正在执行中'
    : hasFailed
      ? `有 ${failedCount} 个失败项等待重试`
      : canResume
        ? `还有 ${pendingCount} 位候选人待处理`
        : '当前没有可执行操作';
  const statusToneCls = effectiveRunning
    ? 'border-[var(--signal-brand-strong-border)] bg-[var(--signal-brand-bg)]'
    : hasFailed
      ? 'border-[var(--signal-danger-border)] bg-[var(--signal-danger-bg)]'
      : 'border-[var(--signal-success-border)] bg-[var(--signal-success-bg)]';

  const metrics = useMemo(
    () => [
      {
        label: '匹配成功',
        val: matchedCount,
        numCls: 'text-emerald-600',
        borderCls: 'border-[var(--panel-success-border)] bg-[var(--panel-success-bg)]',
        labelCls: 'text-emerald-700 dark:text-emerald-300',
      },
      {
        label: '不匹配',
        val: rejectedCount,
        numCls: 'text-stone-800 dark:text-zinc-100',
        borderCls: 'border-stone-200 bg-stone-50/60 dark:border-zinc-800 dark:bg-zinc-900/80',
        labelCls: 'text-stone-500 dark:text-zinc-400',
      },
      {
        label: '执行失败',
        val: failedCount,
        numCls: 'text-rose-500',
        borderCls: 'border-[var(--panel-danger-border)] bg-[var(--panel-danger-bg)]',
        labelCls: 'text-rose-500 dark:text-rose-300',
      },
      {
        label: '待处理',
        val: pendingCount,
        numCls: 'text-brand-600',
        borderCls: 'border-[var(--panel-brand-border)] bg-[var(--panel-brand-bg)]',
        labelCls: 'text-brand-700 dark:text-brand-300',
      },
    ],
    [failedCount, matchedCount, pendingCount, rejectedCount],
  );

  const statusText = effectiveRunning
    ? task.currentCandidateName
      ? `正在分析: ${task.currentCandidateName}`
      : hasFailed
        ? '正在重试失败候选人...'
        : canResume
          ? hasProcessedAny
            ? '正在恢复候选人处理...'
            : '正在准备候选人处理...'
          : '正在执行...'
    : hasFailed
      ? '存在失败项，可重新执行失败任务'
      : canResume
        ? '还有候选人在队列中，可继续执行剩余任务'
        : '流程已完成，所有指令执行完毕';
  const statusIconCls = effectiveRunning
    ? '!text-brand-500'
    : hasFailed
      ? '!text-rose-500'
      : '!text-emerald-500';

  return (
    <div className='mb-5 overflow-hidden rounded-[30px] border border-stone-200/80 bg-white shadow-[0_14px_40px_rgba(24,24,27,0.07)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_18px_48px_rgba(0,0,0,0.34)]'>
      <div className='border-b border-stone-100 bg-[radial-gradient(circle_at_top_left,_rgba(192,146,63,0.11),_transparent_36%),linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(250,250,250,0.98)_100%)] px-5 py-5 dark:border-zinc-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(217,188,112,0.16),_transparent_36%),linear-gradient(180deg,_rgba(20,23,27,1)_0%,_rgba(13,15,18,0.98)_100%)]'>
        <div className='mb-4 flex items-start justify-between gap-4'>
          <div className='min-w-0'>
            <div className='mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:text-zinc-500'>
              任务概览
            </div>
            <div className='flex flex-wrap items-center gap-2.5'>
              <h3 className='m-0 truncate text-[20px] font-semibold tracking-[-0.04em] text-stone-900 dark:text-zinc-100'>
                {task.jobTitle || task.targetProfile?.split('\n')[0]?.replace(/^岗位名称[：:]\s*/, '') || '未命名岗位'}
              </h3>

              <SignalBadge tone={effectiveRunning ? 'active' : hasFailed ? 'danger' : canResume ? 'warning' : 'success'}>
                {effectiveRunning ? '进行中' : hasFailed ? '待处理' : canResume ? '可继续' : '已完成'}
              </SignalBadge>
            </div>
            <div className='mt-2 text-[13px] leading-6 text-stone-500 dark:text-zinc-400'>
              {actionHint}
            </div>
          </div>

          {showAction ? (
            <div className='flex min-w-[158px] flex-col items-end gap-2'>
              <Button
                type='primary'
                icon={<ThunderboltFilled />}
                onClick={actionHandler}
                className='!h-11 w-full shrink-0 rounded-full px-4 text-[13px] font-semibold shadow-sm'
              >
                {actionLabel}
              </Button>
            </div>
          ) : null}
        </div>

        <div className='grid grid-cols-2 gap-2.5 xl:grid-cols-4'>
          {metrics.map((m) => (
            <div
              key={m.label}
              className={`relative flex min-h-[78px] flex-col justify-center rounded-[18px] border px-4 py-2.5 xl:min-h-[74px] ${m.borderCls}`}
            >
              <span className={`mb-1.5 text-[12px] font-medium ${m.labelCls}`}>
                {m.label}
              </span>
              <span className={`tabular-nums text-[34px] leading-none font-semibold tracking-[-0.04em] ${m.numCls}`}>
                {m.val ?? 0}
              </span>
              {m.label === '匹配成功' ? (
                <div className='absolute inset-y-3 left-0 w-[3px] rounded-full bg-emerald-600' />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className='p-4'>
        <div className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 ${statusToneCls}`}>
          {effectiveRunning ? (
            <SyncOutlined spin className={`${STATUS_ICON_BASE_CLS} ${statusIconCls}`} />
          ) : (
            <CheckCircleFilled className={`${STATUS_ICON_BASE_CLS} ${statusIconCls}`} />
          )}

          <div className='min-w-0'>
            <div className='text-[14px] font-medium leading-5 text-stone-700 dark:text-zinc-200'>
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
  const matchedTone = candidate.matched === true ? 'success' : 'neutral';
  const statusTone = isActive ? 'active' : 'neutral';

  return (
    <button
      type='button'
      onClick={onClick}
      className={`group mb-2.5 flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left transition-all ${
        isActive
          ? 'border-[var(--signal-brand-strong-border)] bg-[linear-gradient(135deg,rgba(192,146,63,0.12),rgba(255,255,255,0.96))] shadow-[0_10px_30px_rgba(192,146,63,0.12)] dark:bg-[linear-gradient(135deg,rgba(192,146,63,0.14),rgba(24,24,27,0.96))]'
          : 'border-stone-200/80 bg-white hover:border-stone-300 hover:bg-stone-50/70 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60'
      }`}
    >
      <div className='min-w-0 flex-1 pr-3'>
        <div className='mb-1.5 flex items-center gap-2'>
          <span
            className='truncate text-[15px] font-semibold tracking-[-0.02em] text-stone-900 dark:text-zinc-100'
          >
            {candidate.name}
          </span>

          {matchedLabel ? (
            <SignalBadge tone={matchedTone}>{matchedLabel}</SignalBadge>
          ) : null}

          <SignalBadge tone={statusTone}>{statusLabel}</SignalBadge>
        </div>

        <div className='break-words text-[14px] leading-6 text-stone-500 dark:text-zinc-400'>
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
  const mergedSystemTimeline = useMemo(
    () => mergeToolEvents(systemTimeline),
    [systemTimeline],
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
          meta={<MetaBadge>{candidates.length} 人</MetaBadge>}
        />
      </div>

      <div className='mb-6'>
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
        <div className='mb-6 space-y-4'>
          <SectionHeading
            icon={<div className='h-4 w-1.5 rounded-full bg-stone-300 dark:bg-zinc-600' />}
            title={`候选人详情：${selectedCandidate.name}`}
          />

          <div className={`${PANEL_BASE} p-4`}>
            <div className='mb-4 flex items-center justify-between border-b border-stone-100 pb-3 dark:border-zinc-800'>
              <div className='flex flex-col gap-1'>
                <span className='text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400 dark:text-zinc-500'>
                  处理结论
                </span>
                <div className='flex items-center gap-2'>
                  {selectedCandidate.matched ? (
                    <CheckCircleFilled className='!text-[16px] !text-emerald-500' />
                  ) : (
                    <div className='h-4 w-4 rounded-full border-2 border-stone-200 dark:border-zinc-700' />
                  )}
                  <span className='text-[15px] font-semibold text-stone-800 dark:text-zinc-100'>
                    {selectedCandidate.matched ? '符合岗位要求' : '暂不匹配'}
                  </span>
                </div>
              </div>
              <div className='text-right flex flex-col items-end gap-1'>
                <span className='text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400 dark:text-zinc-500'>
                  最后同步
                </span>
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[12px] text-stone-500 dark:text-zinc-300 ${SUBTLE_PANEL}`}>
                  <ClockCircleOutlined className={INLINE_ICON_CLS} />
                  <span>{formatDateTime(selectedCandidate.updatedAt)}</span>
                </div>
              </div>
            </div>

            <div className='relative'>
              <div className='mb-2 flex items-center gap-1.5'>
                <FileTextOutlined className={SECTION_ICON_CLS} />
                <span className='text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-zinc-400'>
                  简历摘要
                </span>
              </div>
              <div className='rounded-[18px] border border-stone-200/70 bg-stone-50/80 p-3.5 text-[14px] leading-6 text-stone-700 dark:border-zinc-800 dark:bg-zinc-800/72 dark:text-zinc-200'>
                {selectedCandidate.resumeSummary || '该候选人暂无摘要记录'}
              </div>
            </div>
          </div>

          <FoldSection
            icon={<SyncOutlined className={SECTION_ICON_CLS} />}
            title='候选人处理记录'
            className={`${PANEL_BASE} overflow-hidden p-3`}
            defaultOpen={false}
          >
            <TimelineSection
              toolTimeline={candidateTimeline}
              emptyText='暂无记录'
              defaultOpen={false}
            />
          </FoldSection>
        </div>
      )}

      {/* 系统级流水记录 */}
      <FoldSection
        icon={<SettingOutlined className={SECTION_ICON_CLS} />}
        title='任务准备记录'
        meta={<MetaBadge>{mergedSystemTimeline.length} 条记录</MetaBadge>}
        className='mt-6'
        defaultOpen={false}
      >
        <div className={`${PANEL_BASE} overflow-hidden`}>
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
