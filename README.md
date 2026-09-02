# JulesMe

<p align="center">
  <img src="./assets/images/jules-logo.png" width="96" height="96" alt="JulesMe Logo" />
</p>

<p align="center">
  <strong>Google Jules AI 代码代理的专属移动端客户端</strong>
</p>

<p align="center">
  <a href="https://github.com/sanker2008/jules-me/releases"><img src="https://img.shields.io/github/v/release/sanker2008/jules-me?color=2563eb" alt="Release" /></a>
  <a href="https://docs.expo.dev/versions/v57.0.0/"><img src="https://img.shields.io/badge/Expo-v57.0.18-000020.svg" alt="Expo" /></a>
  <a href="https://reactnative.dev/"><img src="https://img.shields.io/badge/React%20Native-0.86-61dafb.svg" alt="React Native" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" /></a>
</p>

---

JulesMe 是由 sanOmni 开发、以手机端交互为主的跨平台 Expo / React Native 应用。它是 [Google Jules REST API](https://developers.google.com/jules/api/reference/rest) 的移动客户端，专为随时随地在手机上发起、跟进和回顾代码任务而设计。

> **产品定位**：JulesMe 提供原生移动端交互与本地安全密钥存储，核心代码规划、执行、产物和 Pull Request 能力由 Google 官方 Jules API 提供。

---

## ✨ 核心特性

- **📱 原生移动端工作流**：将繁琐流程收敛为「选库选分支 → 描述目标 → 审阅计划 → 实时监控交付」，适合在地铁、通勤和离席时随时指挥 Jules。
- **🌈 彩色 Git Diff 代码审查**：新增代码行绿色高亮、删除行红色高亮、区块段落紫色高亮，并支持 **一键复制完整 Diff**。
- **🔍 图片全屏高清预览 (Lightbox)**：点击聊天气泡、任务目标或产物中的任意图片，即刻弹出全屏暗黑大图查看器，轻松放大阅读代码报错截图。
- **⚡ 快捷 Prompt 指令气泡**：输入框上方横向滑动常用指令气泡（`修复这个报错`、`补充单元测试`、`优化与重构`、`解释核心逻辑`），1-Tap 快速填充。
- **🔎 首页会话即时搜索**：支持按仓库名称、任务标题或目标 Prompt 关键字毫秒级快速过滤历史任务。
- **🛡️ 默认安全的计划审批**：默认开启“先审计划”。Jules 在执行代码改动前必须等待用户确认，亦可在对话中随时提出调整。
- **📳 原生触觉反馈 (Haptics)**：发送消息、审批计划、复制内容及选择分支时均触发轻微原生震动。
- **🔐 硬件级安全存储**：API Key 仅加密保存在本地设备的 `expo-secure-store` 安全硬件区域，绝不上传第三方服务器。
- **🌐 完整多语言**：简体中文 (zh-Hans)、繁體中文 (zh-Hant) 与 English (en) 完整覆盖。

---

## 🚀 Pro 商业化与演进规划

JulesMe 采用 **Open-Core（开源核心 + Pro 商业增值）** 模式，为需要极致便利与生产力的开发者提供 Pro 增值特权：

* 🚀 **官方专属国内免翻高速直连通道**（无需自建梯子，开箱秒连）
* 💡 **自定义 Prompt 快捷指令库管理器**（增删改查与拖拽排序）
* 📸 **Cloudflare R2 高清多图直传图床**
* 📦 **Git Diff 代码补丁一键导出为 `.patch` 文件并分享**

当前已完成 **阶段一客户端底座**：本地安全授权状态、月度到期回退、设置页激活入口与双套餐激活弹层。Relay、R2、支付发卡和设备名额的服务端强制校验仍待部署，不能视为已上线能力。

详细技术设计与发卡系统设计见规划文档：👉 [**`docs/PRO_PLAN.md`**](./docs/PRO_PLAN.md)  
当前实现边界、验证记录与服务端前置条件：👉 [**`docs/PRO_IMPLEMENTATION_STATUS.md`**](./docs/PRO_IMPLEMENTATION_STATUS.md)

---

## 🛠️ 使用流程

1. **配置密钥**：打开应用，进入右上角「设置」保存你的 Google Jules API Key。
2. **创建任务**：在首页选择代码库和起始分支，输入任务描述（亦可直接附加报错截图）。
3. **审阅计划**：收到 Jules 生成的步骤后，点击「批准并执行」或发送消息要求调整。
4. **实时追踪**：查看实时进度流、彩色 Git Diff 和 Bash 执行输出。
5. **验收交付**：任务完成后一键直达 GitHub Pull Request，或在同一代码库发起后续任务。

---

## 💻 本地开发

### 前置条件
- Node.js 22.13+
- npm

### 启动项目
```bash
# 1. 安装依赖
npm ci

# 2. 启动 Expo 开发服务
npx expo start
```

启动后可按 `a` 打开 Android 模拟器，按 `i` 打开 iOS 模拟器，或按 `w` 打开 Web 预览。

### 自动化测试与代码校验
```bash
# 运行单元测试
npm test

# 如果 WSL 的 TEMP/TMP 指向 Windows 挂载路径，请使用 Linux 临时目录
TMPDIR=/tmp TEMP=/tmp TMP=/tmp npm test

# TypeScript 类型检查
npx tsc --noEmit

# ESLint 代码风格检查
npm run lint
```

---

## 📦 Android APK 下载与发布

本项目使用 GitHub Actions 进行全自动 CI/CD 打包。

### 下载与安装

前往 [**Releases 页面**](https://github.com/sanker2008/jules-me/releases) 下载最新版本的 APK。每个版本按处理器架构分别提供安装包，文件名格式为 `JulesMe-v<版本号>-<架构>.apk`。

| 你的设备 | 应下载的安装包 |
| --- | --- |
| **绝大多数近年安卓手机** | `JulesMe-v<版本号>-arm64-v8a.apk`（推荐） |
| 较旧的 32 位安卓手机 | `JulesMe-v<版本号>-armeabi-v7a.apk` |
| Android 模拟器 | `x86_64` 或 `x86` 对应的 APK |

> **不知道选哪个？** 请优先下载 `arm64-v8a`，它适用于绝大多数实体安卓手机。`x86` 与 `x86_64` 仅面向模拟器。
>
> `.aab` 是 Google Play 等应用商店的发布包，不能直接在手机上安装；普通用户请选择 `.apk`。

### 发布新版本

打上版本号 Tag 推送即可自动触发构建：

  ```bash
  VERSION=1.1.10
  git tag "$VERSION"
  git push origin "$VERSION"
  ```

发布签名采用“双密钥 + Google Play App Signing”：

- **应用签名密钥**签署 GitHub Release APK，并在首次上架前导入 Google Play App Signing，使 GitHub APK 与 Play 下发版本保持同一应用签名。
- **上传密钥**只签署提交到 Google Play 的 AAB；上传密钥泄露时可向 Google 申请重置，不影响应用签名密钥。

两组密钥均在仓库外生成，GitHub Actions 只从受保护的 `android-release` Environment 读取以下 Secrets：

| 用途 | Environment Secrets |
| --- | --- |
| GitHub Release APK | `ANDROID_APP_SIGNING_KEYSTORE_BASE64`、`ANDROID_APP_SIGNING_KEYSTORE_PASSWORD`、`ANDROID_APP_SIGNING_KEY_ALIAS`、`ANDROID_APP_SIGNING_KEY_PASSWORD`、`ANDROID_APP_SIGNING_CERT_SHA256` |
| Google Play AAB | `ANDROID_UPLOAD_KEYSTORE_BASE64`、`ANDROID_UPLOAD_KEYSTORE_PASSWORD`、`ANDROID_UPLOAD_KEY_ALIAS`、`ANDROID_UPLOAD_KEY_PASSWORD`、`ANDROID_UPLOAD_CERT_SHA256` |

缺少任一 Secret、证书指纹不匹配或检测到 Android Debug 证书时，发布任务都会直接失败。密钥文件、密码和 Base64 内容不得写入仓库、Issue 或日志。

---

## 📄 许可证 (License)

本项目基于 [MIT License](./LICENSE) 协议开源。
