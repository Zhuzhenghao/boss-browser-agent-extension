import React, { memo, useMemo } from 'react';
import { Button, Tag, Typography } from 'antd';
import { MetricTile, SectionBlock } from './primitives';
import { TimelineSection } from './timeline';
import {
  areCandidateSnapshotsEqual,
  buildCandidateStatusCounts,
  formatDateTime,
  getCandidateKey,
  getCandidateStatusColor,
  getCandidateStatusLabel,
  getCandidateTimeline,
  getSystemTimeline,
  getTaskStageSummary,
  getTaskStatusColor,
  getTaskStatusLabel,
  resolveResultToolTimeline,
  summarizeCandidateAction,
} from './shared';

const { Text, Title } = Typography;

function getTagClass(color) {
  const map = {
    gray: 'bg-stone-100 text-stone-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    orange: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  };

  return map[color] ?? map.gray;
}

function TaskOverview({ task }) {
  if (!task) return null;

  const remainingCount = Math.max(
    0,
    (task.unreadCandidateCount || 0) - (task.processedCount || 0),
  );

  return (
    <SectionBlock
      label="任务概览"
      title={task.targetProfile || '这轮巡检'}
      description={task.taskId || '未命名任务'}
      action={(
        <Tag bordered={false} className="m-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
          {getTaskStatusLabel(task.status)}
        </Tag>
      )}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <MetricTile label="未读总数" value={task.unreadCandidateCount || 0} tone="emphasis" />
        <MetricTile label="已处理" value={task.processedCount || 0} />
        <MetricTile label="剩余" value={remainingCount} />
        <MetricTile label="匹配" value={task.matchedCount || 0} />
        <MetricTile label="不匹配" value={task.rejectedCount || 0} />
        <MetricTile label="失败" value={task.failedCount || 0} tone={task.failedCount ? 'danger' : 'default'} />
      </div>
    </SectionBlock>
  );
}

function CurrentCandidatePanel({ task }) {
  const currentCandidateId = task?.currentCandidateId;
  const currentName = task?.currentCandidateName;
  const candidates = Array.isArray(task?.candidates) ? task.candidates : [];
  const currentCandidate = candidates.find(candidate => (
    (currentCandidateId && candidate.candidateId === currentCandidateId)
      || candidate.name === currentName
  ));

  if (!currentCandidate) return null;

  return (
    <SectionBlock
      label="当前执行"
      title={currentCandidate.name}
      description={summarizeCandidateAction(currentCandidate)}
      action={(
        <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${getTagClass(getCandidateStatusColor(currentCandidate.status))}`}>
          {getCandidateStatusLabel(currentCandidate.status)}
        </Tag>
      )}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <Text size="2" className="leading-7 text-stone-700">
            {currentCandidate.resumeSummary || summarizeCandidateAction(currentCandidate)}
          </Text>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Text size="2" className="text-stone-500">最近更新时间</Text>
              <Text size="2" weight="medium" className="text-stone-900">
                {formatDateTime(currentCandidate.updatedAt) || '暂无'}
              </Text>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Text size="2" className="text-stone-500">结果</Text>
              <Text size="2" weight="medium" className="text-stone-900">
                {currentCandidate.matched === true ? '匹配' : currentCandidate.status === 'rejected' ? '不匹配' : '处理中'}
              </Text>
            </div>
          </div>
        </div>
      </div>
    </SectionBlock>
  );
}

function TaskCommandCenter({ task, toolTimeline = [] }) {
  if (!task) return null;

  const statusLabel = getTaskStatusLabel(task.status);
  const stageSummary = getTaskStageSummary(task, toolTimeline);
  const counts = buildCandidateStatusCounts(task);

  return (
    <SectionBlock
      label="当前任务"
      title="任务进展"
      description="先看这轮巡检做到哪一步，再决定是否进入某位候选人的处理详情。"
      action={(
        <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${getTagClass(getTaskStatusColor(task.status))}`}>
          {statusLabel}
        </Tag>
      )}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.9fr)]">
        <div className="rounded-3xl border border-stone-200 bg-stone-950 px-5 py-5 text-white">
          <Text size="1" className="uppercase tracking-[0.18em] text-white/60">
            当前进度
          </Text>
          <Title level={3} className="!mt-3 !mb-0 !text-2xl !font-semibold !text-white">
            {stageSummary}
          </Title>
          <Text size="2" className="mt-3 leading-7 text-white/70">
            当前筛选要求：{task.targetProfile || task.taskId}
          </Text>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-stone-50 px-5 py-5">
          <div className="flex flex-col gap-4">
            <div>
              <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
                正在处理
              </Text>
              <Text size="4" weight="medium" className="mt-2 text-stone-950">
                {task.currentCandidateName || '还没进入候选人处理'}
              </Text>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricTile label="待处理" value={counts.queued || 0} />
              <MetricTile label="处理中" value={counts.running || 0} />
              <MetricTile label="已匹配" value={task.matchedCount || 0} />
              <MetricTile label="失败" value={counts.failed || 0} tone={counts.failed ? 'danger' : 'default'} />
            </div>
          </div>
        </div>
      </div>
    </SectionBlock>
  );
}

function getContinuationState(task) {
  if (!task) {
    return { hasUnfinished: false, hasFailed: false };
  }

  const hasUnfinished = Array.isArray(task.candidates)
    && task.candidates.some(candidate => ['queued', 'running', 'failed'].includes(candidate.status));
  const hasFailed = Array.isArray(task.candidates)
    && task.candidates.some(candidate => candidate.status === 'failed');

  return { hasUnfinished, hasFailed };
}

export function TaskActions({ task, running, onResumeTask, onRetryFailed }) {
  if (!task || running) return null;

  const { hasUnfinished, hasFailed } = getContinuationState(task);
  if (!hasUnfinished && !hasFailed) return null;

  return (
    <SectionBlock label="任务操作" title="继续处理">
      <div className="flex flex-wrap items-center gap-3">
        {hasUnfinished ? (
          <Button
            onClick={() => onResumeTask(task.taskId)}
          >
            继续未完成
          </Button>
        ) : null}
        {hasFailed ? (
          <Button
            onClick={() => onRetryFailed(task.taskId)}
          >
            重试失败项
          </Button>
        ) : null}
      </div>
    </SectionBlock>
  );
}

function TaskActionButtons({ task, running, onResumeTask, onRetryFailed }) {
  if (!task || running) return null;

  const { hasUnfinished, hasFailed } = getContinuationState(task);
  if (!hasUnfinished && !hasFailed) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasUnfinished ? (
        <Button
          onClick={() => onResumeTask(task.taskId)}
        >
          继续未完成
        </Button>
      ) : null}
      {hasFailed ? (
        <Button
          onClick={() => onRetryFailed(task.taskId)}
        >
          重试失败项
        </Button>
      ) : null}
    </div>
  );
}

function QueueSnapshot({ task }) {
  const candidates = Array.isArray(task?.candidates) ? task.candidates : [];
  if (!candidates.length) return null;

  return (
    <SectionBlock
      label="候选人队列"
      title="候选人进展"
      description="这里只看每位候选人的当前状态，方便快速判断整体进度和异常分布。"
    >
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        {candidates.map((candidate, index) => (
          <div
            key={`${candidate.candidateId || candidate.name}-${index}`}
            className="border-b border-stone-200 px-4 py-4 last:border-b-0"
          >
            <div className="grid gap-3 md:grid-cols-[40px_minmax(0,1.3fr)_130px_120px] md:items-center">
              <Text size="1" weight="medium" className="uppercase tracking-[0.14em] text-stone-400">
                {String(index + 1).padStart(2, '0')}
              </Text>
              <div className="min-w-0">
                <Text size="2" weight="medium" className="truncate text-stone-950">
                  {candidate.name}
                </Text>
                <Text size="2" className="mt-1 truncate text-stone-500">
                  {summarizeCandidateAction(candidate)}
                </Text>
              </div>
              <div>
                <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${getTagClass(getCandidateStatusColor(candidate.status))}`}>
                  {getCandidateStatusLabel(candidate.status)}
                </Tag>
              </div>
              <Text size="2" className="text-stone-500 md:text-right">
                {formatDateTime(candidate.updatedAt) || '暂无更新时间'}
              </Text>
            </div>
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

const TaskSummaryHeader = memo(function TaskSummaryHeader({
  task,
  running,
  onResumeTask,
  onRetryFailed,
}) {
  if (!task) return null;

  const remainingCount = Math.max(
    0,
    (task.unreadCandidateCount || 0) - (task.processedCount || 0),
  );

  return (
    <SectionBlock
      label="任务摘要"
      title={task.targetProfile || '这轮巡检'}
      description={task.summary || task.taskId || '先看整体结果，再进入候选人详情。'}
      action={(
        <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${getTagClass(getTaskStatusColor(task.status))}`}>
          {getTaskStatusLabel(task.status)}
        </Tag>
      )}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <MetricTile label="未读" value={task.unreadCandidateCount || 0} tone="emphasis" />
        <MetricTile label="已处理" value={task.processedCount || 0} />
        <MetricTile label="剩余" value={remainingCount} />
        <MetricTile label="匹配" value={task.matchedCount || 0} />
        <MetricTile label="不匹配" value={task.rejectedCount || 0} />
        <MetricTile label="失败" value={task.failedCount || 0} tone={task.failedCount ? 'danger' : 'default'} />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
              正在处理
            </Text>
            <Text size="3" weight="medium" className="text-stone-900">
              {task.currentCandidateName || '这轮已处理完成'}
            </Text>
          </div>
          <TaskActionButtons
            task={task}
            running={running}
            onResumeTask={onResumeTask}
            onRetryFailed={onRetryFailed}
          />
        </div>
      </div>
    </SectionBlock>
  );
}, (prevProps, nextProps) => (
  prevProps.running === nextProps.running
  && prevProps.onResumeTask === nextProps.onResumeTask
  && prevProps.onRetryFailed === nextProps.onRetryFailed
  && prevProps.task?.taskId === nextProps.task?.taskId
  && prevProps.task?.status === nextProps.task?.status
  && prevProps.task?.summary === nextProps.task?.summary
  && prevProps.task?.unreadCandidateCount === nextProps.task?.unreadCandidateCount
  && prevProps.task?.processedCount === nextProps.task?.processedCount
  && prevProps.task?.matchedCount === nextProps.task?.matchedCount
  && prevProps.task?.failedCount === nextProps.task?.failedCount
  && prevProps.task?.currentCandidateName === nextProps.task?.currentCandidateName
));

const CandidateListRow = memo(function CandidateListRow({
  candidate,
  candidateKey,
  isActive,
  onSelectCandidate,
}) {
  return (
    <Button
      type="text"
      htmlType="button"
      onClick={() => onSelectCandidate(candidateKey)}
      className={`interactive-row !flex !h-auto !w-full !justify-start border-b border-stone-200 !px-4 !py-4 !text-left last:border-b-0 ${
        isActive ? 'bg-stone-100' : 'bg-white'
      }`}
    >
      <div className="grid w-full gap-3 md:grid-cols-[minmax(0,1.3fr)_140px_110px] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="2" weight="medium" className="truncate text-stone-950">
              {candidate.name}
            </Text>
            <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${getTagClass(getCandidateStatusColor(candidate.status))}`}>
              {getCandidateStatusLabel(candidate.status)}
            </Tag>
          </div>
          <Text size="2" className="mt-2 line-clamp-2 leading-7 text-stone-600">
            {summarizeCandidateAction(candidate)}
          </Text>
        </div>

        <div className="min-w-0">
          <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
            结果
          </Text>
          <Text size="2" className="mt-1 text-stone-700">
            {candidate.matched === true
              ? '匹配'
              : candidate.status === 'rejected'
                ? '不匹配'
                : candidate.status === 'failed'
                  ? '失败'
                  : '处理中'}
          </Text>
        </div>

        <div className="min-w-0 md:text-right">
          <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
            更新时间
          </Text>
          <Text size="2" className="mt-1 text-stone-700">
            {formatDateTime(candidate.updatedAt) || '暂无'}
          </Text>
        </div>
      </div>
    </Button>
  );
}, (prevProps, nextProps) => (
  prevProps.candidateKey === nextProps.candidateKey
  && prevProps.isActive === nextProps.isActive
  && prevProps.onSelectCandidate === nextProps.onSelectCandidate
  && areCandidateSnapshotsEqual(prevProps.candidate, nextProps.candidate)
));

const CandidateList = memo(function CandidateList({
  candidates,
  selectedCandidateKey,
  onSelectCandidate,
}) {
  if (!candidates.length) return null;

  return (
    <SectionBlock
      label="候选人列表"
      title="候选人列表"
      description="先看每位候选人的当前状态，再点击某个人查看详细记录。"
    >
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        {candidates.map((candidate, index) => {
          const candidateKey = getCandidateKey(candidate, index);
          const isActive = selectedCandidateKey === candidateKey;

          return (
            <CandidateListRow
              key={candidateKey}
              candidate={candidate}
              candidateKey={candidateKey}
              isActive={isActive}
              onSelectCandidate={onSelectCandidate}
            />
          );
        })}
      </div>
    </SectionBlock>
  );
}, (prevProps, nextProps) => (
  prevProps.selectedCandidateKey === nextProps.selectedCandidateKey
  && prevProps.onSelectCandidate === nextProps.onSelectCandidate
  && prevProps.candidates.length === nextProps.candidates.length
  && prevProps.candidates.every((candidate, index) => (
    areCandidateSnapshotsEqual(candidate, nextProps.candidates[index])
  ))
));

const CandidateDetailPanel = memo(function CandidateDetailPanel({ candidate }) {
  if (!candidate) {
    return (
      <SectionBlock
        label="候选人详情"
        title="选择一位候选人"
        description="点击上方列表中的候选人后，这里会展示他的简历摘要、处理结果和留档信息。"
      />
    );
  }

  return (
    <SectionBlock
      label="候选人详情"
      title={candidate.name}
      description={summarizeCandidateAction(candidate)}
      action={(
        <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${getTagClass(getCandidateStatusColor(candidate.status))}`}>
          {getCandidateStatusLabel(candidate.status)}
        </Tag>
      )}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
          <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
            简历摘要
          </Text>
          <Text size="2" className="mt-2 whitespace-pre-wrap leading-7 text-stone-700">
            {candidate.resumeSummary || '暂无摘要'}
          </Text>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <div className="flex flex-col gap-3">
            <div>
              <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
                最终动作
              </Text>
              <Text size="2" className="mt-1 text-stone-800">
                {summarizeCandidateAction(candidate)}
              </Text>
            </div>

            <div>
              <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
                处理结果
              </Text>
              <Text size="2" className="mt-1 text-stone-800">
                {candidate.matched === true
                  ? '匹配并已执行后续动作'
                  : candidate.status === 'rejected'
                    ? '已发送不匹配消息'
                    : candidate.status === 'failed'
                      ? candidate.error || '处理失败'
                      : '处理中'}
              </Text>
            </div>

            <div>
              <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
                更新时间
              </Text>
              <Text size="2" className="mt-1 text-stone-800">
                {formatDateTime(candidate.updatedAt) || '暂无'}
              </Text>
            </div>

            {candidate.noteFile?.fileName ? (
              <div>
                <Text size="1" className="uppercase tracking-[0.14em] text-stone-400">
                  记录文件
                </Text>
                <Text size="2" className="mt-1 break-all text-stone-800">
                  {candidate.noteFile.fileName}
                </Text>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </SectionBlock>
  );
}, (prevProps, nextProps) => (
  areCandidateSnapshotsEqual(prevProps.candidate, nextProps.candidate)
));

export function ResultView({ result }) {
  if (!result) return null;

  const message = result.summary || result.finalizeMessage || result.rawResponse || '任务正在执行中。';
  const task = result.task || null;
  const toolTimeline = resolveResultToolTimeline(result, task);
  const systemTimeline = getSystemTimeline(toolTimeline);

  return (
    <div className="flex flex-col gap-4">
      <TaskCommandCenter task={task} toolTimeline={toolTimeline} />
      <TaskOverview task={task} />
      <CurrentCandidatePanel task={task} />

      {result.error ? (
        <SectionBlock label="错误" title="执行失败">
          <div className="rounded-2xl bg-red-50 p-4 text-sm leading-7 text-red-700">
            {result.error}
          </div>
        </SectionBlock>
      ) : null}

      <QueueSnapshot task={task} />

      <SectionBlock label="任务结论" title="本轮结论">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-7 text-stone-700">
          {message}
        </div>
      </SectionBlock>

      <TimelineSection
        label="任务进度"
        title="任务进度"
        description="这里展示这轮巡检已经做到哪一步，比如打开沟通页、切到未读、读取名单、开始处理候选人。"
        toolTimeline={systemTimeline}
        emptyText="这轮任务还没有进度记录。"
      />
    </div>
  );
}

export const TaskDetailView = memo(function TaskDetailView({
  result,
  running,
  selectedCandidateKey,
  onSelectCandidate,
  onResumeTask,
  onRetryFailed,
}) {
  if (!result) return null;

  const task = result.task || null;
  const candidates = useMemo(
    () => (Array.isArray(task?.candidates) ? task.candidates : []),
    [task?.candidates],
  );
  const selectedCandidate = useMemo(() => (
    candidates.find((candidate, index) => (
      getCandidateKey(candidate, index) === selectedCandidateKey
    )) || candidates[0] || null
  ), [candidates, selectedCandidateKey]);
  const allTimeline = useMemo(() => resolveResultToolTimeline(result, task), [result, task]);
  const systemTimeline = useMemo(() => getSystemTimeline(allTimeline), [allTimeline]);
  const candidateTimeline = useMemo(
    () => getCandidateTimeline(allTimeline, selectedCandidate),
    [allTimeline, selectedCandidate],
  );

  return (
    <div className="flex flex-col gap-4">
      <TaskSummaryHeader
        task={task}
        running={running}
        onResumeTask={onResumeTask}
        onRetryFailed={onRetryFailed}
      />

      {result.error ? (
        <SectionBlock label="错误" title="执行失败">
          <div className="rounded-2xl bg-red-50 p-4 text-sm leading-7 text-red-700">
            {result.error}
          </div>
        </SectionBlock>
      ) : null}

      <CandidateList
        candidates={candidates}
        selectedCandidateKey={selectedCandidateKey}
        onSelectCandidate={onSelectCandidate}
      />

      <TimelineSection
        label="任务进度"
        title="任务进度"
        description="先确认这轮巡检已经推进到哪一步，再看单个候选人的处理动作。"
        toolTimeline={systemTimeline}
        emptyText="这轮巡检暂时还没有进度记录。"
      />

      <CandidateDetailPanel candidate={selectedCandidate} />

      <TimelineSection
        label="处理记录"
        title={selectedCandidate ? `${selectedCandidate.name} 的处理记录` : '候选人处理记录'}
        description="这里只展示当前选中候选人的处理过程，不混入任务准备阶段。"
        toolTimeline={candidateTimeline}
        emptyText={selectedCandidate ? '这位候选人还没有处理记录。' : '请先选择一位候选人。'}
        defaultOpen
      />
    </div>
  );
});
