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
          <Text size="1" weight="medium" className="uppercase tracking-[0.18em] text-stone-400">
            {eyebrow}
          </Text>
        ) : null}
        <Title level={2} className="!m-0 !text-3xl !font-semibold !tracking-tight !text-stone-950">
          {title}
        </Title>
        {description ? (
          <Text size="2" className="max-w-3xl leading-7 text-stone-500">
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
    <div className="overflow-auto rounded-2xl border border-stone-200 bg-stone-950 p-3">
      <pre className="whitespace-pre-wrap break-words text-[12px] leading-6 text-stone-100">
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
      <summary className="interactive-summary list-none px-5 py-4 text-sm font-medium text-stone-700">
        {label}
      </summary>
      <div className="border-t border-stone-200 px-5 py-5">{children}</div>
    </details>
  );
}

export function MetricTile({ label, value, tone = 'default' }) {
  const toneClass =
    tone === 'emphasis'
      ? 'bg-stone-950 text-white'
      : tone === 'danger'
        ? 'bg-red-50 text-red-900'
        : 'bg-stone-100 text-stone-950';

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
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-1 text-xs font-medium ${color === 'red' ? 'bg-red-50 text-red-700' : color === 'blue' ? 'bg-blue-50 text-blue-700' : color === 'green' ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-700'}`}>
          {running ? '运行中' : error ? '错误' : '状态'}
        </Tag>
        <Text size="2" className="whitespace-pre-wrap leading-7 text-stone-700">
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
  showHeader = true,
  runLabel = '开始执行',
  runningLabel = '执行中...',
  hideStop = false,
}) {
  const showStatusBanner = Boolean((status && String(status).trim()) || (error && String(error).trim()));

  return (
    <section className="px-0 py-1">
      <div className="flex flex-col gap-5">
        {showHeader ? (
          <div className="flex flex-col gap-1">
            <Text size="1" className="tracking-[0.16em] text-stone-400">创建任务</Text>
            <Text size="6" weight="bold" className="text-stone-900">填写任务信息</Text>
            <Text size="2" className="leading-7 text-stone-500">
              填写筛选要求和默认回复语后，即可开始执行。
            </Text>
          </div>
        ) : null}

        <div className="divide-y divide-stone-200/80 overflow-hidden rounded-[22px] border border-stone-200/80 bg-white">
          <div className="p-4 md:p-5">
            <div className="flex flex-col gap-2">
              <Text size="2" weight="medium" className="text-stone-800">
                目标候选人特征
              </Text>
              <Text size="1" className="leading-6 text-stone-400">
                这段描述会作为筛选依据。
              </Text>
              <TextArea
                value={targetProfile}
                onChange={event => setTargetProfile(event.target.value)}
                placeholder="例如：AI 项目经理，5 年以上 ToB 项目交付经验，熟悉大模型/数据产品，有零售或企业数字化背景。"
                className="min-h-32 border-stone-200 bg-white"
              />
            </div>
          </div>

          <div className="p-4 md:p-5">
            <div className="flex flex-col gap-2">
              <Text size="2" weight="medium" className="text-stone-800">
                不匹配回复语
              </Text>
              <Text size="1" className="leading-6 text-stone-400">
                会作为默认回复内容使用。
              </Text>
              <TextArea
                value={rejectionMessage}
                onChange={event => setRejectionMessage(event.target.value)}
                placeholder={defaultRejectionMessage}
                className="min-h-24 rounded-[18px] border-stone-200 bg-white"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
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
          </div>
          <Tag bordered={false} className="m-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
            {running ? '创建中' : '待创建'}
          </Tag>
        </div>

        {showStatusBanner ? (
          <StatusBanner status={status} running={running} error={error} />
        ) : null}
      </div>
    </section>
  );
}
