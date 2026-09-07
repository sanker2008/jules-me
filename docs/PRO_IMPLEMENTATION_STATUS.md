# JulesMe Pro 实施状态

> 最后更新：2026-09-07
> 状态约定：**已完成** 表示客户端代码与自动化校验已完成；**待服务端** 表示不能仅靠客户端安全交付；**未开始** 表示尚未实现。

## 阶段一：Pro 核心底座与鉴权

**状态：客户端已完成，待服务端联调。**

| 项目 | 状态 | 实现位置 |
| --- | --- | --- |
| 授权数据模型与月度/终身状态判定 | 已完成 | `src/types/pro.ts`、`src/utils/license-state.ts` |
| 本地安全存储与设备标识 | 已完成 | `src/utils/license.ts` |
| 全局 Pro 状态 | 已完成 | `src/hooks/use-pro.tsx` |
| 设置页 Pro 卡片与脱敏授权码 | 已完成 | `src/app/settings.tsx` |
| 双套餐与激活底部弹层 | 已完成 | `src/components/pro-paywall-modal.tsx` |
| 自定义 Prompt 的新增、删除、复用与本地持久化 | 已完成 | `src/components/custom-prompts-modal.tsx`、`src/utils/pro-storage.ts` |
| 全局编码规范保存、自动注入与生效提示 | 已完成 | `src/app/settings.tsx`、`src/app/index.tsx` |
| 基于真实改动、命令与 Pull Request 的交付战报 | 已完成 | `src/app/chat.tsx` |
| 简中、繁中、英文文案 | 已完成 | `src/i18n/index.ts` |
| 授权服务器联调 | 待服务端 | `POST /v1/license/verify` |

### 客户端行为

- 原生端将授权状态和设备标识写入 `expo-secure-store`；Web 端使用浏览器本地存储。
- 月度授权在本地到期后自动回退为 Free；结构异常或损坏的缓存不会授予 Pro。
- 客户端不再请求未上线的默认域名。只有构建时显式设置有效 HTTPS `EXPO_PUBLIC_LICENSE_VERIFY_ENDPOINT` 才开放激活；未配置时设置页显示“即将上线”的不可用状态。
- Web 购买入口由 `EXPO_PUBLIC_PRO_PURCHASE_URL` 控制，只接受 HTTPS 地址；未配置时显示“购买入口即将上线”。原生端不打开外部直付链接。
- 激活请求有 10 秒超时，并分别反馈网络失败、超时、服务响应异常和安全存储失败。
- 当前“取消本机激活”仅删除本机授权缓存。释放服务端设备名额必须由后续 License Worker 提供经验证的解绑接口。
- API Key 只有在 Jules 连接验证成功后才会保存；失败输入不会覆盖之前已经可用的 Key。

### 服务端契约与安全边界

客户端缓存只用于离线显示和功能状态，**不是安全授权边界**。官方中转、R2 上传和设备数量限制必须由服务端再次验证 License Key 与设备标识。

验证接口应返回 `valid: true` 与完整的 `license` 对象，至少包含 `key`、`tier`、`issuedAt`、`expiresAt` 和 `maxDevices`。返回的 `key` 必须与本次提交值一致；客户端会拒绝字段缺失、套餐与过期时间不一致、设备上限非法、Key 不一致或已经到期的数据，不会推断套餐或补默认设备数。

## 验证记录

2026-08-28 在 WSL 中通过：

- `npx tsc --noEmit`
- `npm test`：13 项通过（授权月度到期、终身授权、异常缓存与授权码脱敏均有覆盖）
- `npm run lint`

2026-08-31 已重新生成并校验 npm 锁文件：

- `npm ci --dry-run --ignore-scripts --no-audit --no-fund`：通过，GitHub Actions 所报的 Metro、测试库与平台依赖均已写入 `package-lock.json`。

2026-08-31 Pro 授权加固在 WSL 中通过：

- `test/license-state.test.ts`：13 项通过，覆盖 HTTPS 地址约束、严格响应字段、提交 Key 一致性、网络失败、请求超时、异常响应、存储失败、未配置服务和异常缓存。
- `npx tsc --noEmit`
- Pro 相关源文件定向 ESLint 检查

2026-09-07 已在 Windows 环境完成：

- `npm test`：32 项应用测试与 14 项发布保护测试全部通过。
- `npm run typecheck`、`npm run lint`、`npm run export:web` 与 `npx expo install --check`：全部通过。
- 使用 Codex 内置浏览器验收桌面与 `390 × 844` 手机视口：首页、设置页、简中/英文切换和 Pro 弹层均无布局溢出，浏览器控制台无运行时错误。
- 直接打开或刷新 `/settings` 后点击返回，会安全回到首页，不再触发未处理的 `GO_BACK`。

## 后续阶段

| 阶段 | 状态 | 前置条件 |
| --- | --- | --- |
| 阶段二：Relay 与网络通道候选方案 | 未开始，未对用户承诺 | 安全、成本与合规评估；服务端鉴权方案 |
| 阶段三：自定义 Prompt 与全局编码规范 | 客户端已完成 | 完成真实 Pro 授权联调后开放 |
| 阶段四：支付发卡与上线 | 未开始 | 支付渠道、Webhook 密钥、License Worker 和官方购买网址 |
