# Boss Browser Agent Extension

当前先提供一个最小可跑的 Midscene Chrome Bridge Demo。

## Demo 能力

- 一个本地页面
- 一个输入框
- 输入自然语言指令
- 后端通过 `AgentOverChromeBridge` 连接当前激活的 Chrome 标签页
- 调用 `agent.aiAct(...)` 执行浏览器操作

## 参考文档

- Midscene Chrome Bridge Agent API: https://midscenejs.com/zh/web-api-reference.html#chrome-bridge-agent

文档里明确说明了两点：

1. 需要先调用 `connectCurrentTab()` 或 `connectNewTabWithUrl()` 再执行其他操作
2. `AgentOverChromeBridge` 适合直接桥接到桌面 Chrome 当前标签页

## 启动方式

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

至少填写：

```bash
MIDSCENE_MODEL_API_KEY=your-api-key
MIDSCENE_MODEL_NAME=doubao-seed-2.0-vision
MIDSCENE_MODEL_BASE_URL=https://your-openai-compatible-endpoint/v1
MIDSCENE_MODEL_FAMILY=doubao-vision
```

3. 启动 demo

```bash
npm run bridge-demo
```

4. 打开浏览器访问：

```text
http://127.0.0.1:3322
```

## 使用前提

- Chrome 已安装 Midscene 扩展
- Midscene 扩展已经进入 Bridge Mode Listening
- 你要操作的 Chrome 标签页已经切到前台

## 代码位置

- [demo/bridge-server.js](/Users/admin/projects/boss-browser-agent-extension/demo/bridge-server.js)
- [demo/index.html](/Users/admin/projects/boss-browser-agent-extension/demo/index.html)
