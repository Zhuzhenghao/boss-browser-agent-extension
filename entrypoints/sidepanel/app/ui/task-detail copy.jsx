import React, { memo, useMemo } from 'react';
import { Button, Tag, Typography } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  SyncOutlined,
  ClockCircleOutlined,
  UserOutlined 
} from '@ant-design/icons';
import {
  formatDateTime,
  getCandidateKey,
  getCandidateTimeline,
  getTaskStatusColor,
  getToolDisplayName,
  getTaskStatusLabel,
  resolveResultToolTimeline,
  summarizeCandidateAction,
} from './shared';

const { Text, Paragraph } = Typography;

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

/**
 * 头部统计卡片 - 采用 Gemini 风格
 */
export const SidepanelHeader = memo(({ task, running, onResumeTask, onRetryFailed }) => {
  if (!task) return null;

  const totalCount = task.unreadCandidateCount || 0;
  const processedCount = task.processedCount || 0;
  const progressPercent = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  return (
    <div className="w-full rounded-[24px] bg-white p-6 shadow-sm border border-gray-100">
      {/* 标题和状态 */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[18px] font-bold leading-snug tracking-tight text-gray-900">
            {task.targetProfile || '岗位巡检'}
          </h3>
          <p className="mt-1 text-[12px] text-gray-400 tabular-nums">
            任务 ID: {task.taskId}
          </p>
        </div>
        <Tag 
          bordered={false} 
          className={`m-0 rounded-full px-3 py-1 text-[11px] font-medium ${getTagClass(getTaskStatusColor(task.status))}`}
        >
          {getTaskStatusLabel(task.status)}
        </Tag>
      </div>

      {/* 进度条 */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-gray-500">处理进度</span>
          <span className="text-[13px] font-bold text-gray-700 tabular-nums">
            {processedCount}/{totalCount}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 统计网格 */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {[
          { 
            label: '待处理', 
            value: totalCount - processedCount, 
            icon: <ClockCircleOutlined />,
            bgColor: 'bg-blue-50',
            textColor: 'text-blue-600'
          },
          { 
            label: '已完成', 
            value: processedCount,
            icon: <CheckCircleOutlined />,
            bgColor: 'bg-emerald-50',
            textColor: 'text-emerald-600'
          },
          { 
            label: '匹配成功', 
            value: task.matchedCount,
            icon: <CheckCircleOutlined />,
            bgColor: 'bg-green-50',
            textColor: 'text-green-600'
          },
          { 
            label: '失败', 
            value: task.failedCount, 
            icon: <CloseCircleOutlined />,
            bgColor: task.failedCount > 0 ? 'bg-rose-50' : 'bg-gray-50',
            textColor: task.failedCount > 0 ? 'text-rose-600' : 'text-gray-400'
          }
        ].map((item, idx) => (
          <div 
            key={idx} 
            className={`flex flex-col gap-1 rounded-2xl p-3 ${item.bgColor}`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`text-sm ${item.textColor}`}>{item.icon}</span>
              <span className={`text-[11px] font-medium ${item.textColor}`}>{item.label}</span>
            </div>
            <span className={`text-xl font-bold tabular-nums ${item.textColor}`}>
              {item.value || 0}
            </span>
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-col gap-2">
        <Button 
          block 
          type="primary" 
          size="large"
          icon={running ? <SyncOutlined spin /> : <SyncOutlined />}
          className="h-11 rounded-xl bg-blue-600 border-none font-medium shadow-sm hover:bg-blue-700"
          onClick={() => onResumeTask?.(task.taskId)}
          disabled={running}
        >
          {running ? '任务执行中...' : '继续任务'}
        </Button>
        {(task.failedCount || 0) > 0 && (
          <Button 
            block 
            size="large"
            danger
            className="h-11 rounded-xl font-medium"
            onClick={() => onRetryFailed?.(task.taskId)}
            disabled={running}
          >
            重试失败项 ({task.failedCount})
          </Button>
        )}
      </div>
    </div>
  );
});

/**
 * 候选人列表项 - Gemini 风格
 */
export const SidepanelCandidateItem = memo(({ candidate, isActive, onSelect }) => (
  <div 
    onClick={onSelect}
    className={`
      group cursor-pointer rounded-2xl p-4 transition-all
      ${isActive 
        ? 'bg-blue-50/60 ring-1 ring-blue-200' 
        : 'bg-white hover:bg-gray-50/80 border border-gray-100'}
    `}
  >
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <UserOutlined className={`text-sm ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
        <span className="truncate text-[14px] font-bold text-gray-900">
          {candidate.name}
        </span>
      </div>
      {candidate.matched && (
        <Tag color="success" className="m-0 rounded-full text-[10px] font-medium px-2 py-0.5">
          ✓ 符合
        </Tag>
      )}
      {candidate.rejected && (
        <Tag className="m-0 rounded-full text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 border-0">
          已拒绝
        </Tag>
      )}
    </div>
    <p className={`text-[12px] leading-relaxed ${isActive ? 'text-gray-600' : 'text-gray-500'}`}>
      {summarizeCandidateAction(candidate)}
    </p>
  </div>
));

/**
 * 分析报告部分 - Gemini 风格
 */
export const AnalysisSection = memo(({ candidate }) => {
  if (!candidate) return null;
  
  return (
    <section className="w-full rounded-[24px] bg-white p-6 shadow-sm border border-gray-100">
      {/* 标题 */}
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-[15px] font-bold text-gray-900">候选人分析</h4>
        <Tag color="blue" className="rounded-full">{candidate.name}</Tag>
      </div>
      
      {/* 简历摘要 */}
      <div className="mb-4">
        <label className="mb-2 block text-[11px] font-medium text-gray-500 uppercase tracking-wide">
          简历摘要
        </label>
        <div className="rounded-2xl bg-gray-50 p-4 border border-gray-100">
          <Paragraph 
            className="!mb-0 text-[13px] leading-relaxed text-gray-700"
            ellipsis={{ rows: 6, expandable: true, symbol: '展开全部' }}
          >
            {candidate.resumeSummary || '暂无详细分析内容'}
          </Paragraph>
        </div>
      </div>

      {/* AI 判定结论 */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-4 border border-blue-100">
        <div className="mb-2 flex items-center gap-2">
          <CheckCircleOutlined className="text-blue-600" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-blue-700">
            AI 判定结论
          </span>
        </div>
        <p className="text-[13px] font-medium leading-relaxed text-gray-900">
          {summarizeCandidateAction(candidate)}
        </p>
      </div>

      {/* 拒绝原因 */}
      {candidate.rejectionReason && (
        <div className="mt-4 rounded-2xl bg-rose-50 p-4 border border-rose-100">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-rose-700">
            拒绝原因
          </label>
          <p className="text-[13px] text-rose-900">{candidate.rejectionReason}</p>
        </div>
      )}
    </section>
  );
});

/**
 * 单个执行轨迹卡片 - Gemini 风格
 */
export const CompactEventCard = memo(({ event, isLast }) => {
  const isError = event.phase === 'error';
  const isSuccess = event.phase === 'completed';
  
  return (
    <div className="relative w-full pb-6 pl-6 last:pb-2">
      {/* 连接线 */}
      {!isLast && (
        <div className="absolute bottom-0 left-[7px] top-5 w-[2px] bg-gray-100" />
      )}
      
      {/* 状态点 */}
      <div 
        className={`absolute left-0 top-2 z-10 h-4 w-4 rounded-full border-2 border-white shadow-sm transition-all ${
          isError 
            ? 'bg-rose-500' 
            : isSuccess 
            ? 'bg-emerald-500' 
            : 'bg-blue-500'
        }`} 
      />
      
      <div className="flex w-full min-w-0 flex-col">
        {/* 工具名称和时间 */}
        <div className="mb-2 flex w-full items-center justify-between">
          <span className="truncate pr-2 text-[13px] font-bold text-gray-900">
            {getToolDisplayName(event.toolName)}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-gray-400">
            {event.completedAt?.split('T')[1]?.slice(0, 8) || ''}
          </span>
        </div>
        
        {/* 执行结果 */}
        <div className={`w-full overflow-hidden rounded-2xl border p-3 transition-all ${
          isError 
            ? 'border-rose-100 bg-rose-50' 
            : 'border-gray-100 bg-gray-50'
        }`}>
          <Paragraph 
            className="!mb-0 text-[12px] leading-relaxed text-gray-700"
            ellipsis={{ rows: 3, expandable: true, symbol: '查看更多' }}
          >
            {event.resultSummary || event.errorSummary || event.summary || '执行中...'}
          </Paragraph>
        </div>
      </div>
    </div>
  );
});

/**
 * 任务详情主视图 - Gemini 风格
 */
const TaskDetailView = memo(({ result, running, selectedCandidateKey, onSelectCandidate, onResumeTask, onRetryFailed }) => {
  if (!result) {
    return (
      <div className="flex items-center justify-center p-10">
        <Text className="text-gray-400">加载中...</Text>
      </div>
    );
  }

  const task = result.task;
  const candidates = Array.isArray(task?.candidates) ? task.candidates : [];
  const selectedCandidate = candidates.find((c, i) => getCandidateKey(c, i) === selectedCandidateKey) || candidates[0] || null;
  const allTimeline = useMemo(() => resolveResultToolTimeline(result, task), [result, task]);
  const candidateTimeline = useMemo(() => getCandidateTimeline(allTimeline, selectedCandidate), [allTimeline, selectedCandidate]);

  return (
    <div className="flex max-w-full flex-col space-y-5 overflow-x-hidden bg-transparent p-1 pb-10">
      {/* 任务统计头部 */}
      <SidepanelHeader 
        task={task} 
        running={running} 
        onResumeTask={onResumeTask} 
        onRetryFailed={onRetryFailed} 
      />
      
      {/* 候选人列表 */}
      <section className="w-full">
        <div className="mb-3 flex items-center justify-between px-1">
          <h4 className="text-[13px] font-bold uppercase tracking-wide text-gray-500">
            候选人队列
          </h4>
          <Tag color="blue" className="rounded-full">{candidates.length} 人</Tag>
        </div>
        <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '320px' }}>
          {candidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-10 text-center">
              <Text className="text-[13px] text-gray-400">暂无候选人数据</Text>
            </div>
          ) : (
            candidates.map((c, i) => (
              <SidepanelCandidateItem
                key={getCandidateKey(c, i)}
                candidate={c}
                isActive={selectedCandidateKey === getCandidateKey(c, i)}
                onSelect={() => onSelectCandidate(getCandidateKey(c, i))}
              />
            ))
          )}
        </div>
      </section>

      {/* 候选人分析 */}
      {selectedCandidate && <AnalysisSection candidate={selectedCandidate} />}

      {/* 执行轨迹 */}
      <section className="w-full rounded-[24px] bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-[13px] font-bold uppercase tracking-wide text-gray-500">
            执行轨迹
          </h4>
          <Tag color="purple" className="rounded-full">{candidateTimeline.length} 步</Tag>
        </div>
        <div className="w-full">
          {candidateTimeline.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-10 text-center">
              <Text className="text-[13px] text-gray-400">暂无执行记录</Text>
            </div>
          ) : (
            candidateTimeline.map((event, idx) => (
              <CompactEventCard 
                key={idx} 
                event={event} 
                isLast={idx === candidateTimeline.length - 1} 
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
});

export default TaskDetailView;
