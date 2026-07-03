# 宠伴记运行时配置

`runtime-config.js` 用于静态 H5/PWA 部署后的环境参数配置。它会在 `src/main.js` 之前加载，并写入 `window.PET_COMPANION_CONFIG`。

## 默认安全模式

仓库内默认配置：

```js
window.PET_COMPANION_CONFIG = {
  APP_RELEASE_CHANNEL: 'local-production-ready',
  API_BASE_URL: '',
  API_TIMEOUT_MS: 8000,
  API_MOCK_FALLBACK: true,
  MONITORING_ENDPOINT: '',
  MONITORING_SAMPLE_RATE: 1,
  OPERATOR_NAME: '',
  SUPPORT_CONTACT_LABEL: '',
  SUPPORT_CONTACT_URL: '',
  SUPPORT_EMAIL: ''
};
```

这个默认值不会向外部接口发送请求：

- `API_BASE_URL` 为空时，业务 API 使用本地 mock fallback。
- `MONITORING_ENDPOINT` 为空时，监控只在本地统计，不外发。

## 生产部署示例

推荐用脚本生成生产配置：

```powershell
$env:PET_API_BASE_URL='https://api.your-real-domain.cn'
$env:PET_MONITORING_ENDPOINT='https://monitoring.your-real-domain.cn/events'
$env:PET_OPERATOR_NAME='宠伴记运营主体'
$env:PET_SUPPORT_CONTACT_URL='https://support.your-real-domain.cn/pet-companion'
$env:PET_SUPPORT_EMAIL='support@your-real-domain.cn'
npm run runtime:production
```

脚本会写入 `dist/runtime-config.js`，并在 `--production` 模式下强制校验 HTTPS、生产通道、关闭 mock fallback、真实运营主体、至少一个客服/投诉渠道，并拒绝 `example.com`、`TODO`、`待定`、`示例` 等占位内容。生成结果形如：

```js
window.PET_COMPANION_CONFIG = {
  APP_RELEASE_CHANNEL: 'production',
  API_BASE_URL: 'https://api.your-real-domain.cn',
  API_TIMEOUT_MS: 8000,
  API_MOCK_FALLBACK: false,
  MONITORING_ENDPOINT: 'https://monitoring.your-real-domain.cn/events',
  MONITORING_SAMPLE_RATE: 1,
  OPERATOR_NAME: '宠伴记运营主体',
  SUPPORT_CONTACT_LABEL: '客服与投诉入口',
  SUPPORT_CONTACT_URL: 'https://support.your-real-domain.cn/pet-companion',
  SUPPORT_EMAIL: 'support@your-real-domain.cn'
};
```

## 字段说明

| 字段 | 说明 |
| --- | --- |
| `APP_RELEASE_CHANNEL` | 发布通道，如 `production`、`staging` |
| `API_BASE_URL` | 后端 API 根地址 |
| `API_TIMEOUT_MS` | API 超时时间，允许 1000 到 30000 毫秒 |
| `API_MOCK_FALLBACK` | 未配置或调试时是否启用本地 fallback |
| `MONITORING_ENDPOINT` | 前端错误监控接收地址 |
| `MONITORING_SAMPLE_RATE` | 监控采样率，0 到 1 |
| `OPERATOR_NAME` | App 内展示的真实运营主体 |
| `SUPPORT_CONTACT_LABEL` | 客服/投诉入口展示名称 |
| `SUPPORT_CONTACT_URL` | HTTPS 客服/投诉入口 |
| `SUPPORT_EMAIL` | 客服/投诉邮箱；生产环境可与 `SUPPORT_CONTACT_URL` 二选一或同时配置 |

## 安全要求

- 不要在 `runtime-config.js` 放 token、cookie、私钥、密码或任何用户敏感数据。
- 生产环境建议 `API_MOCK_FALLBACK: false`。
- 生产环境不得继续使用 `example.com`、`TODO`、`待定`、`示例` 等占位内容；客服/投诉渠道必须能真实触达运营者。
- `runtime-config.js` 是公开静态文件，任何访问 App 的人都能看到。

## 检查命令

本地部署检查：

```powershell
npm run deploy:check
```

生产参数写入 `dist/runtime-config.js` 后执行：

```powershell
npm run deploy:check:production
```
