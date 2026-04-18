# Boss Browser Agent Server

AI 驱动的候选人筛选后端服务，搭配 Chrome 插件使用。

## 安装

### 方式 1: npm 全局安装（推荐）

```bash
npm install -g @boss-agent/server
```

安装后直接运行：

```bash
boss-agent-server
```

服务将在 `http://127.0.0.1:3322` 启动。

### 方式 2: Docker

```bash
docker run -p 3322:3322 \
  -e OPENAI_API_KEY=your_api_key \
  -e OPENAI_BASE_URL=https://api.openai.com/v1 \
  zhuzhenghao/boss-agent-server
```

或使用 docker-compose：

```yaml
services:
  boss-agent-server:
    image: zhuzhenghao/boss-agent-server
    ports:
      - "3322:3322"
    environment:
      - OPENAI_API_KEY=your_api_key
      - OPENAI_BASE_URL=https://api.openai.com/v1
```

### 方式 3: 源码运行

```bash
git clone <repo>
cd packages/server
npm install
npm start
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `BRIDGE_DEMO_PORT` | 服务端口 | `3322` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | - |
| `OPENAI_BASE_URL` | API 地址 | `https://api.openai.com/v1` |
| `DEBUG` | 调试日志 | - |

创建 `.env` 文件：

```env
BRIDGE_DEMO_PORT=3322
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
DEBUG=midscene:*,boss-agent:*
```

## API 文档

### 健康检查

```bash
GET /api/health
```

### 职位画像管理

```bash
# 获取所有职位画像
GET /api/job-profiles

# 获取单个职位画像
GET /api/job-profiles/:profileId

# 创建职位画像
POST /api/job-profiles

# 更新职位画像
PUT /api/job-profiles/:profileId

# 删除职位画像
DELETE /api/job-profiles/:profileId

# 导入职位画像（支持 Word/PDF/Excel）
POST /api/job-profiles/import
```

### 筛选任务

```bash
# 启动筛选任务
POST /api/screen-unread/start

# 订阅任务进度 (SSE)
GET /api/screen-unread/subscribe/:taskId

# 停止筛选任务
POST /api/screen-unread/stop

# 获取任务状态
GET /api/screen-unread/state

# 获取所有任务
GET /api/screening-tasks

# 获取单个任务
GET /api/screening-tasks/:taskId

# 删除任务
DELETE /api/screening-tasks/:taskId
```

## 项目结构

```
packages/server/
├── src/
│   ├── agents/           # AI Agent 逻辑
│   │   ├── services/    # 服务层
│   │   └── tools/       # 工具函数
│   ├── server/          # Express 服务器
│   │   ├── controllers/ # 控制器
│   │   └── ...
│   ├── shared/          # 共享工具
│   └── index.js         # 入口文件
├── .env.example
└── package.json
```

## 技术栈

- **Node.js 18+** - 运行时
- **Express** - Web 框架
- **AI SDK** - AI 集成（OpenAI 兼容）
- **Midscene** - 浏览器自动化

## 故障排除

### 端口被占用

```bash
# Windows
netstat -ano | findstr :3322

# Linux/Mac
lsof -i :3322
```

### 服务启动失败

确保：
1. Node.js 版本 >= 18
2. 环境变量配置正确
3. 端口 3322 未被占用

## 发布到 npm

```bash
cd packages/server
npm login
npm publish --access public
```

注意：需要先在 npm 上创建 `@boss-agent` scope 的组织或使用个人 scope。

## 开发

```bash
cd packages/server
npm install
npm run dev
```
