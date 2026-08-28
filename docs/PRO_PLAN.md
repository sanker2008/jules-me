# JulesMe Pro 完整产品与技术开发规划文档

> **文档目标**：本文档为 **JulesMe Pro** 商业化演进的完整技术与产品开发蓝图。任何开发 Agent 或工程师可依据本文档的模块设计、数据结构、代码示例与实施步骤，直接进行编码开发与交付。

---

## 目录
1. [产品定位、开源策略与商业模式](#一产品定位开源策略与商业模式)
2. [功能特权矩阵 (Free vs Pro)](#二功能特权矩阵-free-vs-pro)
3. [双套餐定价与价格锚定设计](#三双套餐定价与价格锚定设计)
4. [核心模块技术架构设计](#四核心模块技术架构设计)
   - [模块 1：License 授权与本地鉴权体系](#模块-1license-授权与本地鉴权体系)
   - [模块 2：设置页激活 UI 与 Paywall 拦截弹窗](#模块-2设置页激活-ui-与-paywall-拦截弹窗)
   - [模块 3：官方国内免翻墙高速直连通道](#模块-3官方国内免翻墙高速直连通道)
   - [模块 4：自定义 Prompt 快捷指令库管理器](#模块-4自定义-prompt-快捷指令库管理器)
   - [模块 5：Cloudflare R2 高清多图图床](#模块-5cloudflare-r2-高清多图图床)
5. [支付与自动化发卡系统 (Webhook)](#五支付与自动化发卡系统-webhook)
6. [Google Play 合规与安全防刷](#六google-play-合规与安全防刷)
7. [分阶段开发路线图 (Roadmap)](#七分阶段开发路线图-roadmap)

---

## 一、产品定位、开源策略与商业模式

### 1.1 产品定位
面向专业开发者的移动端 Google Jules Agent 生产力客户端，让开发者在手机上随时随地指挥 Jules 改 Bug、写单测、提 PR。

### 1.2 开源策略：Open-Core（开源核心 + Pro 商业增值）
* **客户端代码完全开源**：
  * **解决信任痛点**：消除程序员对 Google Jules API Key 泄露的安全顾虑，证明 App 绝不暗中记录或窃取凭证。
  * **GitHub 流量红利**：通过开源社区自传播（Star、Issue、PR、V2EX、Twitter、掘金）获取天然精准流量。
* **商业护城河**：
  * 官方提供**开箱即用、免翻墙的高速直连通道**与云服务，普通开发者无需耗费数小时折腾服务器与域名，花小额费用直接享受极致便利。

---

## 二、功能特权矩阵 (Free vs Pro)

| 功能项 | 免费版 (Free) | ☕ Pro 月度体验版 (￥9.9) | 👑 Pro 终身买断版 (￥39) |
| :--- | :---: | :---: | :---: |
| **基础 Jules 任务与会话执行** | ✅ 完整支持 | ✅ 完整支持 | ✅ 完整支持 |
| **彩色 Git Diff 语法高亮** | ✅ 完整支持 | ✅ 完整支持 | ✅ 完整支持 |
| **图片全屏高清预览 (Lightbox)** | ✅ 完整支持 | ✅ 完整支持 | ✅ 完整支持 |
| **网络连接通道** | 官方直连 (需科学上网) / 自填私有节点 | **🚀 官方免翻高速通道 (30天)** | **🚀 官方免翻高速通道 (永久)** |
| **快捷 Prompt 指令库** | 4 个固定默认指令 | **自定义增删改查与排序** | **自定义增删改查与排序** |
| **图片附件上传** | 本地压缩 Base64 嵌入 | **Cloudflare R2 高清直传** | **Cloudflare R2 高清直传** |
| **代码 Diff 导出** | 剪贴板复制 | **导出 `.patch` 文件并分享** | **导出 `.patch` 文件并分享** |
| **多设备支持** | 不限 | 1~3 台设备 | 1~3 台设备 |
| **有效期限** | 永久免费 | 30 天 | **终身永久，包含所有未来大更新** |

---

## 三、双套餐定价与价格锚定设计

采用独立软件最具转化率的 **“月度体验 + 终身买断” 价格锚定组合**：

```text
┌─────────────────────────────────────────────────────────────┐
│                    🌟 解锁 JulesMe Pro                      │
├──────────────────────────────┬──────────────────────────────┤
│      ☕ 月度体验版           │      👑 终身买断版 (推荐)    │
├──────────────────────────────┼──────────────────────────────┤
│         ￥9.9 / 30 天        │       ￥39 永久 (限时特惠)   │
│         ($1.99 / mo)         │       ($6.99 ~ $8.99)        │
│                              │                              │
│ • 适合短期项目尝鲜           │ • 终身享受全部后续大版本更新 │
│ • 30 天官方免翻高速通道      │ • 永久官方免翻高速直连通道   │
│ • 自定义 Prompt 快捷指令库   │ • 自定义 Prompt 快捷指令库   │
│ • 随时体验，零决策压力       │ • 仅需 4 个月月费即可永久拥有│
├──────────────────────────────┼──────────────────────────────┤
│        [ 选择月度 ]          │        [ 立即买断 ]          │
└──────────────────────────────┴──────────────────────────────┘
```

---

## 四、核心模块技术架构设计

```text
┌─────────────────────────────────────────────────────────────┐
│                       JulesMe App                           │
├─────────────────────────────────────────────────────────────┤
│  [UI Layer]                                                 │
│   ├── ProPaywallModal (双套餐对比与拦截弹窗)                │
│   ├── SettingsScreen (License 激活 / 网络通道切换)           │
│   └── PromptManagerModal (自定义指令库管理)                  │
├─────────────────────────────────────────────────────────────┤
│  [State & Business Layer]                                   │
│   ├── useProStatus (全局 Pro 状态 Hook)                     │
│   ├── LicenseEngine (校验 expiresAt / 永久或月度)           │
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
export type LicenseTier = 'free' | 'pro_monthly' | 'pro_lifetime';

export interface LicensePayload {
  key: string;            // 授权码例如: JULES-PRO-8899-ABCD-EFGH
  email?: string;          // 购买者邮箱
  tier: LicenseTier;       // 'pro_monthly' | 'pro_lifetime'
  issuedAt: number;        // 发卡时间戳
  expiresAt: number | null; // 过期时间戳 (null 表示永久买断)
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
```typescript
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ProState, LicensePayload, LicenseTier } from '../types/pro';

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
 * 从本地安全存储读取 Pro 状态（含月度过期校验）
 */
export async function loadSavedProState(): Promise<ProState> {
  const deviceId = await getOrCreateDeviceId();
  try {
    const raw = await SecureStore.getItemAsync(PRO_STORAGE_KEY);
    if (!raw) return { isPro: false, tier: 'free', deviceId };
    
    const parsed: ProState = JSON.parse(raw);
    
    // 如果是月度套餐且已过期，自动回退为免费版
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
 * 向服务器验证并激活 License Key (支持月度与买断)
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

    const payload: LicensePayload = data.license;
    const proState: ProState = {
      isPro: true,
      tier: payload.tier || (payload.expiresAt ? 'pro_monthly' : 'pro_lifetime'),
      license: payload,
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
* **未激活状态**：
  * 显示金色 Pro 升级卡片，展示【￥9.9 体验 / ￥39 买断】双套餐。
  * 提供 `[ 输入授权码激活 ]` 按钮。
* **已激活状态**：
  * 显示 `🌟 Pro 永久授权` 或 `☕ Pro 月度体验（剩 X 天）` 徽章。
  * 展示脱敏 Key（如 `JULES-PRO-****-8899`）。
  * 提供 `[ 解绑设备 ]` 功能。

#### 2.2 Paywall 拦截弹窗 (`src/components/pro-paywall-modal.tsx`)
当免费用户触发 Pro 特权（如切换免翻直连通道或管理 Prompt）时弹出：
* 包含双套餐购买选项卡片、激活码输入框与购买官网链接。

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
  title: string;        // 标题例如 "按 Google 规范重构"
  icon?: string;        // Emoji 图标例如 "⚡"
  content: string;      // 填入输入框的 Prompt 内容
  isDefault?: boolean;  // 是否系统预设
  order: number;
}
```

#### 4.2 交互
* 输入框上方快捷气泡最右侧增加 `[ ⚙️ 管理指令 ]`（Pro 专属）。
* 点击呼出管理页面：支持新建指令、编辑内容、拖拽/上移下移排序、删除。

---

### 模块 5：Cloudflare R2 高清多图图床

* 免费版：客户端 Base64 压缩（零服务器）。
* Pro 版：图片直传 Cloudflare R2，Prompt 内引用精简 URL（`https://img.julesme.com/xxx.webp`），支持高清大图与多图发送。

---

## 五、支付与自动化发卡系统 (Webhook)

```text
[用户付款 (爱发电 ￥9.9 / ￥39 或 LemonSqueezy)]
                         │
                         ▼ Webhook
          [Cloudflare License Worker]
                         │
        ├─ 1. 生成唯一 License Key (UUID)
        ├─ 2. 计算过期时间 (月度: +30天, 买断: null)
        ├─ 3. 存入 Cloudflare KV (绑定邮箱)
        └─ 4. 发送 Key 到用户邮箱 / 页面展示
```

### Cloudflare KV 存储数据格式：
* **Key**: `license:JULES-PRO-XXXX-XXXX`
* **Value**:
```json
{
  "key": "JULES-PRO-XXXX-XXXX",
  "email": "developer@example.com",
  "status": "active",
  "tier": "pro_monthly",
  "expiresAt": 1742500000000,
  "devices": ["android-1740000-abcd"],
  "maxDevices": 3,
  "createdAt": 1740000000000
}
```

---

## 六、Google Play 合规与安全防刷

1. **Google Play 避坑准则**：
   * **严禁**：App 内严禁出现“*点击跳转微信/支付宝购买*”或“*绕过 Google Play 付费*”的外链直付诱导按钮。
   * **允许**：App 内仅保留 **“输入授权码 (License Key) 激活”** 与 **“访问官方网站/社区论坛”**（参考 Termius / Microsoft Office / Obsidian 模式）。
2. **防盗刷机制**：
   * 限制单个 License Key 最多绑定 **3 台设备**（记录 `deviceId`）。

---

## 七、分阶段开发路线图 (Roadmap)

### 阶段一：Pro 核心底座与鉴权（预计 1~2 天）
* [ ] 创建 `src/types/pro.ts` 与 `src/utils/license.ts`（支持月度/买断）。
* [ ] 编写 `src/hooks/use-pro.ts` 全局 Context Provider。
* [ ] 改造 `src/app/settings.tsx`，加入 Pro 激活卡片与 License Key 输入弹窗。
* [ ] 实现 `src/components/pro-paywall-modal.tsx` 双套餐拦截弹窗。

### 阶段二：国内免翻墙高速直连（预计 1 天）
* [ ] 部署 Cloudflare Relay Worker 并绑定 `api.julesme.com`。
* [ ] 改造 `src/services/api.ts`，支持网络通道切换（直连 / 官方免翻中转 / 自定义节点）。
* [ ] 在设置中接入网络通道选择 UI（Pro 用户专享官方免翻通道）。

### 阶段三：自定义 Prompt 模板库（预计 1 天）
* [ ] 实现 Prompt 模板数据存储与管理 Hook (`usePromptTemplates`)。
* [ ] 编写 Prompt 管理 BottomSheet 弹窗（增删改查与排序）。
* [ ] 将自定义 Prompt 映射到聊天页输入框上方的快捷气泡中。

### 阶段四：支付发卡与上线（预计 1 天）
* [ ] 在爱发电 / 面包多 / Lemon Squeezy 配置【￥9.9 月度体验】与【￥39 终身买断】售卖链接。
* [ ] 编写发卡 Webhook Worker 脚本并完成联调。
* [ ] 编写用户激活说明文档。
