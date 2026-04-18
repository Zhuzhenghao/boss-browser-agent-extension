# Boss Browser Agent Monorepo 设置指南

## 概述

本项目采用 **monorepo** 结构，包含两个独立的 package：

1. **@boss-agent/extension** - Chrome 插件前端（本地构建）
2. **@boss-agent/server** - 后端服务（可打包成二进制可执行文件）

## 项目结构

```
boss-browser-agent-extension/
├── packages/
│   ├── extension/              # Chrome 插件
│   │   ├── entrypoints/        # 插件入口点
│   │   ├── wxt.config.js       # WXT 配置
│   │   ├── package.json        # 前端依赖
│   │   └── README.md
│   │
│   └── server/                 # 后端服务
│       ├── src/
│       │   ├── agents/         # AI Agent 逻辑
│       │   ├── server/         # Express 服务器
│       │   ├── shared/         # 共享工具
│       │   └── index.js        # 入口文件
│       ├── candidate-notes/    # 候选人笔记
│       ├── screening-data/     # 筛选数据
│       ├── build.js            # 构建脚本
│       ├── package.json        # 后端依赖
│       └── README.md
│
├── pnpm-workspace.yaml         # pnpm workspace 配置
├── package.json                # 根配置
└── README.md
```

## 快速开始

### 1. 执行迁移

运行迁移脚本将现有项目拆分为 monorepo 结构：

```bash
# 使用 Node.js 脚本（推荐）
node migrate-project.js

# 或使用 Shell 脚本（Linux/Mac）
chmod +x migrate.sh
./migrate.sh

# 或使用批处理脚本（Windows）
migrate.bat
```

### 2. 安装依赖

```bash
pnpm install
```

这会安装所有 packages 的依赖。

### 3. 开发模式

```bash
# 启动后端服务（终端 1）
pnpm dev:server

# 启动前端开发（终端 2）
pnpm dev:extension
```

### 4. 构建

```bash
# 构建前端插件
pnpm build:extension

# 构建后端二进制（所有平台）
pnpm build:server

# 或单独构建某个平台
cd packages/server
pnpm build:win      # Windows
pnpm build:mac      # macOS  
pnpm build:linux    # Linux
```

## 后端二进制打包

后端使用 `@yao-pkg/pkg` 自动打包成二进制文件，无需额外安装工具。

### 打包命令

```bash
cd packages/server

# 构建所有平台
pnpm build:all

# 或单独构建
pnpm build:win      # Windows 64位
pnpm build:mac      # macOS 64位
pnpm build:linux    # Linux 64位
```

构建产物在 `packages/server/dist/` 目录：
- `boss-agent-server-win.exe` - Windows 可执行文件
- `boss-agent-server-macos` - macOS 可执行文件
- `boss-agent-server-linux` - Linux 可执行文件

### 运行二进制

```bash
# Windows
./packages/server/dist/boss-agent-server-win.exe

# macOS/Linux
./packages/server/dist/boss-agent-server-macos
./packages/server/dist/boss-agent-server-linux
```

## 环境变量配置

### 前端 (packages/extension/.env)

```env
VITE_API_BASE_URL=http://127.0.0.1:3322
```

### 后端 (packages/server/.env)

```env
# 服务端口
BRIDGE_DEMO_PORT=3322

# OpenAI API 配置
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# 调试模式
DEBUG=midscene:*,boss-agent:*
```

## 常用命令

### Workspace 命令

```bash
# 在特定 package 中运行命令
pnpm --filter @boss-agent/extension <command>
pnpm --filter @boss-agent/server <command>

# 在所有 packages 中运行命令
pnpm -r <command>

# 添加依赖到特定 package
pnpm --filter @boss-agent/extension add <package>
pnpm --filter @boss-agent/server add <package>
```

### 开发命令

```bash
# 启动前端开发
pnpm dev:extension

# 启动后端开发
pnpm dev:server

# 构建前端
pnpm build:extension

# 构建后端（所有平台）
pnpm --filter @boss-agent/server build:all

# 构建后端（单个平台）
pnpm --filter @boss-agent/server build:win
pnpm --filter @boss-agent/server build:mac
pnpm --filter @boss-agent/server build:linux
```

## 部署方案

### 方案 1: 二进制文件（推荐）

**优点**：
- 无需安装 Node.js
- 单个可执行文件，易于分发
- 启动快速
- 使用 `@yao-pkg/pkg` 自动打包

**步骤**：
1. 构建后端二进制：`cd packages/server && pnpm build:all`
2. 将 `dist/` 目录中的二进制文件和 `.env` 复制到目标机器
3. 运行二进制文件

### 方案 2: Node.js 运行

**优点**：
- 更灵活，易于调试
- 可以动态修改代码

**步骤**：
1. 将 `packages/server` 目录复制到服务器
2. 运行 `pnpm install --prod`
3. 运行 `node src/index.js`

### 方案 3: Docker

创建 `packages/server/Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装生产依赖
RUN pnpm install --prod

# 复制源代码
COPY src ./src

# 暴露端口
EXPOSE 3322

# 启动服务
CMD ["node", "src/index.js"]
```

构建和运行：

```bash
cd packages/server
docker build -t boss-agent-server .
docker run -p 3322:3322 --env-file .env boss-agent-server
```

## 发布

### 发布后端到 npm

如果需要将后端作为 npm 包发布：

```bash
cd packages/server

# 登录 npm
npm login

# 发布
npm publish --access public
```

### 分发前端插件

1. **Chrome Web Store**：
   - 构建插件：`pnpm build:extension`
   - 打包：`pnpm --filter @boss-agent/extension zip`
   - 上传到 Chrome Web Store

2. **直接分发**：
   - 将 `packages/extension/.output` 目录打包成 zip
   - 用户可以在 Chrome 中加载解压后的扩展

## 技术栈

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
- esbuild (Bundler)
- pkg (Binary Packager)

## 故障排除

### 端口被占用

```bash
# Windows
Get-NetTCPConnection -LocalPort 3322 -State Listen
Stop-Process -Id <OwningProcess> -Force

# Linux/Mac
lsof -nP -iTCP:3322 -sTCP:LISTEN
kill -9 <PID>
```

### 导入路径错误

如果迁移后出现导入路径错误，检查：
1. 相对路径是否正确
2. 是否需要更新 `packages/server/src/index.js` 中的导入

### pkg 打包失败

确保：
1. 已安装依赖：`pnpm install`
2. Node.js 版本 >= 18
3. 有足够的磁盘空间（打包后文件较大，约 50-100MB）
4. 使用的是 `@yao-pkg/pkg`（已在 devDependencies 中）

## 维护建议

1. **依赖管理**：使用 `pnpm` 管理依赖，避免重复安装
2. **版本同步**：保持两个 packages 的版本号同步
3. **共享代码**：如果需要共享代码，考虑创建 `packages/shared` 包
4. **环境变量**：使用 `.env.example` 作为模板，不要提交 `.env` 文件
5. **文档更新**：修改功能时同步更新 README

## 参考资料

- [pnpm Workspace](https://pnpm.io/workspaces)
- [WXT Documentation](https://wxt.dev/)
- [pkg Documentation](https://github.com/vercel/pkg)
- [esbuild Documentation](https://esbuild.github.io/)
