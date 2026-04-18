# 🎯 开始拆分项目

## 当前状态

你的项目目前是一个混合的单体应用，包含前端 Chrome 插件和后端服务。

## 目标

将项目拆分为 **monorepo** 结构：
- `packages/extension` - Chrome 插件（本地构建）
- `packages/server` - 后端服务（可打包成二进制）

## 🚀 执行步骤

### 1. 备份代码（重要！）

```bash
git add .
git commit -m "backup before monorepo migration"
```

或者直接复制整个项目文件夹作为备份。

### 2. 运行迁移脚本

```bash
node migrate-project.js
```

这个脚本会：
- ✅ 创建 `packages/extension` 和 `packages/server` 目录
- ✅ 移动前端文件（entrypoints, wxt.config.js）
- ✅ 移动后端文件（server, agents, shared）
- ✅ 自动更新所有导入路径
- ✅ 创建配置文件和 README

### 3. 安装依赖

```bash
pnpm install
```

### 4. 测试运行

```bash
# 终端 1: 启动后端
pnpm dev:server

# 终端 2: 启动前端
pnpm dev:extension
```

### 5. 构建二进制

```bash
cd packages/server
pnpm build:all
```

构建产物在 `packages/server/dist/`：
- `boss-agent-server-win.exe` - Windows
- `boss-agent-server-macos` - macOS
- `boss-agent-server-linux` - Linux

## 📁 迁移后的结构

```
boss-browser-agent-extension/
├── packages/
│   ├── extension/          # Chrome 插件
│   │   ├── entrypoints/
│   │   ├── wxt.config.js
│   │   └── package.json
│   │
│   └── server/             # 后端服务
│       ├── src/
│       │   ├── agents/
│       │   ├── server/
│       │   ├── shared/
│       │   └── index.js
│       ├── dist/           # 二进制构建产物
│       └── package.json
│
├── pnpm-workspace.yaml
└── package.json
```

## 🎉 完成后

1. **开发**：使用 `pnpm dev:server` 和 `pnpm dev:extension`
2. **构建前端**：`pnpm build:extension`
3. **构建后端二进制**：`cd packages/server && pnpm build:all`
4. **分发**：
   - 前端：Chrome Web Store 或 zip 文件
   - 后端：独立的可执行文件（无需 Node.js）

## 📚 详细文档

- [README_MONOREPO.md](./README_MONOREPO.md) - 完整使用指南
- [MONOREPO_SETUP.md](./MONOREPO_SETUP.md) - 详细配置说明
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - 迁移详解

## ❓ 遇到问题？

1. 检查 Node.js 版本 >= 18
2. 确保使用 pnpm（`npm install -g pnpm`）
3. 查看详细文档
4. 检查迁移脚本的输出日志

## 🔄 回滚

如果需要回滚到迁移前的状态：

```bash
git reset --hard HEAD~1
```

或者使用你的备份文件夹。

---

**准备好了吗？运行 `node migrate-project.js` 开始迁移！**
