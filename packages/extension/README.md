# Boss Browser Agent Extension

Chrome 插件前端，用于在浏览器中进行候选人筛选。

## 开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
pnpm zip
```

## 配置

复制 `.env.example` 为 `.env` 并配置后端服务地址：

```env
VITE_API_BASE_URL=http://127.0.0.1:3322
```
