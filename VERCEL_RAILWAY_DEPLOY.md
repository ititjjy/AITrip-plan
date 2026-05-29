# Vercel + Railway 部署操作手册

## 前提条件
- 已安装 Node.js 和 npm
- 有 GitHub 账号

## 第一步：前端部署到 Vercel

### 1. 浏览器登录 Vercel
访问：https://vercel.com/signup
用 GitHub 账号一键登录

### 2. 导入项目
- 点击 "Add New..." → "Project"
- 选择你的 GitHub 仓库 `ititjjy/AITrip-plan`
- 点击 "Import"

### 3. 配置项目
- Framework Preset: 选择 **Vite**
- Root Directory: 保持空白
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### 4. 部署
点击 "Deploy"，等待 1-2 分钟构建完成

✅ 成功后会得到一个 Vercel 域名，类似：
```
https://aitrip-plan.vercel.app
```

## 第二步：后端部署到 Railway

### 1. 浏览器登录 Railway
访问：https://railway.app/
用 GitHub 账号一键登录

### 2. 创建项目
- 点击 "+ New Project"
- 选择 "Deploy from GitHub repo"
- 选择你的仓库 `ititjjy/AITrip-plan`

### 3. 配置服务
Railway 会自动检测这是 Node.js 项目

#### 环境变量：
在项目设置中添加：
```
NODE_ENV=production
PORT=8080
```

#### 自定义启动命令：
在服务设置中找到 "Custom Start Command"，填入：
```
npm run start
```

### 4. 部署
Railway 会自动开始部署，大约需要 2-3 分钟

✅ 成功后会得到一个 Railway 域名，类似：
```
https://aitrip-plan.up.railway.app
```

## 第三步：连接前后端

### 修改前端 API 地址
在你的本地代码中，修改所有 `/api/xxx` 请求，指向 Railway 后端：

1. 打开 `src/context/AuthContext.tsx`
2. 找到 `API_BASE` 常量（第11行）
3. 修改为：
   ```typescript
   const API_BASE = 'https://你的Railway域名/api'
   // 例如：const API_BASE = 'https://aitrip-plan.up.railway.app/api'
   ```

4. 提交更改到 GitHub：
   ```bash
   git add .
   git commit -m "配置生产环境 API 地址"
   git push
   ```

5. Vercel 会自动重新部署

## 完成！
现在全世界都可以访问你的行程规划网站了！

## 常见问题

### 1. 如何自定义域名？
- Vercel: 项目设置 → Domains
- Railway: 项目设置 → Networking → Custom Domain

### 2. 如何查看部署日志？
- Vercel: 项目页面 → Deployments → 点击具体部署
- Railway: 项目页面 → Deployments → 点击具体部署

### 3. 如何更新代码？
只需 `git push` 到 GitHub，两个平台会自动重新部署