import React, { memo, useMemo } from 'react';
import { 
  CheckCircleOutlined,
  CodeOutlined,
  MessageOutlined,
  RobotOutlined,
  ToolOutlined,
  WarningOutlined,
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

function TimelineBadge({ tone = 'neutral', children }) {
  const toneClass = {
    neutral: 'border-white/10 bg-white/[0.04] text-stone-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300',
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200',
    danger: 'border-rose-500/20 bg-rose-500/10 text-rose-200 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200',
    warning: 'border-amber-400/20 bg-amber-300/10 text-amber-100 dark:border-amber-400/20 dark:bg-amber-300/10 dark:text-amber-100',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[5px] text-[10px] font-semibold tracking-[0.08em] ${toneClass[tone] || toneClass.neutral}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75 shadow-[0_0_10px_currentColor]" />
      <span>{children}</span>
    </span>
  );
}

function getEventPresentation(event) {
  const isError = event.phase === 'error';
  const isResult = event.phase === 'result';
  const isModelResponse = event.toolName === 'model_response';
  const isModelReasoning = event.toolName === 'model_reasoning';
  const isModelFinal = event.toolName === 'model_final_output';

  if (isError) {
    return {
      tone: 'danger',
      icon: <WarningOutlined />,
      shellClass: 'border-rose-400/16 bg-[linear-gradient(145deg,rgba(120,18,44,0.28),rgba(15,15,18,0.96))] shadow-[0_24px_60px_-36px_rgba(244,63,94,0.45)]',
      titleClass: 'text-rose-100',
      summaryClass: 'text-rose-50/90',
      railClass: 'from-rose-400/70 via-rose-300/35 to-transparent',
      dotClass: 'border-rose-300/40 bg-rose-400 text-rose-950 shadow-[0_0_18px_rgba(251,113,133,0.45)]',
      metaTone: 'danger',
    };
  }

  if (isModelFinal) {
    return {
      tone: 'success',
      icon: <CheckCircleOutlined />,
      shellClass: 'border-emerald-400/16 bg-[linear-gradient(145deg,rgba(7,62,47,0.68),rgba(9,16,13,0.98))] shadow-[0_30px_80px_-44px_rgba(16,185,129,0.5)]',
      titleClass: 'text-emerald-50',
      summaryClass: 'text-emerald-50/92',
      railClass: 'from-emerald-300/80 via-emerald-400/30 to-transparent',
      dotClass: 'border-emerald-200/40 bg-emerald-300 text-emerald-950 shadow-[0_0_18px_rgba(52,211,153,0.5)]',
      metaTone: 'success',
    };
  }

  if (isModelReasoning) {
    return {
      tone: 'neutral',
      icon: <RobotOutlined />,
      shellClass: 'border-sky-200/10 bg-[linear-gradient(145deg,rgba(20,34,52,0.92),rgba(12,12,14,0.98))] shadow-[0_28px_68px_-40px_rgba(56,189,248,0.32)]',
      titleClass: 'text-sky-50',
      summaryClass: 'text-zinc-200',
      railClass: 'from-sky-300/75 via-sky-400/28 to-transparent',
      dotClass: 'border-sky-200/35 bg-sky-300 text-sky-950 shadow-[0_0_18px_rgba(125,211,252,0.42)]',
      metaTone: 'neutral',
    };
  }

  if (isModelResponse) {
    return {
      tone: 'warning',
      icon: <MessageOutlined />,
      shellClass: 'border-amber-200/12 bg-[linear-gradient(145deg,rgba(71,51,13,0.92),rgba(17,15,12,0.98))] shadow-[0_28px_68px_-42px_rgba(245,158,11,0.3)]',
      titleClass: 'text-amber-50',
      summaryClass: 'text-amber-50/90',
      railClass: 'from-amber-300/80 via-amber-400/32 to-transparent',
      dotClass: 'border-amber-200/35 bg-amber-300 text-amber-950 shadow-[0_0_18px_rgba(252,211,77,0.45)]',
      metaTone: 'warning',
    };
  }

  return {
    tone: isResult ? 'success' : 'neutral',
    icon: isResult ? <CheckCircleOutlined /> : <ToolOutlined />,
    shellClass: isResult
      ? 'border-emerald-300/12 bg-[linear-gradient(145deg,rgba(18,32,26,0.94),rgba(14,14,16,0.98))] shadow-[0_24px_58px_-40px_rgba(16,185,129,0.3)]'
      : 'border-white/8 bg-[linear-gradient(145deg,rgba(33,33,38,0.96),rgba(11,11,13,0.98))] shadow-[0_22px_52px_-40px_rgba(0,0,0,0.72)]',
    titleClass: isResult ? 'text-emerald-50' : 'text-zinc-100',
    summaryClass: 'text-zinc-300',
    railClass: isResult ? 'from-emerald-300/75 via-emerald-400/24 to-transparent' : 'from-[rgba(207,178,99,0.78)] via-[rgba(207,178,99,0.22)] to-transparent',
    dotClass: isResult
      ? 'border-emerald-200/30 bg-emerald-300 text-emerald-950 shadow-[0_0_18px_rgba(52,211,153,0.42)]'
      : 'border-[rgba(240,220,170,0.18)] bg-[rgba(207,178,99,0.9)] text-[#2c200b] shadow-[0_0_18px_rgba(207,178,99,0.36)]',
    metaTone: isResult ? 'success' : 'neutral',
  };
}

function shouldShowEventSummary(event) {
  // 隐藏所有 summary，只显示工具名称和状态
  return false;
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
        <div key={group.key} className="relative px-1">
          <div className="mb-3 flex items-center gap-3 px-1">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-[rgba(207,178,99,0.92)] shadow-[0_0_18px_rgba(207,178,99,0.55)]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-zinc-400">
                {group.title}
              </span>
            </div>
            <div className="h-px flex-1 bg-[linear-gradient(90deg,rgba(207,178,99,0.35),rgba(255,255,255,0.02))]" />
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
  const presentation = getEventPresentation(event);
  const hasPayload = event.inputPayload || event.outputPayload;
  const showSummary = shouldShowEventSummary(event);

  return (
    <div className="relative pb-2.5 pl-8 last:pb-0">
      {!isLast && (
        <div className={`absolute left-[13px] top-7 bottom-0 w-px bg-gradient-to-b ${presentation.railClass}`} />
      )}
      
      <div className={`absolute left-0 top-2 flex h-7 w-7 items-center justify-center rounded-full border text-[12px] ${presentation.dotClass}`}>
        {presentation.icon}
      </div>

      <div className={`relative overflow-hidden rounded-[18px] border px-4 py-3 ${presentation.shellClass}`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_30%)] opacity-60" />
        <div className="relative flex flex-col gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[15px] font-semibold tracking-[0.01em] ${presentation.titleClass}`}>
                {getToolDisplayName(event.toolName)}
              </span>
              <TimelineBadge tone={presentation.metaTone}>{getToolPhaseLabel(event.phase)}</TimelineBadge>
              <span className="ml-auto text-[11px] font-mono text-white/35">{formatDateTime(event.completedAt || event.at)}</span>
            </div>
          </div>

          {showSummary ? (
            <div className={`whitespace-pre-wrap break-words text-[13px] leading-5.5 ${presentation.summaryClass}`}>
              {event.summary}
            </div>
          ) : null}

          {hasPayload ? (
            <details className="group/details">
              <summary className="flex list-none items-center justify-end gap-3 cursor-pointer text-white/55 transition-colors hover:text-[var(--color-brand-400)]">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em]">
                  <CodeOutlined className="text-[12px]" />
                  查看原始数据
                </span>
              </summary>
              <div className="mt-3 space-y-3 rounded-[18px] border border-white/10 bg-black/45 p-3 backdrop-blur-sm dark:border-white/10 dark:bg-black/45">
                 {event.inputPayload && (
                   <div>
                     <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">输入参数</div>
                     <JsonBlock value={event.inputPayload} inverted />
                   </div>
                 )}
                 {event.outputPayload && (
                   <div>
                     <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">输出结果</div>
                     <JsonBlock value={event.outputPayload} inverted />
                   </div>
                 )}
              </div>
            </details>
          ) : null}
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
    <div className="px-1 py-1">
      {description && (
        <div className="mb-4 rounded-[18px] border border-white/8 bg-white/[0.03] p-3 text-[12px] leading-6 text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {description}
        </div>
      )}
      <ToolStoryboardContent toolTimeline={toolTimeline} />
    </div>
  );
}
