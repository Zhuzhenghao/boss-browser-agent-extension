import React from 'react';
import { Button, Input, Tag, Typography } from 'antd';
import { prettyJson } from './shared';

const { Text, Title } = Typography;
const { TextArea } = Input;

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {eyebrow ? (
          <Text size="1" weight="medium" className="uppercase tracking-[0.18em] text-stone-400 dark:text-zinc-500">
            {eyebrow}
          </Text>
        ) : null}
        <Title level={2} className="!m-0 !text-3xl !font-semibold !tracking-tight !text-stone-950 dark:!text-zinc-100">
          {title}
        </Title>
        {description ? (
          <Text size="2" className="max-w-3xl leading-7 text-stone-500 dark:text-zinc-400">
            {description}
          </Text>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function JsonBlock({ value }) {
  return (
    <div className="overflow-auto rounded-2xl border border-stone-200 bg-stone-950 p-3 dark:border-zinc-800 dark:bg-black">
      <pre className="whitespace-pre-wrap break-words text-[12px] leading-6 text-stone-100 dark:text-zinc-100">
        {prettyJson(value)}
      </pre>
    </div>
  );
}

export function PanelHeader(props) {
  return <SectionHeader {...props} />;
}

export function SectionBlock({ label, title, description, children, action }) {
  return (
    <section className="panel-card rounded-[28px] p-5 md:p-6">
      <div className="flex flex-col gap-4">
        {title || label ? (
          <SectionHeader
            eyebrow={label}
            title={title || label}
            description={description}
            action={action}
          />
        ) : null}
        {children}
      </div>
    </section>
  );
}

export function DetailSection({ label, children, defaultOpen = false }) {
  return (
    <details open={defaultOpen} className="panel-card overflow-hidden rounded-[24px]">
      <summary className="interactive-summary list-none px-5 py-4 text-sm font-medium text-stone-700 dark:text-zinc-300">
        {label}
      </summary>
      <div className="border-t border-stone-200 px-5 py-5 dark:border-zinc-800">{children}</div>
    </details>
  );
}

export function MetricTile({ label, value, tone = 'default' }) {
  const toneClass =
    tone === 'emphasis'
      ? 'bg-stone-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
      : tone === 'danger'
        ? 'bg-red-50 text-red-900'
        : 'bg-stone-100 text-stone-950 dark:bg-zinc-800 dark:text-zinc-100';

  return (
    <div className={`rounded-2xl px-4 py-4 ${toneClass}`}>
      <Text size="1" className={tone === 'emphasis' ? 'text-white/70' : 'text-current/70'}>
        {label}
      </Text>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export function StatusBanner({ status, running, error }) {
  const color = error ? 'red' : running ? 'blue' : status === '执行完成' ? 'green' : 'gray';
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-3">
        <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${color === 'red' ? 'bg-red-50 text-red-700' : color === 'blue' ? 'bg-brand-50 text-brand-700' : color === 'green' ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>
          {running ? '运行中' : error ? '错误' : '状态'}
        </Tag>
        <Text size="2" className="whitespace-pre-wrap leading-7 text-stone-700 dark:text-zinc-300">
          {error || status}
        </Text>
      </div>
    </div>
  );
}

export function RunTaskPanel({
  targetProfile,
  setTargetProfile,
  rejectionMessage,
  setRejectionMessage,
  status,
  running,
  error,
  onRun,
  onStop,
  defaultRejectionMessage,
  runLabel = '开始执行',
  runningLabel = '执行中...',
  hideStop = false,
}) {
  const showStatusBanner = Boolean((status && String(status).trim()) || (error && String(error).trim()));
  const statusToneCls = error
    ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200'
    : running
      ? 'border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200'
      : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300';

  return (
    <section className="px-0 py-1">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Text className="px-1 text-[14px] font-medium text-stone-800 dark:text-zinc-200">
              目标候选人特征
            </Text>
            <TextArea
              value={targetProfile}
              onChange={event => setTargetProfile(event.target.value)}
              placeholder="例如：前端开发工程师，5 年以上中后台经验，熟悉 Vue3 / React / TypeScript，有复杂业务系统交付经验。"
              autoSize={{ minRows: 7, maxRows: 16 }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <Text className="text-[14px] font-medium text-stone-800 dark:text-zinc-200">
                不匹配回复语
              </Text>
              <Button
                size="small"
                type="text"
                onClick={() => setRejectionMessage(defaultRejectionMessage)}
              >
                恢复默认
              </Button>
            </div>
            <TextArea
              value={rejectionMessage}
              onChange={event => setRejectionMessage(event.target.value)}
              placeholder={defaultRejectionMessage}
              autoSize={{ minRows: 4, maxRows: 10 }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-1">
          <Button
            onClick={onRun}
            disabled={running}
            type="primary"
          >
            {running ? runningLabel : runLabel}
          </Button>
          {!hideStop ? (
            <Button
              onClick={onStop}
              disabled={!running}
            >
              停止
            </Button>
          ) : null}
          <span className={`rounded-full border px-3 py-1 text-[12px] font-medium ${statusToneCls}`}>
            {running ? '创建中' : '待创建'}
          </span>
        </div>

        {showStatusBanner && (error || status) ? (
          <div className={`rounded-[22px] border px-4 py-3 ${statusToneCls}`}>
            <Text className="whitespace-pre-wrap text-[13px] leading-6">
              {error || status}
            </Text>
          </div>
        ) : null}
      </div>
    </section>
  );
}
