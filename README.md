# Boss Browser Agent Extension

Boss 直聘自动化招聘筛选工具 — Chrome 插件 + 本地服务，自动打开候选人对话、读取简历、根据岗位画像发送匹配/拒绝消息。

## 功能特性

- 自动筛选未读候选人消息，批量处理
- AI 驱动的简历解析与岗位匹配
- 支持自定义岗位画像（JD Profile），灵活配置筛选标准
- 支持定时自动巡检

## 安装使用

### 1. 安装 Chrome 插件

前往 [Releases](https://github.com/Zhuzhenghao/boss-browser-agent-extension/releases) 页面，下载最新版本的 `.zip` 文件，然后：

1. 解压 zip 文件
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择解压后的文件夹

### 2. 安装本地服务

需要 [Node.js](https://nodejs.org/) 18+ 环境。

```bash
npm install -g @boss-ai/server
boss-ai-server
```

服务默认运行在 `http://localhost:3322`。

### 3. 安装 Midscene Chrome 扩展

本工具依赖 [Midscene](https://midscenejs.com/) 进行浏览器自动化操作。安装方式：

1. 前往 [Chrome Web Store - Midscene](https://chromewebstore.google.com/detail/midscene/gbldofcpkknbggpkmbdaefngejllnief) 安装
2. 或者从 [Midscene Releases](https://github.com/nicedoc/midscene/releases) 下载 `.crx` 文件手动安装

### 4. 模型配置

在插件侧边栏的设置页中配置：

- **API Key** — OpenAI 兼容接口的密钥
- **Base URL** — API 服务地址
- **模型名称** — 对话模型名称
- **模型家族** — 模型家族标识

当前仅支持 OpenAI 兼容接口。推荐使用以下大模型平台：

| 平台 | Base URL | 说明 |
|------|----------|------|
| [无问芯穹](https://cloud.infini-ai.com/) | `https://cloud.infini-ai.com/maas/v1` | 注册后在控制台创建 API Key 即可使用 |
| [阿里云百炼](https://bailian.console.aliyun.com/) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 注册阿里云账号，开通百炼服务，创建 API Key |

## 开发指南

### 环境要求

- Node.js 18+
- pnpm
- Chrome
- Midscene Chrome 扩展

```bash
npm install -g pnpm
pnpm install
```

### 项目结构

```text
boss-browser-agent-extension/
├── packages/
│   ├── extension/   # Chrome 插件（WXT + React）
│   └── server/      # 本地服务与 AI Agent（Express）
├── package.json
└── pnpm-workspace.yaml
```

### 开发命令

```bash
pnpm dev:extension   # 启动插件热重载开发
pnpm dev:server      # 启动后端开发服务
pnpm build           # 构建所有包
```

### 打包

```bash
pnpm --filter @boss-ai/extension zip   # 打包 Chrome 插件 zip
pnpm --filter @boss-ai/server build    # 构建后端
```

## License

[MIT](./LICENSE)
