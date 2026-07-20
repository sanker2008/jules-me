# Jules Workspace (julesme) 👋

Welcome to **Jules Workspace**, an Expo-based React Native application designed to communicate seamlessly with the Jules API. This app allows you to connect to various codebases, start chatting with the AI agent, and manage your sessions directly from your mobile device or web browser.

## Features

- 💬 **Interactive AI Chat**: Start sessions with Jules with or without binding to a specific codebase.
- 🔄 **Real-time Polling**: Automatically polls for agent activity and updates the chat UI.
- 💾 **Secure Key Storage**: API keys are securely persisted on the device using `expo-secure-store`.
- 📁 **File-based Routing**: Built using `expo-router` for a clean, maintainable architecture.
- 🤖 **Automated CI/CD**: Integrated GitHub Actions for automatic Android APK building and releasing.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npx expo start
```

You can open the app on an Android emulator, an iOS simulator, or scan the QR code with the Expo Go app on your physical device.

## Usage

1. Open the app and navigate to the **Settings (⚙️)** in the Menu view.
2. Enter your **Jules API Key** and save it.
3. The app will fetch your available codebases and recent sessions.
4. Click "+ Start Empty Session" or select a codebase to begin chatting with Jules.

## Building the Android APK (CI/CD)

This project is configured with GitHub Actions to automatically build and release an Android APK.

### How to trigger a build:

1. **Via Tag (Recommended):**
   Push a new Git tag starting with `v` (e.g., `v1.0.0`) or a version number (e.g., `1.0.0`) to your repository.
   ```bash
   git tag v1.0.0 # or 1.0.0
   git push origin v1.0.0 # or 1.0.0
   ```
   *Alternatively, you can create a new release on GitHub and create the tag from the UI.*

2. **Manual Trigger:**
   Go to the **Actions** tab on your GitHub repository page. Select the **Build and Release Android APK** workflow, and click the **Run workflow** button.

Once the workflow completes (usually takes about 5-10 minutes), the built `app-release.apk` will be attached to the GitHub Release and can also be downloaded from the workflow artifacts.

## Tech Stack

- [Expo](https://expo.dev/)
- [React Native](https://reactnative.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- TypeScript
