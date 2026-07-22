# JulesMe

JulesMe 是一个以手机端交互为主的 Expo / React Native 应用，用于通过 [Jules REST API](https://developers.google.com/jules/api/reference/rest) 发起、跟进和回顾代码任务。

它不是 Jules Web 的布局复刻：移动端将流程收敛为「选择代码库与分支 → 描述任务 → 审阅计划 → 跟进执行结果」，方便在手机上快速处理代码协作。

## 主要能力

- **任务发起器**：从 Jules 已连接的 GitHub 代码库中选择仓库和起始分支，输入任务描述后创建会话。
- **安全的默认执行方式**：默认开启“先审计划”。Jules 生成计划后，必须由用户确认才会开始执行；也可以在会话中要求调整计划。
- **可选自动创建 PR**：创建任务时可开启“完成后自动创建 PR”，对应 Jules 的 `AUTO_CREATE_PR` 自动化模式。该选项默认关闭。
- **按优先级查看会话**：首页将会话分为“需要你处理”“进行中的任务”和“最近会话”，优先展示等待计划确认或用户反馈的任务。
- **状态驱动的会话详情**：显示排队、规划、等待确认、执行、完成、失败等 Jules 会话状态，并在 App 回到前台后自动恢复同步。
- **活动与产物查看**：支持展示代理消息、计划步骤、进度、Git Diff、命令输出、媒体产物及 Jules 创建的 Pull Request；每项均按设备本地时区显示 Jules `Activity.createTime`，较长会话可按需加载更早活动。
- **面向交付的完成页**：会话结束后，首屏展示完成/失败状态、活动数、代码改动、命令结果和 Pull Request；不再保留不可发送的对话框，而是提供“发起后续任务”或“重新发起”。
- **适合手机阅读的计划**：计划步骤默认只显示摘要，技术说明按需展开并支持复制，避免长篇执行说明遮挡任务进展。
- **设备端密钥保存**：iOS / Android 使用 `expo-secure-store` 保存 API Key；Web 预览使用浏览器本地存储，仅建议用于本地开发。

## 使用流程

1. 打开应用，点击右上角设置，保存你的 Jules API Key。
2. 在“新任务”卡片中选择一个 Jules 已连接的代码库及其起始分支。
3. 描述要完成的工作；可使用“修复一个 Bug”“解释这个报错”等任务模板作为起点。
4. 按需设置：
   - **先审计划**：默认开启；在 Jules 执行前手动批准其计划。
   - **完成后自动创建 PR**：只有在确实产生代码改动且 Jules 支持时才会创建分支和 PR。
5. 进入会话详情查看活动流：
   - 收到计划后，可“批准并执行”或发送消息要求调整。
   - Jules 执行过程中会展示最新进度、代理消息、代码改动和命令结果；计划中的技术细节可按需展开。
   - 完成后，先在首屏确认交付摘要；如 API 返回 PR 输出，可直接打开 GitHub Pull Request，或在同一代码库发起后续任务。

> Jules 创建会话必须提供任务描述、`sources/{source}` 格式的代码库和 GitHub 起始分支。因此 JulesMe 不提供“无代码库任务”入口。

## Jules API 映射与边界

| JulesMe 交互 | Jules REST API |
| --- | --- |
| 选择代码库和分支 | `sources.list`，使用代码库返回的 `defaultBranch` / `branches` |
| 创建任务 | `sessions.create`，传入 `prompt`、`sourceContext`、计划确认与 PR 自动化选项 |
| 最近任务与状态分组 | `sessions.list` / `sessions.get` |
| 会话活动、计划、产物与时间 | `sessions.activities.list`；每个 `Activity` 的 `createTime` 是 API 输出的 RFC 3339 创建时间 |
| 批准计划 | `sessions.approvePlan` |
| 调整计划或回复 Jules | `sessions.sendMessage` |

当前公开 REST API 没有取消、暂停、恢复、删除或重命名会话的方法。JulesMe 不会提供没有 API 支撑的伪按钮：失败会话提供的是“以相同上下文重新发起”，会重新创建一个会话。

REST API 也没有推送流或 webhook。应用仅在前台查看活跃会话时轮询；进入后台停止，回到前台立即同步。若需要可靠的后台完成通知，需要另行部署服务端轮询和 APNs / FCM 推送。

## 本地开发

### 前置条件

- Node.js 20 或更新版本
- pnpm（推荐）或 npm
- 可访问 Jules API 的 API Key

### 安装与启动

```bash
pnpm install
pnpm start
```

也可以使用 npm：

```bash
npm install
npx expo start
```

启动后可使用 Expo Go 扫描二维码、打开 Android 模拟器 / iOS 模拟器，或运行 Web 预览：

```bash
pnpm web
```

## 验证

在提交前运行：

```bash
pnpm exec tsc --noEmit
pnpm lint
npx expo export --platform web --output-dir /tmp/julesme-web-export
```

前两个命令验证类型与 Expo lint；最后一个命令确认 Expo Router 的静态 Web 路由可导出。涉及真实任务创建、计划批准、PR 和产物的验收，需要使用你自己的 API Key 连接 Jules 后完成。

## Android APK（GitHub Actions）

仓库包含 Android APK 构建与发布工作流。推送以 `v` 开头或纯版本号的标签即可触发，例如：

```bash
git tag v1.0.0
git push origin v1.0.0
```

也可以在 GitHub 仓库的 **Actions** 页面手动运行 **Build and Release Android APK**。成功后可从 GitHub Release 或工作流构件下载 `app-release.apk`。

## 技术栈

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [React Native](https://reactnative.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- TypeScript
- [Jules API](https://developers.google.com/jules/api/reference/rest)
