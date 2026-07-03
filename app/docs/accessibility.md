# 宠伴记可访问性与离线可用门禁

本门禁用于把 H5/PWA 从“可演示”推进到“可上线前验收”。它不替代真机人工验收，但会阻止常见的可访问性和离线体验退化。

## 自动检查

发布前必须执行：

```powershell
npm run accessibility:check
```

该脚本会检查：

- `index.html` 具有 `zh-CN` 语言、viewport、theme-color、跳过导航入口和可聚焦主内容区。
- Toast 和主内容区使用可被辅助技术识别的状态区域。
- 全局 `:focus-visible` 焦点样式存在，键盘用户能看见当前焦点。
- 主要胶囊按钮触控高度不小于 44px。
- 底部导航具有 `aria-label`，当前页具有 `aria-current="page"`。
- 打卡管理、健康提醒底部弹层使用 `role="dialog"` 和 `aria-modal="true"`。
- 弹层内自定义输入、评论输入具有面向屏幕阅读器的标签。
- Service Worker 对页面导航提供 offline navigation fallback，断网刷新不会直接白屏。
- `runtime-config.js` 不进入预缓存，避免生产环境配置被长缓存。

## 手工验收

上线前至少做一次人工验收：

1. 只用键盘 Tab / Enter 操作登录、底部导航、打卡管理弹层和我的页。
2. 在移动端宽度下确认焦点环不被遮挡。
3. 在浏览器 DevTools 切到 Offline，刷新首页，应能回到已缓存的 App shell。
4. 在真机上检查“打卡管理”底部弹层：标题、完成率、按钮和自定义输入都清晰可用。
5. 使用系统大字号或浏览器 125% 缩放，确认核心操作不重叠。

## 约束

- 不为了视觉效果移除焦点样式。
- 不给纯图标按钮省略可读文本或 `aria-label`。
- 不把 `runtime-config.js` 加入 Service Worker 预缓存。
- 新增底部弹层必须提供标题、关闭按钮、语义化输入标签和键盘可达路径。
