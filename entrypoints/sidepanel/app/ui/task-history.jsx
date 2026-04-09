import React from 'react';
import { Button, Tag, Typography } from 'antd';
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

function getTagClass(color) {
  const map = {
    gray: 'bg-stone-100 text-stone-500',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-rose-50 text-rose-500',
    orange: 'bg-orange-50 text-orange-600',
    blue: 'bg-brand-50 text-brand-600',
  };
  return map[color] || map.gray;
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
                ? '!bg-stone-900 !text-white' 
                : '!bg-stone-100 !text-stone-500 hover:!bg-stone-200 hover:!text-stone-700'}
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
          ? 'border-brand-200 bg-brand-50/35 shadow-[0_4px_14px_rgba(66,133,244,0.08)]' 
          : 'border-stone-200/80 bg-white hover:border-stone-300 hover:bg-stone-50/70'}
      `}
    >
      <div className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-stone-900">
            {taskTitle}
          </h3>
          <p className="mt-1 line-clamp-2 text-[14px] leading-6 text-stone-500">
            {task.currentCandidateName || '暂无执行中的候选人特征描述'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${getTagClass(getTaskStatusColor(task.status))}`}>
            {getTaskStatusLabel(task.status)}
          </Tag>
          
          {onDelete && (
            <Button
              type="text"
              size="small"
              className="!text-stone-300 transition-colors hover:!text-rose-500"
              icon={<DeleteOutlined style={{ fontSize: '14px' }} />}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.taskId);
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-stone-100 pt-3.5">
        <div className="flex gap-6">
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-stone-400">创建于</span>
            <span className="text-[13px] tabular-nums text-stone-600">
              {formatListDateTime(task.startedAt)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-stone-400">更新于</span>
            <span className="text-[13px] tabular-nums text-stone-600">
              {formatListDateTime(task.updatedAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full bg-stone-100 px-2.5 py-1">
            <span className="text-[12px] font-semibold tabular-nums text-stone-600">
              {task.processedCount || 0}/{task.unreadCandidateCount || 0}
            </span>
            <span className="ml-1 text-[11px] text-stone-500">人已处理</span>
          </div>
          
          {(task.matchedCount || 0) > 0 && (
            <div className="flex items-center rounded-full bg-emerald-50 px-2.5 py-1">
              <span className="text-[12px] font-semibold tabular-nums text-emerald-600">
                {task.matchedCount}
              </span>
              <span className="ml-1 text-[11px] text-emerald-600">人匹配</span>
            </div>
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
        <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-200 bg-white py-16">
          <InboxOutlined className="mb-3 text-4xl text-stone-200" />
          <Text className="text-stone-400">尚无巡检记录</Text>
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
