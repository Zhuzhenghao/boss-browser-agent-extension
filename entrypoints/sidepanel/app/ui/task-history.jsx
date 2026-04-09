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

// Gemini 风格的浅色状态映射
function getTagClass(color) {
  const map = {
    gray: 'bg-gray-100 text-gray-500',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-rose-50 text-rose-500',
    orange: 'bg-orange-50 text-orange-600',
    blue: 'bg-blue-50 text-blue-600',
  };
  return map[color] || map.gray;
}

function getTaskDisplayTitle(task) {
  return task.targetProfile || task.summary || '未命名巡检任务';
}

/**
 * 优化 1: FilterTabs - 更加扁平和轻盈
 * 去掉强阴影，使用淡淡的背景色区分激活态
 */
function FilterTabs({ filterStatus, onFilterChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
      {FILTER_OPTIONS.map(([value, label]) => {
        const active = filterStatus === value;
        return (
          <button
            key={value}
            onClick={() => onFilterChange(value)}
            className={`
              whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-all cursor-pointer
              ${active 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'}
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 优化 2: TaskCard - 彻底去掉边框感
 * 使用大圆角、微弱的背景色差，去掉厚重的分割线
 */
function TaskCard({ task, isSelected, onSelect, onDelete }) {
  const taskTitle = getTaskDisplayTitle(task);

  return (
    <div
      onClick={() => onSelect(task.taskId)}
      className={`
        group relative flex w-full cursor-pointer flex-col rounded-[24px] p-5 transition-all
        ${isSelected 
          ? 'bg-blue-50/60 ring-1 ring-blue-200' 
          : 'bg-white hover:bg-gray-50/80 border border-gray-100 shadow-sm'}
      `}
    >
      {/* 第一行：标题与状态 */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* 标题：支持长文本换行，最多显示两行 */}
          <h3 className="line-clamp-2 text-[18px] font-bold leading-snug tracking-tight text-gray-900">
            {taskTitle}
          </h3>
          {/* 特征描述：可能超级长，使用 line-clamp 限制，保持页面整洁 */}
          <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-gray-500">
            {task.currentCandidateName || '暂无执行中的候选人特征描述'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Tag bordered={false} className={`m-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${getTagClass(getTaskStatusColor(task.status))}`}>
            {getTaskStatusLabel(task.status)}
          </Tag>
          
          {/* 删除按钮：常驻在右上角区域，但使用低调的浅灰色，Hover变红 */}
          {onDelete && (
            <Button
              type="text"
              size="small"
              className="text-gray-300 hover:text-red-500 transition-colors"
              icon={<DeleteOutlined style={{ fontSize: '14px' }} />}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.taskId);
              }}
            />
          )}
        </div>
      </div>

      {/* 底部信息栏：去掉分割线，使用色块或间距感 */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-gray-50 pt-4">
        <div className="flex gap-8">
          <div className="flex flex-col">
            <span className="text-[11px] text-gray-400 font-medium">创建于</span>
            <span className="text-[13px] text-gray-600 tabular-nums">
              {formatListDateTime(task.startedAt)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-gray-400 font-medium">更新于</span>
            <span className="text-[13px] text-gray-600 tabular-nums">
              {formatListDateTime(task.updatedAt)}
            </span>
          </div>
        </div>

        {/* 统计数据 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-gray-100 px-2.5 py-1">
            <span className="text-[12px] font-bold text-gray-600 tabular-nums">
              {task.processedCount || 0}/{task.unreadCandidateCount || 0}
            </span>
            <span className="ml-1 text-[11px] text-gray-500">人已处理</span>
          </div>
          
          {(task.matchedCount || 0) > 0 && (
            <div className="flex items-center rounded-lg bg-emerald-50 px-2.5 py-1">
              <span className="text-[12px] font-bold text-emerald-600 tabular-nums">
                {task.matchedCount}
              </span>
              <span className="ml-1 text-[11px] text-emerald-600">人匹配</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 优化 3: TaskHistory - 整体布局
 */
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
    <div className="flex flex-col gap-6">
      <FilterTabs
        filterStatus={filterStatus}
        onFilterChange={onFilterChange}
      />

      {!tasks.length ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white/50 rounded-[32px] border border-dashed border-gray-200">
          <InboxOutlined className="text-4xl text-gray-200 mb-3" />
          <Text className="text-gray-400">尚无巡检记录</Text>
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

  // 这里的 framed 逻辑遵循用户意愿，如果不想要容器质感，直接返回 content
  if (!framed) return <div className="px-1">{content}</div>;

  return (
    <div className="rounded-[32px] bg-transparent p-2">
      {content}
    </div>
  );
}