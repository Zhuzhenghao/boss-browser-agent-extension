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
    <div className="flex flex-col gap-4 px-3 py-4">

      <section className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-stone-900">
            消息巡检
          </h1>
          <p className="mt-1 text-[14px] text-stone-500">
            实时监控执行状态，结构化处理巡检结果。
          </p>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/tasks/new')}
        >
          创建任务
        </Button>
      </section>

      <TaskHistory
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        onSelect={handleSelect}
        onDelete={handleDelete}
        filterStatus={taskFilter}
        onFilterChange={setTaskFilter}
        showHeader={false}
        framed={false}
      />
    </div>
  );
}
