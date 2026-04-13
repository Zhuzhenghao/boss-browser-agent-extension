import React from 'react';
import { Button, Typography } from 'antd';
import { DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import {
  formatListDateTime,
  getTaskStatusColor,
  getTaskStatusLabel,
} from './shared';

const { Text } = Typography;

const FILTER_OPTIONS = [
  ['all', '全部'],
  ['running', '运行中'],
  ['completed', '已完成'],
  ['failed', '失败'],
  ['stopped', '已停止'],
];

function StatusBadge({ tone = 'neutral', children }) {
  const toneClass = {
    neutral: 'border-stone-200/80 bg-stone-50 text-stone-600 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-300',
    success: 'border-emerald-500/15 bg-emerald-500/8 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/12 dark:text-emerald-300',
    danger: 'border-rose-500/15 bg-rose-500/8 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/12 dark:text-rose-300',
    warning: 'border-brand-500/18 bg-brand-500/10 text-brand-700 dark:border-brand-500/22 dark:bg-brand-500/14 dark:text-brand-300',
    active: 'border-brand-500/22 bg-brand-500/12 text-brand-700 dark:border-brand-500/26 dark:bg-brand-500/16 dark:text-brand-300',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ${toneClass[tone] || toneClass.neutral}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      <span>{children}</span>
    </span>
  );
}

function MetaPill({ tone = 'neutral', children }) {
  const toneClass = {
    neutral: 'bg-stone-100 text-stone-600 dark:bg-zinc-800 dark:text-zinc-300',
    success: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/14 dark:text-emerald-300',
    warning: 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/14 dark:text-brand-300',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {children}
    </span>
  );
}

function getStatusTone(color) {
  switch (color) {
    case 'green':
      return 'success';
    case 'red':
      return 'danger';
    case 'orange':
    case 'blue':
      return 'warning';
    default:
      return 'neutral';
  }
}

function getTaskDisplayTitle(task) {
  return task.targetProfile || task.summary || '未命名巡检任务';
}

function FilterTabs({ filterStatus, onFilterChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {FILTER_OPTIONS.map(([value, label]) => {
        const active = filterStatus === value;
        return (
          <Button
            key={value}
            onClick={() => onFilterChange(value)}
            className={`
              whitespace-nowrap !rounded-full !border-0 !px-3.5 !py-1 !text-[13px] !font-medium !shadow-none transition-all
              ${active 
                ? '!bg-stone-900 !text-white dark:!bg-zinc-100 dark:!text-zinc-950' 
                : '!bg-stone-100 !text-stone-500 hover:!bg-stone-200 hover:!text-stone-700 dark:!bg-zinc-800 dark:!text-zinc-300 dark:hover:!bg-zinc-700 dark:hover:!text-zinc-100'}
            `}
            type="default"
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

function TaskCard({ task, isSelected, onSelect, onDelete }) {
  const taskTitle = getTaskDisplayTitle(task);

  return (
    <div
      onClick={() => onSelect(task.taskId)}
      className={`
        group relative flex w-full cursor-pointer flex-col rounded-[22px] border transition-all
        ${isSelected 
          ? 'border-brand-200 bg-brand-50/55 shadow-[0_10px_30px_rgba(166,111,30,0.10)] dark:border-brand-700 dark:bg-brand-950/20' 
          : 'border-stone-200/80 bg-white hover:border-stone-300 hover:bg-stone-50/70 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80'}
      `}
    >
      <div className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-stone-900 dark:text-zinc-100">
            {taskTitle}
          </h3>
          <p className="mt-1 line-clamp-2 text-[14px] leading-6 text-stone-500 dark:text-zinc-400">
            {task.currentCandidateName || '暂无执行中的候选人特征描述'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge tone={getStatusTone(getTaskStatusColor(task.status))}>
            {getTaskStatusLabel(task.status)}
          </StatusBadge>
          
          {onDelete && (
            <Button
              type="text"
              size="small"
              className="!text-stone-300 transition-colors hover:!text-rose-500 dark:!text-zinc-600 dark:hover:!text-rose-400"
              icon={<DeleteOutlined style={{ fontSize: '14px' }} />}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.taskId);
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-stone-100 pt-3.5 dark:border-zinc-800">
        <div className="flex gap-6">
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-stone-400 dark:text-zinc-500">创建于</span>
            <span className="text-[13px] tabular-nums text-stone-600 dark:text-zinc-300">
              {formatListDateTime(task.startedAt)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-stone-400 dark:text-zinc-500">更新于</span>
            <span className="text-[13px] tabular-nums text-stone-600 dark:text-zinc-300">
              {formatListDateTime(task.updatedAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <MetaPill>
            <span className="tabular-nums font-semibold">
              {task.processedCount || 0}/{task.unreadCandidateCount || 0}
            </span>
            <span className="ml-1 opacity-80">人已处理</span>
          </MetaPill>
          
          {(task.matchedCount || 0) > 0 && (
            <MetaPill tone="success">
              <span className="tabular-nums font-semibold">{task.matchedCount}</span>
              <span className="ml-1 opacity-90">人匹配</span>
            </MetaPill>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

export function TaskHistory({
  tasks,
  selectedTaskId,
  onSelect,
  onDelete,
  filterStatus,
  onFilterChange,
  framed = false,
}) {
  const content = (
    <div className="flex flex-col gap-4">
      <FilterTabs
        filterStatus={filterStatus}
        onFilterChange={onFilterChange}
      />

      {!tasks.length ? (
        <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-900">
          <InboxOutlined className="mb-3 text-4xl text-stone-200 dark:text-zinc-700" />
          <Text className="text-stone-400 dark:text-zinc-500">尚无巡检记录</Text>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {tasks.map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              isSelected={selectedTaskId === task.taskId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (!framed) return <div className="px-1">{content}</div>;

  return (
    <div className="rounded-[32px] bg-transparent p-2">
      {content}
    </div>
  );
}
