# JD 定时巡检功能

## 功能概述

新增了 JD（岗位描述）定时巡检功能，允许系统自动定期创建巡检任务，无需手动触发。

## 主要特性

### 1. 定时巡检配置

在 JD 编辑页面，可以配置：
- **开启定时巡检**：启用/禁用自动巡检
- **巡检间隔**：设置自动巡检的时间间隔（分钟），建议 30-120 分钟

### 2. 自动任务创建

- 后台调度器每 5 分钟检查一次所有启用了定时巡检的 JD
- 根据设置的间隔时间自动创建巡检任务
- 任务会自动关联到对应的 JD

### 3. 历史任务查看

在 JD 列表页面：
- 显示每个 JD 的定时巡检状态（蓝色标签）
- 可展开查看该 JD 的历史巡检任务
- 显示任务的匹配数、不匹配数、失败数等统计信息
- 点击任务可跳转到详情页查看完整结果

### 4. 匹配候选人展示

在任务详情页面：
- 顶部显示任务统计：匹配成功、不匹配、执行失败、待处理
- 候选人列表显示所有处理过的候选人
- 匹配的候选人会显示绿色"匹配"标签
- 点击候选人可查看详细的简历摘要和处理记录

## 数据库变更

### job_profiles 表新增字段：
- `auto_inspection`: 是否启用定时巡检（0/1）
- `inspection_interval`: 巡检间隔（分钟）
- `last_inspection_at`: 上次巡检时间

### screening_tasks 表新增字段：
- `job_profile_id`: 关联的 JD ID

## 技术实现

### 后端
- `agents/services/job-profile-scheduler.js`: 定时任务调度器
- `agents/services/db.js`: 数据库 schema 更新
- `agents/services/task-persistence.js`: 任务持久化支持 jobProfileId
- `agents/unread-screening-agent.js`: Agent 支持 jobProfileId 参数
- `server/task-worker.js`: Worker 传递 jobProfileId
- `server/bridge-server.js`: 集成调度器，服务启动时自动开始调度（每2小时检查一次）

### 前端
- `entrypoints/sidepanel/app/pages/JobProfileEditorPage.jsx`: JD 编辑页面新增配置项
- `entrypoints/sidepanel/app/pages/JobProfilesPage.jsx`: JD 列表页面显示历史任务
- `entrypoints/sidepanel/app/pages/TaskDetailPage.jsx`: 任务详情页面显示匹配候选人
- `entrypoints/sidepanel/app/shared-hooks.js`: API 调用支持 jobProfileId 过滤

## 使用流程

1. 进入"JD 管理"页面
2. 创建或编辑一个 JD
3. 开启"启用该岗位"和"开启定时巡检"
4. 设置巡检间隔（如 60 分钟）
5. 保存 JD
6. 系统会自动按设置的间隔创建巡检任务
7. 在 JD 列表页面可以查看历史任务
8. 点击任务查看匹配的候选人详情

## 注意事项

- 调度器每 2 小时检查一次，不是精确到秒
- 如果上一个任务还在运行，不会创建新任务
- 建议巡检间隔不要设置太短，避免频繁执行
- 匹配的候选人会在任务详情页面的候选人列表中显示绿色"匹配"标签
- 定时巡检会自动读取未读消息列表，无需手动指定候选人
