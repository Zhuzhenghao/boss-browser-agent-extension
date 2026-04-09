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

const ToolEventCard = memo(function ToolEventCard({ event, index }) {
  const hasInputPayload = event?.inputPayload && Object.keys(event.inputPayload).length > 0;
  const hasOutputPayload = event?.outputPayload && Object.keys(event.outputPayload).length > 0;
  const hasErrorPayload = event?.errorPayload && Object.keys(event.errorPayload).length > 0;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Text size="1" weight="medium" className="uppercase tracking-[0.14em] text-stone-400">
            Tool {index + 1}
          </Text>
          <Text size="3" weight="medium" className="text-stone-900">
            {getToolDisplayName(event.toolName)}
          </Text>
        </div>
        <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${getTagClass(getToolPhaseColor(event.phase))}`}>
          {getToolPhaseLabel(event.phase)}
        </Tag>
      </div>

      <div className="mt-3 rounded-2xl bg-stone-50 p-4">
        <div className="flex flex-col gap-2">
          {event.callSummary ? (
            <Text size="2" className="leading-7 text-stone-500">
              {event.callSummary}
            </Text>
          ) : null}
          {(event.resultSummary || event.errorSummary || event.summary) ? (
            <Text size="2" className="leading-7 text-stone-700">
              {event.resultSummary || event.errorSummary || event.summary}
            </Text>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Tag bordered={false} className="m-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
          {event.completedAt || event.at || ''}
        </Tag>
        {event.candidateId ? (
          <Tag bordered={false} className="m-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
            {event.candidateId}
          </Tag>
        ) : null}
        {event.candidateName ? (
          <Tag bordered={false} className="m-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
            {event.candidateName}
          </Tag>
        ) : null}
      </div>

      <details className="mt-3 rounded-2xl border border-stone-200 bg-stone-50/70">
        <summary className="interactive-summary list-none rounded-t-2xl px-4 py-3 text-sm font-medium text-stone-700">
          查看原始输入/输出
        </summary>
        <div className="border-t border-stone-200 px-4 py-4">
          <div className="flex flex-col gap-3">
            {hasInputPayload ? (
              <div>
                <Text size="1" className="mb-2 block uppercase tracking-[0.14em] text-stone-400">
                  输入
                </Text>
                <JsonBlock value={event.inputPayload} />
              </div>
            ) : null}
            {hasOutputPayload ? (
              <div>
                <Text size="1" className="mb-2 block uppercase tracking-[0.14em] text-stone-400">
                  输出
                </Text>
                <JsonBlock value={event.outputPayload} />
              </div>
            ) : null}
            {hasErrorPayload ? (
              <div>
                <Text size="1" className="mb-2 block uppercase tracking-[0.14em] text-stone-400">
                  错误
                </Text>
                <JsonBlock value={event.errorPayload} />
              </div>
            ) : null}
            {!hasInputPayload && !hasOutputPayload && !hasErrorPayload ? (
              <JsonBlock value={event.payload ?? {}} />
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}, (prevProps, nextProps) => (
  prevProps.index === nextProps.index
  && areToolEventsEqual(prevProps.event, nextProps.event)
));

const ToolStoryboardContent = memo(function ToolStoryboardContent({ toolTimeline }) {
  const groups = useMemo(() => (
    buildToolGroups(toolTimeline).map(group => ({
      ...group,
      events: mergeToolEvents(group.events),
    }))
  ), [toolTimeline]);

  if (!groups.length) return null;

  return (
    <div className="flex flex-col gap-4">
      {groups.map(group => (
        <div key={group.key} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Title level={4} className="!m-0 !text-xl !font-semibold !text-stone-900">
              {group.title}
            </Title>
            <Tag bordered={false} className="m-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
              {group.events.length} 个动作
            </Tag>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {group.events.map((event, index) => (
              <ToolEventCard
                key={`${group.key}-${index}-${event.toolName}-${event.phase}`}
                event={event}
                index={index}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}, (prevProps, nextProps) => (
  areToolTimelinesShallowEqual(prevProps.toolTimeline, nextProps.toolTimeline)
));

export function TimelineSection({
  label,
  title,
  description,
  toolTimeline,
  emptyText,
  defaultOpen = true,
}) {
  if (!toolTimeline.length) {
    return (
      <SectionBlock label={label} title={title} description={description}>
        <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-5">
          <Text size="2" className="text-stone-500">
            {emptyText}
          </Text>
        </div>
      </SectionBlock>
    );
  }

  return (
    <DetailSection label={title} defaultOpen={defaultOpen}>
      {description ? (
        <Text size="2" className="mb-4 block leading-7 text-stone-500">
          {description}
        </Text>
      ) : null}
      <ToolStoryboardContent toolTimeline={toolTimeline} />
    </DetailSection>
  );
}
