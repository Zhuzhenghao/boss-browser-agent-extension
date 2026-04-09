import React from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConfigProvider, App, Tooltip } from 'antd';
import { 
  LayoutOutlined, 
  FileSearchOutlined, 
  BulbOutlined, 
  CheckCircleOutlined 
} from '@ant-design/icons';

// 导入页面组件
import HomePage from './pages/HomePage';
import WorkspacePage from './pages/WorkspacePage';
import TasksPage from './pages/TasksPage';
import TaskDetailPage from './pages/TaskDetailPage';
import RecommendationsPage from './pages/RecommendationsPage';
import ResumeAnalysisPage from './pages/ResumeAnalysisPage';

/**
 * 极简导航：针对侧边栏宽度优化，使用图标+小字
 */
function Navbar() {
  const location = useLocation();
  
  const menuItems = [
    { name: '任务', path: '/tasks', icon: <LayoutOutlined /> },
    { name: '分析', path: '/resume-analysis', icon: <FileSearchOutlined /> },
    { name: '推荐', path: '/recommendations', icon: <BulbOutlined /> },
  ];

  return (
    <nav className="flex items-center gap-1">
      {menuItems.map((item) => {
        const isActive = location.pathname.startsWith(item.path);
        return (
          <Tooltip title={item.name} key={item.path} placement="bottom">
            <Link
              to={item.path}
              className={`
                flex items-center justify-center p-2 transition-all rounded-xl
                ${isActive 
                  ? 'bg-zinc-900 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}
              `}
            >
              <span className="text-lg leading-none">{item.icon}</span>
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/**
 * 侧边栏专属布局
 */
function AppLayout() {
  return (
    // 移除 min-w 限制，使用 h-screen 确保滚动条在侧边栏内生效
    <main className="h-screen flex flex-col bg-zinc-50 overflow-x-hidden">
      
      {/* 极简 Header：固定在顶部 */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-zinc-100 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-400 flex items-center justify-center shadow-sm">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            </div>
            <span className="text-sm font-bold tracking-tight text-zinc-900 whitespace-nowrap">
              Agent For BOSS
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <Navbar />
            <div className="h-6 w-[1px] bg-zinc-100 mx-1" />
            <div className="h-7 w-7 rounded-full bg-zinc-200 border border-white shadow-inner shrink-0" />
          </div>
        </div>
      </header>

      {/* 页面内容区：去除 md:p-10，改为极小边距 */}
      <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<WorkspacePage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/resume-analysis" element={<ResumeAnalysisPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* 底部状态条：更适合侧边栏 */}
      <footer className="px-3 py-1.5 bg-white border-t border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CheckCircleOutlined className="text-emerald-500 text-[10px]" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">System Ready</span>
        </div>
        <span className="text-[9px] text-zinc-300 tabular-nums">v2.4.0-Stable</span>
      </footer>
    </main>
  );
}

export default function AppContainer() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1a73e8', // 改为深色系，更具专业工具感
          colorBgLayout: '#fafafa',
        },
        components: {
          Card: {
            borderRadiusLG: 16,
            paddingLG: 16, // 强制减小卡片内边距
          },
          Tag: {
            borderRadiusSM: 4,
            fontSize: 10,
          }
        }
      }}
    >
      <App className="h-full">
        <HashRouter>
          <AppLayout />
        </HashRouter>
      </App>
    </ConfigProvider>
  );
}