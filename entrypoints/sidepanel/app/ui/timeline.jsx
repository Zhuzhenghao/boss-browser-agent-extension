import React, { memo, useMemo } from 'react';
import { Typography } from 'antd';
import { 
  CodeOutlined 
} from '@ant-design/icons';
import { JsonBlock } from './primitives';
import {
  areToolTimelinesShallowEqual,
  buildToolGroups,
  formatDateTime,
  getToolDisplayName,
  getToolPhaseLabel,
  mergeToolEvents,
} from './shared';

const { Text } = Typography;

function TimelineBadge({ tone = 'neutral', children }) {
  const toneClass = {
    neutral: 'border-[var(--signal-neutral-border)] bg-[var(--signal-neutral-bg)] text-[var(--signal-neutral-text)]',
    success: 'border-[var(--signal-success-border)] bg-[var(--signal-success-bg)] text-[var(--signal-success-text)]',
    danger: 'border-[var(--signal-danger-border)] bg-[var(--signal-danger-bg)] text-[var(--signal-danger-text)]',
    warning: 'border-[var(--signal-brand-border)] bg-[var(--signal-brand-bg)] text-[var(--signal-brand-text)]',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ${toneClass[tone] || toneClass.neutral}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      <span>{children}</span>
    </span>
  );
}

const ToolStoryboardContent = memo(function ToolStoryboardContent({ toolTimeline }) {
  const groups = useMemo(() => (
    buildToolGroups(toolTimeline).map(group => ({
      ...group,
      events: mergeToolEvents(group.events),
    }))
  ), [toolTimeline]);

  if (!groups.length) return null;

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key} className="relative">
          <div className="mb-4 flex items-center gap-3 px-1">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-stone-200 dark:bg-zinc-700" />
              <span className="text-[12px] font-semibold tracking-[0.04em] text-stone-500 dark:text-zinc-400">
                {group.title}
              </span>
            </div>
            <div className="h-[1px] flex-1 bg-stone-100 dark:bg-zinc-800" />
            <TimelineBadge>{group.events.length} 条记录</TimelineBadge>
          </div>
          
          <div className="ml-0.5">
            {group.events.map((event, index) => (
              <ToolEventCard
                key={`${group.key}-${index}-${event.toolName}`}
                event={event}
                isLast={index === group.events.length - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}, (prevProps, nextProps) => areToolTimelinesShallowEqual(prevProps.toolTimeline, nextProps.toolTimeline));



const ToolEventCard = memo(function ToolEventCard({ event, isLast }) {
  const isError = event.phase === 'error';
  const phaseTone = isError ? 'danger' : event.phase === 'result' ? 'success' : 'warning';

  return (
    <div className="relative pb-2.5 pl-5 last:pb-0">
      {!isLast && <div className="absolute left-[5px] top-4.5 bottom-0 w-px bg-stone-100/70 dark:bg-zinc-800/80" />}
      
      <div className={`absolute left-0 top-1.5 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${
        isError ? 'text-rose-400' : 'text-brand-400'
      }`}>
        <div className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-rose-400' : 'bg-brand-400'}`} />
      </div>

      <div className="rounded-lg border border-stone-200/70 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium text-stone-800 dark:text-zinc-100">{getToolDisplayName(event.toolName)}</span>
              <TimelineBadge tone={phaseTone}>{getToolPhaseLabel(event.phase)}</TimelineBadge>
            </div>
          </div>

          {event.inputPayload || event.outputPayload ? (
            <details className="group/details">
              <summary className="flex list-none items-center justify-between gap-3 cursor-pointer text-stone-500 transition-colors hover:text-brand-600 dark:text-zinc-400">
                <span className="text-[12px] font-mono text-stone-400 dark:text-zinc-500">
                  {formatDateTime(event.completedAt || event.at)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-[0.02em]">
                  <CodeOutlined className="text-[12px]" />
                  查看原始数据
                </span>
              </summary>
              <div className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-[#1e1e1e] p-3 dark:border-zinc-800 dark:bg-black">
                 {event.inputPayload && (
                   <div>
                     <div className="mb-2 text-[12px] font-medium tracking-[0.03em] text-stone-400 dark:text-zinc-500">输入参数</div>
                     <JsonBlock value={event.inputPayload} inverted />
                   </div>
                 )}
                 {event.outputPayload && (
                   <div>
                     <div className="mb-2 text-[12px] font-medium tracking-[0.03em] text-stone-400 dark:text-zinc-500">输出结果</div>
                     <JsonBlock value={event.outputPayload} inverted />
                   </div>
                 )}
              </div>
            </details>
          ) : (
            <div className="text-[12px] font-mono text-stone-400 dark:text-zinc-500">{formatDateTime(event.completedAt || event.at)}</div>
          )}
        </div>
      </div>
    </div>
  );
});

export function TimelineSection({ toolTimeline, emptyText, description }) {
  if (!toolTimeline?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <span className="text-stone-300 text-[13px] font-medium dark:text-zinc-500">{emptyText || '暂无处理记录'}</span>
      </div>
    );
  }

  return (
    <div className="bg-white px-4 py-3.5 dark:bg-zinc-900">
      {description && (
        <div className="mb-3 rounded-xl border border-stone-200/70 bg-stone-50/70 p-3 text-[12px] leading-6 text-stone-500 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-400">
          {description}
        </div>
      )}
      <ToolStoryboardContent toolTimeline={toolTimeline} />
    </div>
  );
}
