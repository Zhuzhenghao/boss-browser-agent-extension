# Boss Browser Agent - Monorepo 项目

这是一个 monorepo 项目，包含 Chrome 插件前端和后端服务两个独立的 package。

## 📦 项目结构

```
boss-browser-agent-extension/
├── packages/
│   ├── extension/              # Chrome 插件（前端）
│   │   ├── entrypoints/        # 插件入口
│   │   ├── wxt.config.js       # WXT 配置
│   │   └── package.json
│   │
│   └── server/                 # 后端服务（可打包成二进制）
│       ├── src/
│       │   ├── agents/         # AI Agent
│       │   ├── server/         # Express 服务器
│       │   ├── shared/         # 共享工具
│       │   └── index.js        # 入口
│       ├── dist/               # 构建产物
│       └── package.json
│
├── pnpm-workspace.yaml         # pnpm workspace 配置
├── package.json                # 根配置（迁移后会更新）
└── migrate-project.js          # 迁移脚本
```

## 🚀 快速开始

### 1. 执行迁移

**重要**：迁移前请先提交或备份当前代码！

```bash
# 运行迁移脚本
node migrate-project.js
```

迁移脚本会自动：
- 创建 `packages/extension` 和 `packages/server` 目录
- 移动前端文件到 `packages/extension`
- 移动后端文件到 `packages/server/src`
- 更新所有导入路径
- 创建必要的配置文件

### 2. 安装依赖

```bash
pnpm install
```

### 3. 开发

```bash
# 终端 1: 启动后端服务
pnpm dev:server

# 终端 2: 启动前端开发
pnpm dev:extension
```

### 4. 构建

```bash
# 构建前端插件
pnpm build:extension

# 构建后端二进制（所有平台）
cd packages/server
pnpm build:all

# 或单独构建某个平台
pnpm build:win      # Windows
pnpm build:mac      # macOS
pnpm build:linux    # Linux
```

## 📝 可用命令

### 根目录命令

```bash
# 开发
pnpm dev:extension          # 启动前端开发
pnpm dev:server             # 启动后端开发

# 构建
pnpm build:extension        # 构建前端插件
pnpm build:server           # 构建后端（所有平台）
```

### 后端命令（在 packages/server 目录）

```bash
pnpm dev                    # 开发模式
pnpm start                  # 生产模式
pnpm build:all              # 构建所有平台
pnpm build:win              # 构建 Windows
pnpm build:mac              # 构建 macOS
pnpm build:linux            # 构建 Linux
```

### 前端命令（在 packages/extension 目录）

```bash
pnpm dev                    # 开发模式
pnpm build                  # 构建插件
pnpm zip                    # 打包成 zip
```

## 🔧 配置

### 前端环境变量

创建 `packages/extension/.env`：

```env
VITE_API_BASE_URL=http://127.0.0.1:3322
```

### 后端环境变量

创建 `packages/server/.env`：

```env
# 服务端口
BRIDGE_DEMO_PORT=3322

# OpenAI API 配置
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# 调试日志
DEBUG=midscene:*,boss-agent:*
```

## 📦 二进制打包

后端使用 `@yao-pkg/pkg` 打包成独立的可执行文件：

```bash
cd packages/server

# 构建所有平台
pnpm build:all
```

构建产物在 `packages/server/dist/`：
- `boss-agent-server-win.exe` - Windows 可执行文件（约 50-100MB）
- `boss-agent-server-macos` - macOS 可执行文件
- `boss-agent-server-linux` - Linux 可执行文件

### 运行二进制

```bash
# Windows
./packages/server/dist/boss-agent-server-win.exe

# macOS/Linux
chmod +x ./packages/server/dist/boss-agent-server-macos
./packages/server/dist/boss-agent-server-macos
```

## 🎯 使用场景

### 开发模式

适合本地开发和调试：

```bash
# 终端 1
pnpm dev:server

# 终端 2
pnpm dev:extension
```

### 生产部署

**前端**：构建后上传到 Chrome Web Store 或直接分发

```bash
pnpm build:extension
pnpm --filter @boss-agent/extension zip
```

**后端**：使用二进制文件部署

```bash
cd packages/server
pnpm build:win  # 或其他平台
# 将 dist/ 目录中的可执行文件部署到服务器
```

## 📚 技术栈

### 前端
- React 19
- Ant Design
- WXT (Chrome Extension Framework)
- Vite + Tailwind CSS

### 后端
- Node.js 18+
- Express
- AI SDK (OpenAI Compatible)
- Midscene (Browser Automation)
- @yao-pkg/pkg (Binary Packager)

## 🔍 故障排除

### 迁移后导入路径错误

迁移脚本会自动更新导入路径，如果仍有问题：
1. 检查 `packages/server/src/index.js` 的导入路径
2. 确保相对路径正确

### 端口被占用

```bash
# Windows
Get-NetTCPConnection -LocalPort 3322 -State Listen
Stop-Process -Id <OwningProcess> -Force

# Linux/Mac
lsof -nP -iTCP:3322 -sTCP:LISTEN
kill -9 <PID>
```

### pkg 打包失败

确保：
1. 已安装依赖：`pnpm install`
2. Node.js 版本 >= 18
3. 有足够的磁盘空间（打包后文件约 50-100MB）

## 📖 更多文档

- [完整迁移指南](./MIGRATION_GUIDE.md)
- [Monorepo 设置详解](./MONOREPO_SETUP.md)
- [前端 README](./packages/extension/README.md)
- [后端 README](./packages/server/README.md)

## 📄 许可证

MIT
