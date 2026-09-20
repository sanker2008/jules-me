# App 内更新

设置页 → 应用更新，手动检查。简体中文、繁体中文及英文均已接入。

## GitHub APK

- 来源固定为 `sanker2008/jules-me` 的最新稳定 Release；忽略旧版、不接受预发布版本。
- 读取设备 ABI，选择 `JulesMe-v<version>-<abi>.apk`，校验 GitHub 提供的 SHA-256 和文件大小。
- 下载安装包 → 安装更新 → 如需授权，允许 JulesMe 安装应用 → 返回再次安装。
- 下载可取消，失败可重试。文件保存在应用缓存中；下一次下载会清理旧包。
- Android 系统负责签名及版本检查。必须继续使用现有 app-signing key 和递增的 versionCode；不要卸载旧版来绕过签名不一致。
- GitHub 构建允许安装 APK；AAB 构建设置 `JULESME_DISTRIBUTION=play`，移除安装权限并使用商店入口。
- Web 只检查并展示 Android 发布版本；iOS 完整版本通过原商店/TestFlight 更新。

首次使用此功能需要安装包含这些原生模块的新 APK。旧 1.1.19 无法凭空获得更新入口。发布新包前同步递增 package.json / app.json 的 version、android.versionCode 和 ios.buildNumber，并使用匹配版本的发布 tag。

## Expo 功能热更新

客户端支持检查、下载以及用户确认后重启应用，保留 Expo 的运行时兼容性与回滚机制。未配置服务时明确显示未启用，不假报已是最新。

构建和 OTA 发布时设置相同的公开环境变量：

- `JULESME_EAS_PROJECT_ID`：真实 EAS 项目 UUID，生成 `https://u.expo.dev/<projectId>`。
- `JULESME_UPDATES_URL`：可选，自建 Expo Updates 协议服务 HTTPS 地址，优先于上面的自动地址。
- `JULESME_UPDATE_CHANNEL`：默认按分发类型选择 `github-production` / `play-production`。GitHub 与 Play 的渠道必须分开，并设置对应的 JULESME_DISTRIBUTION。
- `JULESME_DISTRIBUTION`：`github`（默认）或 `play`。

GitHub Actions 从仓库/`android-release` environment 的同名 Variables 读取服务配置；通道分别读取 `JULESME_GITHUB_UPDATE_CHANNEL` / `JULESME_PLAY_UPDATE_CHANNEL`。当前未提供真实服务地址，因此默认关闭 OTA。接入服务后必须再构建一次安装包。

完成 EAS 项目及 channel → branch 绑定后，使用该项目的 EAS CLI 发布，例如：

```sh
JULESME_EAS_PROJECT_ID=<project-uuid> JULESME_DISTRIBUTION=github JULESME_UPDATE_CHANNEL=github-production npx eas-cli update --channel github-production --message "修复页面问题"
```

`runtimeVersion.policy=appVersion`：仅向同一应用版本推送兼容 JS/资源。不要为单次 OTA 增加 appVersion；原生依赖、权限或 SDK 发生变化时必须增加版本并重新发包。不要用 OTA 将安装包版本冒充成更高原生版本。

## 验证边界

单元测试覆盖版本、ABI、来源、完整性、HTTP 错误和分发配置；类型检查、lint、Web 导出及 Expo 原生配置检查可在本机执行。Android 安装器、安装权限往返、下载取消、签名覆盖安装，以及真实 OTA 下载/重启必须在包含这些模块的 release build 中实机验证；Expo Go 不能代替该验证。

参考：https://docs.expo.dev/versions/v57.0.0/sdk/updates/
