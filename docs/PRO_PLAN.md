# JulesMe Pro 完整产品与技术开发规划文档

> **文档目标**：本文档为 **JulesMe Pro** 商业化演进的完整技术与产品开发蓝图。任何开发 Agent 或工程师可依据本文档的模块设计、数据结构、代码示例与实施步骤，直接进行编码开发与交付。

---

## 目录
1. [产品定位与商业模式](#一产品定位与商业模式)
2. [功能特权矩阵 (Free vs Pro)](#二功能特权矩阵-free-vs-pro)
3. [核心模块技术架构设计](#三核心模块技术架构设计)
   - [模块 1：License 授权与本地鉴权体系](#模块-1license-授权与本地鉴权体系)
   - [模块 2：设置页激活 UI 与 Paywall 拦截弹窗](#模块-2设置页激活-ui-与-paywall-拦截弹窗)
   - [模块 3：官方国内免翻墙高速直连通道](#模块-3官方国内免翻墙高速直连通道)
   - [模块 4：自定义 Prompt 快捷指令库管理器](#模块-4自定义-prompt-快捷指令库管理器)
   - [模块 5：Cloudflare R2 高清多图图床](#模块-5cloudflare-r2-高清多图图床)
4. [支付与自动化发卡系统 (Webhook)](#四支付与自动化发卡系统-webhook)
5. [Google Play 合规与安全防刷](#五google-play-合规与安全防刷)
6. [分阶段开发路线图 (Roadmap)](#六分阶段开发路线图-roadmap)

---

## 一、产品定位与商业模式

* **产品定位**：面向专业开发者的移动端 Google Jules Agent 生产力客户端。
* **收费模式**：**买断制（Lifetime License）**，降低开发者决策门槛。
  * **国内定价**：**￥39 元** 永久买断（支持 1~3 台个人设备）。
  * **海外定价**：**$5.99 ~ $8.99** 永久买断。
* **支付渠道**：
  * 国内：爱发电 (Aifadian) / 面包多 / 发卡平台（微信支付 / 支付宝）。
  * 海外：Lemon Squeezy / Gumroad（信用卡 / PayPal / Apple Pay）。

---

## 二、功能特权矩阵 (Free vs Pro)

| 功能项 | 免费版 (Free) | 🌟 Pro 版 (￥39 买断) |
| :--- | :---: | :---: |
| **基础 Jules 任务与会话执行** | ✅ 完整支持 | ✅ 完整支持 |
| **彩色 Git Diff 语法高亮** | ✅ 完整支持 | ✅ 完整支持 |
| **图片全屏高清预览 (Lightbox)** | ✅ 完整支持 | ✅ 完整支持 |
| **网络连接通道** | 官方直连 (需科学上网) / 自填私有节点 | **🚀 官方专属国内免翻高速通道 (零配置秒连)** |
| **快捷 Prompt 指令库** | 4 个固定默认指令 | **自定义增删改查、排序、导入导出专属 Prompt** |
| **图片附件上传** | 本地压缩 Base64 嵌入 (1~2 张) | **Cloudflare R2 极速高清多图直传 + 历史记录** |
| **代码 Diff 导出** | 剪贴板复制 | **一键导出为 `.patch` / `.diff` 文件并分享** |
| **尊贵身份标识** | 无 | **设置页与主页 Pro 尊贵标识与优先支持** |

---

## 三、核心模块技术架构设计

```text
┌─────────────────────────────────────────────────────────────┐
│                       JulesMe App                           │
├─────────────────────────────────────────────────────────────┤
│  [UI Layer]                                                 │
│   ├── ProPaywallModal (拦截弹窗)                            │
│   ├── SettingsScreen (License 激活 / 网络通道切换)           │
│   └── PromptManagerModal (自定义指令库管理)                  │
├─────────────────────────────────────────────────────────────┤
│  [State & Business Layer]                                   │
│   ├── useProStatus (全局 Pro 状态 Hook)                     │
│   ├── LicenseEngine (Ed25519 离线签名 / 联网校验器)          │
│   └── Dynamic Api Routing (根据 Pro 权限路由 Base URL)       │
├─────────────────────────────────────────────────────────────┤
│  [Storage Layer]                                            │
│   └── SecureStore (加密存储 LicenseKey / Pro 激活态)        │
└─────────────────────────────────────────────────────────────┘
```

---

### 模块 1：License 授权与本地鉴权体系

#### 1.1 数据结构定义 (`src/types/pro.ts`)
```typescript
export type LicenseTier = 'free' | 'pro_lifetime' | 'pro_yearly';

export interface LicensePayload {
  key: string;            // 授权码例如: JULES-PRO-8899-ABCD-EFGH
  email?: string;          // 购买者邮箱
  issuedAt: number;        // 发卡时间戳
  expiresAt?: number | null; // 过期时间戳 (null 表示永久)
  maxDevices: number;      // 允许激活的最大设备数 (默认 3)
}

export interface ProState {
  isPro: boolean;
  tier: LicenseTier;
  license?: LicensePayload | null;
  deviceId: string;
  activatedAt?: number | null;
}
```

#### 1.2 License 校验逻辑 (`src/utils/license.ts`)
支持 **轻量在线校验** 与 **离线非对称签名校验** 双重保障：
```typescript
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ProState, LicensePayload } from '../types/pro';

const PRO_STORAGE_KEY = 'julesme_pro_license_v1';
const LICENSE_VERIFY_ENDPOINT = 'https://api.julesme.com/v1/license/verify';

/**
 * 获取或生成当前设备的唯一标识符
 */
export async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await SecureStore.getItemAsync('julesme_device_id');
  if (!deviceId) {
    deviceId = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync('julesme_device_id', deviceId);
  }
  return deviceId;
}

/**
 * 从本地安全存储读取 Pro 状态
 */
export async function loadSavedProState(): Promise<ProState> {
  const deviceId = await getOrCreateDeviceId();
  try {
    const raw = await SecureStore.getItemAsync(PRO_STORAGE_KEY);
    if (!raw) return { isPro: false, tier: 'free', deviceId };
    
    const parsed: ProState = JSON.parse(raw);
    // 检查有效期
    if (parsed.license?.expiresAt && parsed.license.expiresAt < Date.now()) {
      await SecureStore.deleteItemAsync(PRO_STORAGE_KEY);
      return { isPro: false, tier: 'free', deviceId };
    }
    return { ...parsed, deviceId };
  } catch {
    return { isPro: false, tier: 'free', deviceId };
  }
}

/**
 * 向服务器验证并激活 License Key
 */
export async function activateLicenseKey(licenseKey: string): Promise<{ success: boolean; message?: string; state?: ProState }> {
  const cleanKey = licenseKey.trim().toUpperCase();
  const deviceId = await getOrCreateDeviceId();

  try {
    const response = await fetch(LICENSE_VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: cleanKey, deviceId, platform: Platform.OS }),
    });

    const data = await response.json();
    if (!response.ok || !data.valid) {
      return { success: false, message: data.message || '无效或已被禁用的授权码' };
    }

    const proState: ProState = {
      isPro: true,
      tier: 'pro_lifetime',
      license: data.license,
      deviceId,
      activatedAt: Date.now(),
    };

    await SecureStore.setItemAsync(PRO_STORAGE_KEY, JSON.stringify(proState));
    return { success: true, state: proState };
  } catch (err: any) {
    return { success: false, message: '网络异常，暂时无法验证授权码，请重试。' };
  }
}
```

#### 1.3 全局 Hook (`src/hooks/use-pro.ts`)
通过 React Context 提供响应式的 Pro 状态：
```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { loadSavedProState, activateLicenseKey, ProState } from '../utils/license';

interface ProContextType {
  proState: ProState;
  isLoading: boolean;
  activate: (key: string) => Promise<{ success: boolean; message?: string }>;
  deactivate: () => Promise<void>;
}

const ProContext = createContext<ProContextType | null>(null);

export const ProProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [proState, setProState] = useState<ProState>({ isPro: false, tier: 'free', deviceId: '' });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSavedProState().then(state => {
      setProState(state);
      setIsLoading(false);
    });
  }, []);

  const activate = async (key: string) => {
    const res = await activateLicenseKey(key);
    if (res.success && res.state) {
      setProState(res.state);
    }
    return { success: res.success, message: res.message };
  };

  const deactivate = async () => {
    // 清除本地激活态
    setProState({ isPro: false, tier: 'free', deviceId: proState.deviceId });
  };

  return (
    <ProContext.Provider value={{ proState, isLoading, activate, deactivate }}>
      {children}
    </ProContext.Provider>
  );
};

export const usePro = () => {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error('usePro must be used within ProProvider');
  return ctx;
};
```

---

### 模块 2：设置页激活 UI 与 Paywall 拦截弹窗

#### 2.1 设置页 (`src/app/settings.tsx`) UI 改造
在【设置】中增加 **🌟 JulesMe Pro 状态与激活卡片**：
* **未激活状态**：
  * 显示金色醒目的“升级到 JulesMe Pro”卡片，列出三大特权（免翻墙高速直连 / 自定义 Prompt 库 / 高清大图直传）。
  * 提供 `[ 输入授权码激活 ]` 按钮。
* **已激活状态**：
  * 显示 `🌟 Pro 永久授权` 徽章。
  * 展示授权邮箱 / Key 脱敏展示（如 `JULES-PRO-****-8899`）。
  * 提供 `[ 换绑 / 解绑设备 ]` 操作。

#### 2.2 Paywall 拦截弹窗 (`src/components/pro-paywall-modal.tsx`)
当免费用户在主页或聊天页点击 Pro 专属功能时弹出：
* 包含：特权介绍轮播、输入激活码入口、购买链接（跳往浏览器官网）。

---

### 模块 3：官方国内免翻墙高速直连通道

#### 3.1 客户端网络通道配置 (`src/services/api.ts`)
```typescript
export type NetworkChannel = 'direct' | 'official_relay' | 'custom';

export const OFFICIAL_RELAY_BASE_URL = 'https://api.julesme.com/v1alpha';
export const OFFICIAL_DIRECT_BASE_URL = 'https://jules.googleapis.com/v1alpha';

export function resolveBaseUrl(channel: NetworkChannel, customUrl?: string, isPro: boolean = false): string {
  if (channel === 'official_relay') {
    // 官方中转通道为 Pro 专属，非 Pro 降级到官方直连
    return isPro ? OFFICIAL_RELAY_BASE_URL : OFFICIAL_DIRECT_BASE_URL;
  }
  if (channel === 'custom' && customUrl?.trim()) {
    return `${customUrl.trim().replace(/\/+$/, '')}/v1alpha`;
  }
  return OFFICIAL_DIRECT_BASE_URL;
}
```

#### 3.2 官方 Cloudflare Worker 反向代理源码 (`server/relay-worker.js`)
部署在 `api.julesme.com` 的无状态透明反代：
```javascript
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const url = new URL(request.url);
    // 重写目标为 Google 官方域名
    url.hostname = 'jules.googleapis.com';

    const forwardRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });

    const response = await fetch(forwardRequest);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
```

---

### 模块 4：自定义 Prompt 快捷指令库管理器

#### 4.1 数据结构 (`src/types/prompt.ts`)
```typescript
export interface PromptTemplate {
  id: string;
  title: string;        // 标题，例如 "按 Google 规范重构"
  icon?: string;        // Emoji 图标，例如 "⚡"
  content: string;      // 填入输入框的 Prompt 内容
  isDefault?: boolean;  // 是否系统默认预设
  order: number;
}
```

#### 4.2 功能交互
* 聊天输入框上方快捷气泡支持滑动查看。
* Pro 用户可在气泡最右侧点击 `[ ⚙️ 管理指令 ]` 呼出管理弹窗：
  * 支持 **新建指令**、**修改内容**、**删除**、**上移/下移排序**。
  * 数据保存在本地 `AsyncStorage` / `SecureStore` 中。

---

### 模块 5：Cloudflare R2 高清多图图床

#### 5.1 架构
* 免费版：继续使用客户端 Base64 嵌入（无需服务器）。
* Pro 版：选图后自动直传至 Cloudflare R2，在 Prompt 中引用图片公开 URL（`https://img.julesme.com/xxx.webp`），省去超长 Base64 字符，支持发高清多图。

---

## 四、支付与自动化发卡系统 (Webhook)

```text
[用户付款 (爱发电 / LemonSqueezy)]
               │
               ▼ Webhook
[Cloudflare License Worker (api.julesme.com)]
               │
               ├─ 1. 生成唯一 License Key (UUID + Hash)
               ├─ 2. 存入 Cloudflare D1 或 KV 数据库 (绑定邮箱)
               └─ 3. 自动发送 Key 到用户邮箱 / 页面展示
```

### Cloudflare KV 存储数据格式：
* **Key**: `license:JULES-PRO-XXXX-XXXX`
* **Value**:
```json
{
  "key": "JULES-PRO-XXXX-XXXX",
  "email": "developer@example.com",
  "status": "active",
  "tier": "pro_lifetime",
  "devices": ["android-1740000-abcd"],
  "maxDevices": 3,
  "createdAt": 1740000000000
}
```

---

## 五、Google Play 合规与安全防刷

1. **Google Play 避坑准则**：
   * **严禁**：App 内严禁出现“*点击跳转微信/支付宝购买*”或“*绕过 Google Play 付费*”的外链直付诱导按钮。
   * **允许**：App 内仅保留 **“输入授权码 (License Key) 激活”** 与 **“访问官方网站/社区论坛”**（参考 Termius / Microsoft Office / Obsidian 模式）。
2. **防盗刷机制**：
   * 限制单个 License Key 最多绑定 **3 台设备**（记录 `deviceId`）。
   * 若超出限制，提示“设备数超限，请在原设备解绑或联系作者换绑”。

---

## 六、分阶段开发路线图 (Roadmap)

### 阶段一：Pro 核心底座与鉴权（预计 1~2 天）
* [ ] 创建 `src/types/pro.ts` 与 `src/utils/license.ts`。
* [ ] 编写 `src/hooks/use-pro.ts` 全局 Context Provider。
* [ ] 改造 `src/app/settings.tsx`，加入 Pro 激活卡片与 License Key 输入弹窗。
* [ ] 实现 `src/components/pro-paywall-modal.tsx` 拦截弹窗。

### 阶段二：国内免翻墙高速直连（预计 1 天）
* [ ] 部署 Cloudflare Relay Worker 并绑定 `api.julesme.com`。
* [ ] 改造 `src/services/api.ts`，支持网络通道切换（直连 / 官方免翻中转 / 自定义节点）。
* [ ] 在设置中接入网络通道选择 UI（Pro 用户专享官方免翻通道）。

### 阶段三：自定义 Prompt 模板库（预计 1 天）
* [ ] 实现 Prompt 模板数据存储与管理 Hook (`usePromptTemplates`)。
* [ ] 编写 Prompt 管理 BottomSheet 弹窗（增删改查与排序）。
* [ ] 将自定义 Prompt 映射到聊天页输入框上方的快捷气泡中。

### 阶段四：支付发卡与上线（预计 1 天）
* [ ] 配置爱发电 / Lemon Squeezy 售卖链接。
* [ ] 编写发卡 Webhook Worker 脚本并完成联调。
* [ ] 编写用户激活说明文档。
