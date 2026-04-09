import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { TaskHistory } from '../ui';
import { deleteTask as deleteTaskAPI, fetchTaskList } from '../shared-hooks';

export default function TasksPage() {
  const navigate = useNavigate();
  const { modal, message } = App.useApp();

  const [tasks, setTasks] = useState([]);
  const [taskFilter, setTaskFilter] = useState('all');
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTasks() {
      try {
        const taskList = await fetchTaskList(taskFilter);
        if (!cancelled) setTasks(taskList);
      } catch (error) {
        console.error('[Tasks] Failed to load tasks:', error);
      }
    }
    void loadTasks();
    return () => { cancelled = true; };
  }, [taskFilter]);

  const handleSelect = useCallback((taskId) => {
    setSelectedTaskId(taskId);
    navigate(`/tasks/${encodeURIComponent(taskId)}`);
  }, [navigate]);

  const handleDelete = useCallback(async (taskId) => {
    modal.confirm({
      title: '删除任务',
      content: '确认删除这个任务吗？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true, shape: 'round' },
      cancelButtonProps: { shape: 'round', type: 'text' },
      centered: true,
      onOk: async () => {
        try {
          await deleteTaskAPI(taskId);
          setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
          message.success('已删除');
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  }, [modal, message]);

  return (
    <div className="flex flex-col gap-8">

      {/* 1. Header: 纯文字排版，无背景装饰 */}
      <section className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            消息巡检
          </h1>
          <p className="mt-1 text-[14px] text-gray-500">
            实时监控执行状态，结构化处理巡检结果。
          </p>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/tasks/new')}
          shape="round"
        >
          创建任务
        </Button>
      </section>

      {/* 2. Content: 彻底打碎容器，直接展示列表 */}
      <TaskHistory
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        onSelect={handleSelect}
        onDelete={handleDelete}
        filterStatus={taskFilter}
        onFilterChange={setTaskFilter}
        showHeader={false}
        framed={false} // 确保这个属性关闭了内部边框
      />

      {/* 3. 背景装饰：仅保留极淡的氛围，不要抢戏 */}
      <div className="pointer-events-none fixed -bottom-10 -left-10 h-64 w-64 rounded-full bg-blue-50/40 blur-[80px]" />
    </div>
  );
}