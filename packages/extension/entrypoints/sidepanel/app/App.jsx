import React from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConfigProvider, App, Tooltip, theme as antdTheme } from 'antd';
import {
  LayoutOutlined,
  FileSearchOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ProfileOutlined,
  SettingOutlined,
} from '@ant-design/icons';

// 导入页面组件
import HomePage from './pages/HomePage';
import WorkspacePage from './pages/WorkspacePage';
import TasksPage from './pages/TasksPage';
import TaskDetailPage from './pages/TaskDetailPage';
import RecommendationsPage from './pages/RecommendationsPage';
import ResumeAnalysisPage from './pages/ResumeAnalysisPage';
import JobProfilesPage from './pages/JobProfilesPage';
import JobProfileEditorPage from './pages/JobProfileEditorPage';
import ModelConfigPage from './pages/ModelConfigPage';

function useSystemThemeMode() {
  const getSystemMode = React.useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  const [mode, setMode] = React.useState(getSystemMode);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => {
      setMode(event.matches ? 'dark' : 'light');
    };

    setMode(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [getSystemMode]);

  return mode;
}

function useApplyThemeClass(mode) {
  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    root.dataset.theme = mode;
  }, [mode]);
}

/**
 * 极简导航：针对侧边栏宽度优化，使用图标+小字
 */
function Navbar() {
  const location = useLocation();
  
  const menuItems = [
    { name: '任务', path: '/tasks', icon: <LayoutOutlined /> },
    { name: 'JD', path: '/job-profiles', icon: <ProfileOutlined /> },
    { name: '分析', path: '/resume-analysis', icon: <FileSearchOutlined /> },
    { name: '推荐', path: '/recommendations', icon: <BulbOutlined /> },
    { name: '设置', path: '/model-config', icon: <SettingOutlined /> },
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
                  ? 'nav-item-active shadow-sm' 
                  : 'nav-item text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}
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
    <main className="app-shell h-screen flex flex-col overflow-x-hidden">
      
      {/* 极简 Header：固定在顶部 */}
      <header className="app-header sticky top-0 z-50 w-full px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="whitespace-nowrap text-sm font-bold tracking-[0.01em]">
              <span className="app-wordmark">Boss </span>
              <span className="app-wordmark-accent">Agent</span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <Navbar />
          </div>
        </div>
      </header>

      {/* 页面内容区：去除 md:p-10，改为极小边距 */}
      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<WorkspacePage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/job-profiles" element={<JobProfilesPage />} />
          <Route path="/job-profiles/new" element={<JobProfileEditorPage />} />
          <Route path="/job-profiles/:profileId" element={<JobProfileEditorPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/resume-analysis" element={<ResumeAnalysisPage />} />
          <Route path="/model-config" element={<ModelConfigPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* 底部状态条：更适合侧边栏 */}
      <footer className="app-footer px-3 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CheckCircleOutlined className="text-emerald-500 text-[10px]" />
          <span className="text-[10px] font-bold text-[var(--app-text-muted)] uppercase tracking-tighter">System Ready</span>
        </div>
        <span className="text-[9px] text-[var(--app-text-subtle)] tabular-nums">v2.4.0-Stable</span>
      </footer>
    </main>
  );
}

export default function AppContainer() {
  const mode = useSystemThemeMode();
  const isDark = mode === 'dark';
  useApplyThemeClass(mode);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#c0923f',
          colorBgLayout: isDark ? '#0f1115' : '#fafafa',
          colorBgBase: isDark ? '#181b20' : '#ffffff',
          colorTextBase: isDark ? '#f5f5f5' : '#18181b',
          colorBorder: isDark ? '#2b2f36' : '#e4e4e7',
          colorFillSecondary: isDark ? '#20242b' : '#f4f4f5',
          colorTextSecondary: isDark ? '#a1a1aa' : '#52525b',
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
