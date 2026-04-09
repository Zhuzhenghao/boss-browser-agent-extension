import React, { memo, useMemo } from 'react';
import { Tag, Typography } from 'antd';
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
              <div className="w-1.5 h-1.5 rounded-full bg-stone-200" />
              <span className="text-[12px] font-semibold tracking-[0.04em] text-stone-500">
                {group.title}
              </span>
            </div>
            <div className="h-[1px] flex-1 bg-stone-100" />
            <Tag bordered={false} className="m-0 bg-stone-50 px-2.5 py-1 text-[12px] font-medium text-stone-500">
              {group.events.length} 条记录
            </Tag>
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

  return (
    <div className="relative pb-2.5 pl-5 last:pb-0">
      {!isLast && <div className="absolute left-[5px] top-4.5 bottom-0 w-px bg-stone-100/70" />}
      
      <div className={`absolute left-0 top-1.5 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-white shadow-sm ${
        isError ? 'text-rose-400' : 'text-brand-400'
      }`}>
        <div className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-rose-400' : 'bg-brand-400'}`} />
      </div>

      <div className="rounded-lg border border-stone-200/70 bg-white px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium text-stone-800">{getToolDisplayName(event.toolName)}</span>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium ${
              isError ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-600'
              }`}>
                {getToolPhaseLabel(event.phase)}
              </span>
            </div>
          </div>

          {event.inputPayload || event.outputPayload ? (
            <details className="group/details">
              <summary className="flex list-none items-center justify-between gap-3 cursor-pointer text-stone-500 transition-colors hover:text-brand-600">
                <span className="text-[12px] font-mono text-stone-400">
                  {formatDateTime(event.completedAt || event.at)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-[0.02em]">
                  <CodeOutlined className="text-[12px]" />
                  查看原始数据
                </span>
              </summary>
              <div className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-[#1e1e1e] p-3">
                 {event.inputPayload && (
                   <div>
                     <div className="mb-2 text-[12px] font-medium tracking-[0.03em] text-stone-400">输入参数</div>
                     <JsonBlock value={event.inputPayload} inverted />
                   </div>
                 )}
                 {event.outputPayload && (
                   <div>
                     <div className="mb-2 text-[12px] font-medium tracking-[0.03em] text-stone-400">输出结果</div>
                     <JsonBlock value={event.outputPayload} inverted />
                   </div>
                 )}
              </div>
            </details>
          ) : (
            <div className="text-[12px] font-mono text-stone-400">{formatDateTime(event.completedAt || event.at)}</div>
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
        <span className="text-stone-300 text-[13px] font-medium">{emptyText || '暂无处理记录'}</span>
      </div>
    );
  }

  return (
    <div className="bg-white px-4 py-3.5">
      {description && (
        <div className="mb-3 rounded-xl border border-stone-200/70 bg-stone-50/70 p-3 text-[12px] leading-6 text-stone-500">
          {description}
        </div>
      )}
      <ToolStoryboardContent toolTimeline={toolTimeline} />
    </div>
  );
}
