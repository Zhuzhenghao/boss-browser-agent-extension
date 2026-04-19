# Boss AI Server

Boss Browser Agent 的本地服务端，负责：

- 提供 `http://127.0.0.1:3322` API
- 连接 Midscene Chrome Bridge
- 执行候选人巡检 Agent

## 前置要求

### 1. 安装 Node.js

要求：

- Node.js `18+`

推荐直接安装最新版 LTS。

Windows：

1. 打开 [https://nodejs.org/](https://nodejs.org/)
2. 下载 Windows LTS 安装包
3. 安装后重新打开终端

macOS：

1. 打开 [https://nodejs.org/](https://nodejs.org/)
2. 下载 macOS LTS 安装包  
   或使用 Homebrew：

```bash
brew install node
```

安装完成后确认：

```bash
node -v
npm -v
```

### 2. 安装 pnpm

```bash
npm install -g pnpm
```

确认：

```bash
pnpm -v
```

## 本地运行

在仓库根目录执行：

```bash
pnpm install
pnpm --filter @boss-ai/server dev
```

启动后服务会监听：

```text
http://127.0.0.1:3322
```

同时需要：

- Chrome 已打开 Boss 直聘页面
- Midscene Chrome 扩展已启用
- Midscene 已开启 Bridge Mode Listening
- 要操作的标签页已切到前台

## 本地 CLI 运行

构建并本地安装测试包：

```bash
pnpm --filter @boss-ai/server build
pnpm --filter @boss-ai/server pack
```

Windows PowerShell：

```powershell
npm install -g .\boss-ai-server-0.1.4.tgz
boss-ai-server
```

macOS / Linux：

```bash
npm install -g ./boss-ai-server-0.1.4.tgz
boss-ai-server
```

## 模型配置

当前只支持 `OpenAI 兼容接口`。

必须在插件设置页填写这四项：

1. `API Key`
2. `Base URL`
3. `对话模型名称`
4. `模型家族`

缺少任意一项时，Midscene 的 `aiQuery` / `aiAct` 无法正常工作，巡检任务会失败。

### 推荐填写方式

`API Key`

- 你的模型平台密钥

`Base URL`

- OpenAI 兼容接口地址
- 例子：
  - `https://api.openai.com/v1`
  - `https://cloud.infini-ai.com/maas/v1`

`对话模型名称`

- 你实际要调用的模型 ID
- 例子：
  - `gpt-4o`
  - `glm-4.6v`
  - `qwen-plus`

`模型家族`

- 这是 Midscene 做视觉理解时需要的模型家族标识
- 必须和你使用的模型能力匹配
- 例子：
  - `gpt-5`
  - `glm-v`
  - `qwen3-vl`
  - `qwen2.5-vl`
  - `gemini`

如果你不确定，就按你接入的平台实际支持的视觉模型家族来选；不要只填模型名，不填模型家族。

## 运行数据目录

运行时数据默认写入用户数据目录，不写入包目录。

Windows：

```text
%LOCALAPPDATA%\BossAI\server
```

macOS：

```text
~/Library/Application Support/BossAI/server
```

Linux：

```text
~/.local/share/boss-ai-server
```

也可以通过环境变量自定义：

```bash
BOSS_AI_DATA_DIR=/your/custom/path
```

## 常用命令

开发：

```bash
pnpm --filter @boss-ai/server dev
```

构建：

```bash
pnpm --filter @boss-ai/server build
```

本地打包：

```bash
pnpm --filter @boss-ai/server pack
```

## 常见问题

### 1. 端口 3322 被占用

Windows：

```powershell
Get-NetTCPConnection -LocalPort 3322 -State Listen
Stop-Process -Id <OwningProcess> -Force
```

macOS：

```bash
lsof -nP -iTCP:3322 -sTCP:LISTEN
kill -9 <PID>
```

### 2. CLI 安装升级时报 SQLite 被占用

先停止正在运行的 `boss-ai-server`，再重新安装：

```powershell
npm uninstall -g @boss-ai/server
npm install -g .\boss-ai-server-0.1.4.tgz
```

### 3. Midscene 调用失败

优先检查：

1. 模型配置四项是否都已填写
2. Boss 页面标签是否在前台
3. Midscene Bridge 是否已连接到当前标签页
4. 当前调用的模型是否真的支持视觉理解
