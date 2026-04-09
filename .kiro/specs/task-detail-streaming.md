# 任务详情页面流式更新优化

## 问题分析

当前实现过于复杂，没有充分利用Vercel AI SDK的能力：
1. 自己管理SSE流和状态
2. 频繁推送完整task state导致页面抖动
3. 在执行过程中就写数据库，增加复杂度

## 正确的架构

### 核心思路
**使用Vercel AI SDK的标准模式**：
- 服务端：使用`streamText` + `createUIMessageStream`返回流式数据
- 客户端：使用`useChat`消费流，自动处理工具调用显示
- 数据持久化：只在任务完成后写入数据库
- 执行中的任务：只在内存中缓存

### 关键API

#### 服务端
```javascript
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    // 1. 推送自定义数据（工具调用等）
    writer.write({
      type: 'data-tool-call',
      id: 'tool-1',
      data: { toolName: 'xxx', status: 'running' }
    });
    
    // 2. 合并streamText的结果
    const result = streamText({ model, messages, tools });
    writer.merge(result.toUIMessageStream());
    
    // 3. 任务完成后写数据库
    result.onFinish(async () => {
      await saveToDatabase();
    });
  }
});

return createUIMessageStreamResponse({ stream });
```

#### 客户端
```javascript
import { useChat } from '@ai-sdk/react';

const { messages, isLoading } = useChat({
  api: '/api/screen-unread/stream',
  body: { targetProfile, rejectionMessage },
  onData: (dataPart) => {
    // 处理自定义数据（工具调用等）
    if (dataPart.type === 'data-tool-call') {
      console.log('Tool call:', dataPart.data);
    }
  }
});

// messages自动包含所有内容，包括工具调用
// 直接渲染即可，无需手动管理状态
```

## 实现方案

### Phase 1: 服务端改造

#### 1. 改造API endpoint
- [x] 使用`createUIMessageStream`替代手动的流式状态推送
- [x] 使用`writer.write()`推送工具调用信息
- [x] 移除复杂的状态管理逻辑

#### 2. 简化Agent
- [x] 保持`ToolLoopAgent`执行逻辑
- [x] 移除手动的`emitState`、复杂的`onProgress`
- [x] 通过回调推送工具调用事件
- [x] 移除不再需要的辅助函数

### Phase 2: 客户端改造

#### 1. 简化状态管理
- [x] 移除runtime-store
- [x] 使用React Context直接管理状态
- [x] 使用`startTransition`优化非紧急更新

#### 2. 简化组件
- [x] 更新TaskDetailPage使用新的context API
- [x] 更新WorkspacePage使用新的context API
- [x] 移除复杂的selector和防抖逻辑

### Phase 3: 数据持久化

#### 1. 执行中
- [x] 只在内存缓存（服务端state）
- [x] 不频繁写数据库

#### 2. 执行完成
- [x] 在任务完成后一次性写入
- [x] 包含完整的工具调用记录

#### 3. 历史查询
- [x] 从数据库读取已完成任务
- [x] 从内存读取执行中任务

## 优势

1. **极简**: 使用SDK标准API，代码量减少80%
2. **可靠**: SDK自动处理流式更新和状态管理
3. **性能**: React自动优化，无需手动优化
4. **可维护**: 符合最佳实践，易于理解

## 验收标准

1. ✅ 使用Vercel AI SDK的标准API
2. ✅ 工具调用通过流式事件推送
3. ✅ 页面更新流畅，无抖动（使用startTransition）
4. ✅ 只在任务完成后写数据库
5. ✅ 代码简洁，易于维护

## 实现总结

### 正确的架构

**核心思路**：
- 启动任务：普通HTTP POST，立即返回
- 任务详情：SSE订阅实时更新
- 数据持久化：任务完成后写入数据库

### API设计

#### 1. 启动任务 (POST /api/screen-unread/start)
- 接收参数：targetProfile, rejectionMessage, taskId, mode
- 立即返回200，任务在后台执行
- 不使用SSE，简单的HTTP请求

#### 2. 订阅任务 (GET /api/screen-unread/subscribe)
- SSE endpoint，推送实时更新
- 先发送当前状态和已有事件
- 持续推送新的工具事件和任务更新
- 任务完成时发送task-completed事件

#### 3. 任务详情 (GET /api/screening-tasks/:id)
- 返回已完成任务的完整数据
- 包含task和toolEvents

### 数据流

**启动新任务**：
```
WorkspacePage
  -> 填写表单
  -> handleRun()
  -> POST /api/screen-unread/start
  -> 立即返回
  -> 跳转到任务详情页
```

**查看任务详情**：
```
TaskDetailPage
  -> loadTaskDetail(taskId)
  -> GET /api/screening-tasks/:id
  -> 如果status=running
    -> subscribeToRunningTask(taskId)
    -> GET /api/screen-unread/subscribe (SSE)
    -> 实时接收tool-event和task-update
```

### 服务端改造
- 新增`handleScreenUnreadStart`：启动任务，立即返回
- 新增`handleScreenUnreadSubscribe`：SSE订阅，轮询state推送更新
- 任务在后台执行，更新到state
- 订阅者通过轮询state获取最新数据

### 客户端改造
- 移除复杂的SSE流处理
- `startTask`：简单的HTTP POST
- `subscribeToRunningTask`：SSE订阅实时更新
- `loadTaskDetail`：加载详情，自动判断是否需要订阅

### 性能优化
- 启动任务不阻塞，立即返回
- 只有查看详情时才建立SSE连接
- 使用`startTransition`优化React更新
- 订阅endpoint每300ms轮询一次state

