# Boss Browser Agent

一个基于 monorepo 的 Boss 直聘自动化项目，包含：

- `packages/extension`：Chrome 插件前端
- `packages/server`：本地服务与 AI Agent

## 快速开始

先准备：

- Node.js `18+`
- `pnpm`
- Chrome
- Midscene Chrome 扩展

Windows / macOS 都建议先安装最新版 Node.js LTS：

- 官网：<https://nodejs.org/>

安装 `pnpm`：

```bash
npm install -g pnpm
```

## 项目结构

```text
boss-browser-agent-extension/
├── packages/
│   ├── extension/
│   └── server/
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## 开发

先安装依赖：

```bash
pnpm install
```

启动后端：

```bash
pnpm --filter @boss-ai/server dev
```

启动插件开发：

```bash
pnpm --filter @boss-ai/extension dev
```

打包 Chrome 插件 zip：

```bash
pnpm --filter @boss-ai/extension zip
```

输出位置：

- `packages/extension/.output/*.zip`
- `packages/extension/.output/chrome-mv3`

其中：

- `.zip` 适合分发和归档
- `chrome-mv3` 适合在 Chrome 的“加载已解压的扩展程序”里直接安装

## 模型配置

当前只支持 OpenAI 兼容接口。

在插件设置页里必须配置：

- API Key
- Base URL
- 对话模型名称
- 模型家族

否则巡检任务里的 Midscene `aiQuery` / `aiAct` 会失败。

更具体的填写说明见：

- [packages/server/README.md](./packages/server/README.md)

## 后端 CLI

构建：

```bash
pnpm --filter @boss-ai/server build
```

本地打包测试：

```bash
pnpm --filter @boss-ai/server pack
npm install -g .\boss-ai-server-0.1.4.tgz
boss-ai-server
```

## GitHub Actions

仓库通过 tag 触发两个工作流：

- **Release**：构建 Chrome 插件 zip 并创建 GitHub Release
- **Publish**：构建并发布到 npm

### 下载 Chrome 插件

前往 [Releases](https://github.com/Zhuzhenghao/boss-browser-agent-extension/releases) 页面，下载最新版本的 `.zip` 文件，然后：

1. 解压 zip 文件
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择解压后的文件夹

## 运行数据

运行时数据默认不写入包目录，而是写入用户数据目录：

- Windows: `%LOCALAPPDATA%\BossAI\server`
- macOS: `~/Library/Application Support/BossAI/server`
- Linux: `~/.local/share/boss-ai-server`

也可以通过 `BOSS_AI_DATA_DIR` 自定义。

## 常用排障

端口占用：

```powershell
Get-NetTCPConnection -LocalPort 3322 -State Listen
Stop-Process -Id <OwningProcess> -Force
```

重新安装本地 CLI 包：

```powershell
npm uninstall -g @boss-ai/server
npm install -g .\boss-ai-server-0.1.4.tgz
```

## 子包文档

- [packages/extension/README.md](./packages/extension/README.md)
- [packages/server/README.md](./packages/server/README.md)
