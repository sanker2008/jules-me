# Changelog

All notable changes to JulesMe are documented in this file.

## [Unreleased]

### Added

- **Pro Client Foundation**: Added encrypted local license state, monthly expiry fallback, a global Pro provider, a settings activation card, and a dual-plan native paywall sheet.
- **Pro License Regression Coverage**: Added unit tests for expired monthly licenses, perpetual licenses, malformed cached state, and license-key masking.

### Documentation

- Recorded the Phase 1 implementation boundary, verification evidence, and server-side prerequisites in `docs/PRO_IMPLEMENTATION_STATUS.md`.

### Fixed

- Synchronized `package-lock.json` with the Expo 57 dependency tree so GitHub Actions can complete its reproducible `npm ci` install.

## [1.1.7] - 2026-08-27

### Added

- **Syntax-Colored Git Diff Viewer**: Unidiff patches are rendered line-by-line with color highlighting (`+` green, `-` red, `@@` hunk headers) and a 1-tap "Copy Diff" button with clipboard confirmation.
- **Image Fullscreen Lightbox Modal**: Tap any image in chat bubbles, task summaries, or artifacts to inspect full-resolution screenshots with zoom/dismissal.
- **Quick Action Prompt Chips**: Contextual quick action pills above the composer ("Fix error", "Add tests", "Optimize & refactor", "Explain logic") for effortless mobile input.
- **1-Tap Message & Output Copy**: Added instant copy actions for agent responses and command output logs.
- **Real-Time Session Search**: Search and filter sessions on the home screen by prompt, title, or repository name.
- **Multi-Page Sync & Image Parsing**: Added `getAllActivities` multi-page activity synchronization and inline image attachment parsing.

### Fixed

- Resolved session entry view positioning to automatically display and scroll to the latest conversation rather than the first message.
- Removed unwanted scroll-to-top behavior for completed and failed session states.

## [1.1.5] - 2026-08-11

### Added

- Added capability to send messages to active terminal sessions in chat.

## [1.1.4] - 2026-08-02

### Added

- Dedicated Settings screen at `/settings` for API key, theme selection, language, and about info.
- Official brand Jules logo integrated into navigation headers, splash screen, and settings.

### Fixed

- Fixed dark mode theme colors so screens, text, inputs, cards, and pills update dynamically.
- Synchronized native mobile status bar background and icon contrast for light and dark modes.
- Eliminated modal popup flickering during settings option selection.

## [1.1.1] - 2026-07-27

### Changed

- Published the complete 1.1.x codebase and refreshed product documentation and web configuration.

## [1.1.0] - 2026-07-27

### Added

- Image attachment validation with a 5 MiB limit and GIF, JPEG, PNG, and WebP support.
- Regression coverage for route parameters, Jules resource identifiers, pull request links, and image attachments.

### Changed

- Updated iOS and Android build metadata for version 1.1.0.
- Completed Simplified Chinese, Traditional Chinese, and English text for image attachment feedback and release notes.

### Fixed

- Validate and encode deep-link and Jules API resource identifiers before using them in requests.
- Allow only HTTPS GitHub pull request URLs to be opened from task results.
- Removed the unavailable OTA update entry from the application information screen.
