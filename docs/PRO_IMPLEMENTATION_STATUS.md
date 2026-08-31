# JulesMe Pro 实施状态

> 最后更新：2026-08-31  
> 状态约定：**已完成** 表示客户端代码与自动化校验已完成；**待服务端** 表示不能仅靠客户端安全交付；**未开始** 表示尚未实现。

## 阶段一：Pro 核心底座与鉴权

**状态：客户端已完成，待服务端联调。**

| 项目 | 状态 | 实现位置 |
| --- | --- | --- |
| 授权数据模型与月度/终身状态判定 | 已完成 | `src/types/pro.ts`、`src/utils/license-state.ts` |
| 本地安全存储与设备标识 | 已完成 | `src/utils/license.ts` |
| 全局 Pro 状态 | 已完成 | `src/hooks/use-pro.tsx` |
| 设置页 Pro 卡片与脱敏授权码 | 已完成 | `src/app/settings.tsx` |
| 双套餐激活底部弹层 | 已完成 | `src/components/pro-paywall-modal.tsx` |
| 简中、繁中、英文文案 | 已完成 | `src/i18n/index.ts` |
| 授权服务器联调 | 待服务端 | `POST /v1/license/verify` |

### 客户端行为

- 原生端将授权状态和设备标识写入 `expo-secure-store`；Web 端使用浏览器本地存储。
- 月度授权在本地到期后自动回退为 Free；结构异常或损坏的缓存不会授予 Pro。
- 默认验证地址为 `https://api.julesme.com/v1/license/verify`，可用 `EXPO_PUBLIC_LICENSE_VERIFY_ENDPOINT` 在构建时替换。
- 当前“取消本机激活”仅删除本机授权缓存。释放服务端设备名额必须由后续 License Worker 提供经验证的解绑接口。

### 服务端契约与安全边界

客户端缓存只用于离线显示和功能状态，**不是安全授权边界**。官方中转、R2 上传和设备数量限制必须由服务端再次验证 License Key 与设备标识。

验证接口应返回 `valid: true` 与完整的 `license` 对象，至少包含 `key`、`tier`、`issuedAt`、`expiresAt` 和 `maxDevices`。客户端会拒绝字段缺失、套餐与过期时间不一致或已经到期的数据。

## 验证记录

2026-08-28 在 WSL 中通过：

- `npx tsc --noEmit`
- `npm test`：13 项通过（授权月度到期、终身授权、异常缓存与授权码脱敏均有覆盖）
- `npm run lint`

2026-08-31 已重新生成并校验 npm 锁文件：

- `npm ci --dry-run --ignore-scripts --no-audit --no-fund`：通过，GitHub Actions 所报的 Metro、测试库与平台依赖均已写入 `package-lock.json`。

Web 浏览器验收尚未完成：当前工作区的 `node_modules` 混入 Windows 原生二进制，Metro 缺少 Linux `lightningcss` 绑定而返回 HTTP 500。此问题不影响上述类型、单测和 lint 结果；需要在 WSL 中恢复完整的 Linux 依赖后再执行浏览器与真机验收。

## 后续阶段

| 阶段 | 状态 | 前置条件 |
| --- | --- | --- |
| 阶段二：官方 Relay 与网络通道 | 未开始 | Cloudflare Worker、`api.julesme.com` 域名与服务端鉴权方案 |
| 阶段三：自定义 Prompt 模板库 | 未开始 | 在客户端接入 Pro 拦截与持久化模板 |
| 阶段四：支付发卡与上线 | 未开始 | 支付渠道、Webhook 密钥、License Worker 和官方购买网址 |
