import React, { memo, useMemo } from 'react';
import { Tag, Typography } from 'antd';
import { DetailSection, JsonBlock, SectionBlock } from './primitives';
import {
  areToolEventsEqual,
  areToolTimelinesShallowEqual,
  buildToolGroups,
  getToolDisplayName,
  getToolPhaseColor,
  getToolPhaseLabel,
  mergeToolEvents,
} from './shared';

const { Text, Title } = Typography;

const phaseColorMap = {
  gray: 'bg-zinc-100 text-zinc-500',
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-rose-50 text-rose-600',
  orange: 'bg-amber-50 text-amber-600',
  blue: 'bg-indigo-50 text-indigo-600',
};

/**
 * 优化后的单个工具事件卡片
 */
const ToolEventCard = memo(function ToolEventCard({ event, index, isLast }) {
  const hasInput = !!(event?.inputPayload && Object.keys(event.inputPayload).length > 0);
  const hasOutput = !!(event?.outputPayload && Object.keys(event.outputPayload).length > 0);
  const hasError = !!(event?.errorPayload && Object.keys(event.errorPayload).length > 0);

  return (
    <div className="relative pl-8 pb-8 last:pb-2">
      {/* 垂直时间线 */}
      {!isLast && <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-zinc-100" />}
      
      {/* 状态节点 */}
      <div className={`absolute left-0 top-1.5 w-[24px] h-[24px] rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10 ${
        event.phase === 'error' ? 'bg-rose-500' : 'bg-zinc-900'
      }`}>
        <div className="w-1.5 h-1.5 bg-white rounded-full" />
      </div>

      <div className="flex flex-col gap-2">
        {/* 头部：名称与状态 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-zinc-900">
              {getToolDisplayName(event.toolName)}
            </span>
            <Tag bordered={false} className={`m-0 px-2 py-0 rounded-md text-[10px] font-bold ${phaseColorMap[getToolPhaseColor(event.phase)] || phaseColorMap.gray}`}>
              {getToolPhaseLabel(event.phase)}
            </Tag>
          </div>
          <Text className="text-[10px] font-medium text-zinc-400 tabular-nums">
            {event.completedAt || event.at || ''}
          </Text>
        </div>

        {/* 内容主体 */}
        {(event.callSummary || event.resultSummary || event.summary) && (
          <div className="bg-white rounded-2xl p-4 border border-zinc-100 shadow-sm transition-hover hover:shadow-md">
            {event.callSummary && (
              <div className="text-xs text-zinc-400 mb-2 leading-relaxed">
                请求意图：{event.callSummary}
              </div>
            )}
            <div className="text-sm text-zinc-700 leading-relaxed font-medium">
              {event.resultSummary || event.errorSummary || event.summary}
            </div>
          </div>
        )}

        {/* 原始数据折叠 */}
        {(hasInput || hasOutput || hasError) && (
          <details className="group">
            <summary className="list-none cursor-pointer flex items-center gap-1.5 text-zinc-400 hover:text-zinc-600 transition-colors">
              <span className="text-[10px] font-bold uppercase tracking-widest">查看报文数据</span>
              <div className="h-[1px] flex-1 bg-zinc-100" />
              <div className="text-[10px] group-open:rotate-180 transition-transform">↓</div>
            </summary>
            <div className="mt-3 space-y-4 overflow-hidden rounded-2xl bg-zinc-900 p-4">
              {hasInput && (
                <div>
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Input</div>
                  <JsonBlock value={event.inputPayload} inverted />
                </div>
              )}
              {hasOutput && (
                <div>
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Output</div>
                  <JsonBlock value={event.outputPayload} inverted />
                </div>
              )}
              {hasError && (
                <div>
                  <div className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mb-2">Error</div>
                  <JsonBlock value={event.errorPayload} inverted />
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}, (prev, next) => (
  prev.index === next.index && 
  prev.isLast === next.isLast &&
  areToolEventsEqual(prev.event, next.event)
));

/**
 * 轨迹内容容器
 */
const ToolStoryboardContent = memo(function ToolStoryboardContent({ toolTimeline }) {
  const groups = useMemo(() => (
    buildToolGroups(toolTimeline).map(group => ({
      ...group,
      events: mergeToolEvents(group.events),
    }))
  ), [toolTimeline]);

  if (!groups.length) return null;

  return (
    <div className="space-y-10 py-4">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-3 mb-6 px-2">
            <div className="px-3 py-1 bg-zinc-100 rounded-full text-[11px] font-bold text-zinc-600">
              {group.title}
            </div>
            <div className="h-[1px] flex-1 bg-zinc-100" />
            <Text className="text-[10px] text-zinc-400 font-medium">
              共 {group.events.length} 个动作
            </Text>
          </div>
          
          <div className="ml-2">
            {group.events.map((event, index) => (
              <ToolEventCard
                key={`${group.key}-${index}-${event.toolName}-${event.phase}`}
                event={event}
                index={index}
                isLast={index === group.events.length - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}, (prev, next) => (
  areToolTimelinesShallowEqual(prev.toolTimeline, next.toolTimeline)
));

export function TimelineSection({
  title,
  description,
  toolTimeline,
  emptyText = "暂无执行记录",
  defaultOpen = true,
}) {
  if (!toolTimeline || !toolTimeline.length) {
    return (
      <div className="p-8 rounded-[24px] border-2 border-dashed border-zinc-100 flex items-center justify-center">
        <Text className="text-zinc-400 text-sm font-medium">{emptyText}</Text>
      </div>
    );
  }

  return (
    <div className="animate-in slide-in-from-bottom-2 duration-500">
      <DetailSection label={title} defaultOpen={defaultOpen}>
        {description && (
          <Text className="mb-6 block text-sm text-zinc-400 px-2 leading-relaxed">
            {description}
          </Text>
        )}
        <ToolStoryboardContent toolTimeline={toolTimeline} />
      </DetailSection>
    </div>
  );
}