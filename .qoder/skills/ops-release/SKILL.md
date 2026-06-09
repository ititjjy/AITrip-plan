---
name: ops-release
version: 1.0.0
description: Release a new version of AITrip project locally. Use when user says release, version bump, tag, or publish a new version.
description_zh: 在本地发布 AITrip 项目新版本。当用户提到发布版本、release、打tag、version bump 时使用。
---

# 版本发布操作 (ops-release)

## 前置条件

1. 本地工作区已提交所有改动（或准备好提交）
2. `npm run build` 编译通过
3. 网络连接正常（需要推送到 GitHub 和阿里代码库）

## 发布命令

```bash
# 补丁版本（默认）：v0.3.2 → v0.3.3
bash scripts/release.sh

# 次版本：v0.3.2 → v0.4.0
bash scripts/release.sh minor

# 主版本：v0.3.2 → v1.0.0
bash scripts/release.sh major

# 指定版本号
bash scripts/release.sh 1.2.3
```

## 发布流程

release.sh 自动执行：

1. **检查工作区**：是否有未提交改动，提示用户提交
2. **计算版本号**：根据 bump 类型计算新版本
3. **用户确认**：显示当前版本和目标版本，等待确认
4. **更新 package.json**：写入新版本号
5. **提交数据文件**：如果 `data-sync/cache-export.json` 存在，一并提交
6. **Git commit**：`chore: 发布 v{version}`
7. **创建 Tag**：`git tag -a "v{version}" -m "Release v{version}"`
8. **推送 GitHub**：`git push origin main --tags`
9. **推送阿里代码库**：`git push alibaba main --tags`
10. **输出部署命令**：显示服务器部署指令

## 发布后动作

发布成功后，告知用户：

```
版本 v0.3.3 发布完成！

在阿里云服务器上执行以下命令完成部署：
  cd /opt/aitrip && bash scripts/server-pull.sh
```

然后使用 ops-deploy skill 执行服务器部署。

## 推送失败处理

### GitHub 推送失败

```bash
# 手动重试
git push origin main --tags

# 检查 SSH 密钥或网络
ssh -T git@github.com
```

### 阿里代码库推送失败

```bash
# 手动重试
git push alibaba main --tags

# 如果阿里代码库暂时不可达，可稍后手动推送
# GitHub 已成功推送，不影响代码安全
```

## 版本号规范

遵循 SemVer 语义化版本 `MAJOR.MINOR.PATCH`：

- **PATCH**：Bug 修复、小优化、文案修改
- **MINOR**：新功能、新页面、API 变更
- **MAJOR**：架构重构、不兼容变更

## 详细参考

- 脚本详解：`.qoder/knowledge/ops/deployment.md`
- 基础设施架构：`.qoder/knowledge/ops/infrastructure.md`
