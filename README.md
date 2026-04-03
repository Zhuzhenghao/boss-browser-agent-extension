# Boss Browser Agent Extension

一个基于 Chrome 扩展 + Midscene Bridge + 本地 Node Agent 的 Boss 直聘自动化控制台。

当前插件侧已经改成 React sidepanel，后面可以继续加菜单、路由和更多 agent 入口。

## 当前能力

- React Side Panel 控制台
- Midscene Bridge 连接你当前桌面 Chrome 标签页
- 未读消息筛选 Agent
- 在线简历逐屏复制采集
- 候选人匹配后自动 `求简历`、`置顶`
- 不匹配自动发送常用语
- 每处理完一个候选人，立即落一份 markdown 记录

## 目录说明

- [entrypoints/sidepanel/main.jsx](/Users/admin/projects/boss-browser-agent-extension/entrypoints/sidepanel/main.jsx)
  React sidepanel 入口，包含菜单和路由
- [entrypoints/sidepanel/style.css](/Users/admin/projects/boss-browser-agent-extension/entrypoints/sidepanel/style.css)
  Sidepanel 样式
- [server/bridge-server.js](/Users/admin/projects/boss-browser-agent-extension/server/bridge-server.js)
  本地 bridge 服务
- [agents/unread-screening-agent.js](/Users/admin/projects/boss-browser-agent-extension/agents/unread-screening-agent.js)
  未读消息筛选 Agent 主流程
- [candidate-notes](/Users/admin/projects/boss-browser-agent-extension/candidate-notes)
  候选人 markdown 记录输出目录

## 环境准备

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

至少填写这些：

```bash
MIDSCENE_MODEL_API_KEY=your-api-key
MIDSCENE_MODEL_NAME=doubao-seed-2.0-vision
MIDSCENE_MODEL_BASE_URL=https://your-openai-compatible-endpoint/v1
MIDSCENE_MODEL_FAMILY=doubao-vision
BRIDGE_DEMO_PORT=3322
```

## 本地启动

启动本地 bridge 服务：

```bash
npm run bridge-demo
```

服务默认监听：

```text
http://127.0.0.1:3322
```

常用接口：

- `GET /api/health`
- `GET /api/bridge-status`
- `POST /api/screen-unread`
- `GET /api/screen-unread/state`

## 构建插件

生产构建：

```bash
npm run build
```

构建产物目录：

```text
.output/chrome-mv3
```

如果你要本地开发，也可以直接跑：

```bash
npm run dev
```

## 加载插件

1. 打开 Chrome 扩展管理页：`chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择目录：

```text
/Users/admin/projects/boss-browser-agent-extension/.output/chrome-mv3
```

5. 点击扩展图标，打开 side panel

## 使用前提

执行前需要同时满足：

- Chrome 已安装 Midscene 扩展
- Midscene 扩展已进入 `Bridge Mode Listening`
- Boss 页面已经打开
- 目标 Boss 页面已经切到前台
- Midscene 扩展已经连接到当前 tab

推荐顺序：

1. 先打开 Boss 页面
2. 确认 Midscene 扩展处于 `Bridge Mode Listening`
3. 在 Midscene 扩展里连接当前 tab
4. 再打开本插件 sidepanel 点击执行

## 当前运行方式

1. 启动本地 bridge 服务

```bash
npm run bridge-demo
```

2. 构建并重新加载插件

```bash
npm run build
```

然后在 Chrome 里重新加载 `.output/chrome-mv3`

3. 打开 Boss 沟通页并保持前台

```text
https://www.zhipin.com/web/chat/index
```

4. 打开插件 sidepanel

5. 在 `未读筛选` 页面输入：

- 目标候选人特征
- 不匹配回复语

6. 点击：

```text
执行未读消息筛选 Agent
```

## 处理结果

每处理完一个候选人，会立即写一份 markdown 到：

```text
candidate-notes/YYYY-MM-DD/姓名.md
```

内容包括：

- 文件名
- 结论
- 是否符合
- 原因
- 不符合原因
- 简历摘要
- 关键简历信息 JSON

## 常见问题

### 1. 点击执行时报错：`no tab is connected`

这不是“没有 Chrome 标签页”，而是：

- Midscene 已连接到扩展
- 但当前没有绑定到一个可操作的网页 tab

处理方式：

1. 把 Boss 页面切到前台
2. 确认 Midscene 扩展还在 `Bridge Mode Listening`
3. 在 Midscene 扩展里重新连接当前 tab
4. 再点执行

### 2. `3322` 端口被占用

先查占用：

```bash
lsof -nP -iTCP:3322 -sTCP:LISTEN
```

结束旧进程后再启动，或者换端口：

```bash
BRIDGE_DEMO_PORT=3333 npm run bridge-demo
```

### 3. 修改了代码但插件没生效

需要重新构建并重新加载扩展：

```bash
npm run build
```

然后在 Chrome 扩展页点“重新加载”。

## 参考文档

- Midscene Bridge Mode: https://midscenejs.com/zh/bridge-mode.html
- Midscene Chrome Bridge Agent API: https://midscenejs.com/zh/web-api-reference.html#chrome-bridge-agent
- Vercel AI SDK: https://ai-sdk.dev/
