# 宠伴记 CI 门禁

本项目提供 GitHub Actions 工作流：

```text
.github/workflows/release-gate.yml
```

## 触发方式

- Pull Request
- 推送到 `main` 或 `master`
- 手动 `workflow_dispatch`

## 执行内容

工作流在 `windows-latest` 上运行，使用 Node.js 24，并执行：

```powershell
npm run ci:check
```

`ci:check` 当前等价于 `release:check`，会覆盖：

- 构建
- 单元测试
- 浏览器 E2E
- 远端浏览器 E2E
- 生产烟测自测
- 运维检查自测
- 部署检查
- 后端合同烟测
- 备份恢复演练
- 容器基线检查
- 部署编排检查
- 发布计划检查
- 生产就绪检查
- 密钥扫描
- 可访问性与离线可用检查

## 设计约束

- CI 不读取真实生产密钥。
- CI 不部署、不发布、不推送镜像。
- `permissions` 仅保留 `contents: read`。
- 真实生产发布仍需人工 Go/No-Go、生产 `smoke:production`、生产 `ops:check`、真机验收和外部配置证据。

## 为什么使用 Windows runner

当前浏览器 E2E 脚本直接使用本机 Chrome/Edge 可执行文件路径，项目开发环境也是 Windows。使用 `windows-latest` 可以让 CI 和本地验证路径保持一致，避免 Linux runner 找不到浏览器造成误报。
