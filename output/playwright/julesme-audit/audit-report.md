# julesMe 产品体验审计

审计日期：2026-07-21

## 范围与证据

- 审计对象：Expo Web 版（桌面与 390×844 手机视口）。
- Jules API 数据使用与官方 REST 文档一致的模拟响应；未向 Jules 发送真实请求。
- 运行时检查：临时 WSL 副本中 `pnpm exec expo lint` 与 `pnpm exec tsc --noEmit` 均通过。
- 原工作区位于 `/mnt/d`，其 `pnpm install --frozen-lockfile` 两次均在最后阶段遭遇 Windows 挂载盘的 `EACCES rename`；未改动源码或锁文件。
- Web 端预存 API Key 会存于 `localStorage`。本次没有读取、使用或保存该值；可能含该值的两个 DOM 快照已删除，并复查确认审计产物不含该值。

## 截图

1. `01-api-key-setup-desktop.png`：首次 API Key 设置（桌面）。
2. `02-dashboard-desktop.png`：代码库与历史会话首页（桌面，模拟数据）。
3. `03-dashboard-mobile.png`：手机首页。
4. `04-settings-mobile.png`：手机设置弹窗。
5. `05-dark-mode-mobile.png`：系统深色模式下的手机首页。

## 流程结果

| 步骤 | 用户动作 | 健康度 | 观察结果 |
| --- | --- | --- | --- |
| 1 | 首次打开并配置 API Key | 需改进 | 弹窗可用，但没有获取 Key 的引导、格式校验、连接测试或可见的安全说明。 |
| 2 | 加载代码库与近期会话 | 部分通过 | 使用模拟 Jules 响应后列表能加载，但内容层级过弱，桌面空间利用率低。 |
| 3 | 点击一个代码库 | 阻断 | URL 和画面均未进入聊天页。 |
| 4 | 点击“新建空会话” | 阻断 | URL 和画面均未进入聊天页。 |
| 5 | 直接访问 `/chat` | 阻断 | 仍渲染首页，证明不仅是卡片点击问题。 |
| 6 | 手机与深色模式 | 需改进 | 顶部 Emoji 在浏览器中显示为缺字方框；内容页维持浅色，底部 Tab 才变深色。 |

## 最高优先级发现

### P0：聊天路由未注册，主流程不可达

Native 和 Web Tab 都只声明了首页 Trigger；`chat.tsx` 没有作为可渲染路由进入 Tabs。运行时点击代码库、点击新建会话，以及直接访问 `/chat` 都回到/停留在首页。

- `src/components/app-tabs.tsx`
- `src/components/app-tabs.web.tsx`

### P0：空会话与 Jules API 约束冲突

官方 `Session` 资源声明 `sourceContext` 必填，但 `createSession` 允许不带 source 发送请求；“Start Empty Session”即便路由修好，仍会因请求体无效而失败。

- `src/services/api.ts`
- https://developers.google.com/jules/api/reference/rest/v1alpha/sessions

### P0：真实对话活动未被消费

Jules 的 Activity 包含 `agentMessaged`、`userMessaged`、计划、失败原因及产物。当前 Activity 类型和消息解析没有处理前两个消息字段，因此恢复会话或轮询时不会显示实际对话内容。

- `src/services/api.ts`
- `src/app/chat.tsx`

### P0：计划审批成功会被当作失败

`approvePlan` 成功响应为空，但实现仍调用 `response.json()`，会在成功后抛 JSON 解析错误。创建 Session 也没有设置 `requirePlanApproval: true`，与 UI 的审批按钮意图不一致。

- `src/services/api.ts`
- https://developers.google.com/jules/api/reference/rest/v1alpha/sessions/approvePlan

## 交互、视觉与无障碍

- 顶栏的加号和刷新 Emoji 在本次浏览器中显示成方框；三个图标没有文字、工具提示或无障碍名称。
- 首页从桌面到手机都只有两张大卡片，视觉重量集中在空白区域；底部的 “Jules Workspace / Home” 与页首标题重复。
- 卡片点击没有按下态、加载态、失败态或跳转反馈；这是主流程失效时尤其严重的“静默失败”。
- 设置弹窗在手机上尺寸尚可，但缺少获取 API Key 的帮助、显示/隐藏控制、校验和错误恢复；Esc 不能关闭弹窗。
- 系统深色模式下，Tab 切为深色而主内容仍是白底，造成明显断层。
- `#888`、`#999` 等浅灰文本和白底有对比度风险；无障碍树未暴露清晰的 button/label 语义。
- 运行时仅见一个 Expo `shadow*` 已弃用警告，未见 JavaScript error。

## 建议的修复顺序

1. 先改路由结构：将 `chat` 置于 Tab 外的 Stack，或在 Tabs 中显式注册并隐藏它；写入导航回归测试。
2. 以 Jules 文档重建 Session/Activity 类型与状态机：强制选择 Source + branch，显示 agent/user messages、plan steps、失败原因、产物和 PR。
3. 修正审批与轮询：空响应不解析 JSON，使用已见 Activity ID 去重，完整分页并清理轮询定时器。
4. 再重做体验：带文案的操作按钮、明确空/加载/错误状态、统一的页面宽度与设计 token、完整深色模式。
5. 最后补无障碍：语义化按钮、API Key 标签关联、可见焦点、44px 点击目标、动态状态播报和键盘关闭弹窗。
