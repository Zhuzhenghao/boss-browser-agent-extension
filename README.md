# Boss Browser Agent

一个基于 monorepo 的 Boss 直聘自动化项目，包含：

- `packages/extension`：Chrome 插件前端
- `packages/server`：本地服务与 AI Agent

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

## 后端 CLI

构建：

```bash
pnpm --filter @boss-ai/server build
```

本地打包测试：

```bash
pnpm --filter @boss-ai/server pack
npm install -g .\boss-ai-server-0.1.3.tgz
boss-ai-server
```

## 模型配置

当前只支持 OpenAI 兼容接口，必须配置：

- API Key
- Base URL
- 对话模型名称
- 模型家族

未配置完整时，巡检任务不会正常调用 Midscene 的 `aiQuery` / `aiAct`。

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
npm install -g .\boss-ai-server-0.1.3.tgz
```

## 子包文档

- [packages/extension/README.md](./packages/extension/README.md)
- [packages/server/README.md](./packages/server/README.md)
