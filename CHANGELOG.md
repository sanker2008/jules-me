# Changelog

All notable changes to JulesMe are documented in this file.

## [Unreleased]

## [1.1.13] - 2026-09-04

### Changed

- Redesigned the UI with a clean flat, zero-border-radius style across workbench, chat timeline, settings, and modal components.
- Removed nested card enclosures, pills, and elevation/drop shadows in favor of subtle flat surfaces and hairline dividers.
- Advanced the Expo version to `1.1.13`, iOS build number to `23`, and Android version code to `23`.

## [1.1.12] - 2026-09-02

### Fixed

- Made APK certificate verification accept both legacy and signature-scheme-qualified `apksigner` output while continuing to reject missing, debug, or mismatched signers.

### Changed

- Advanced the Expo version to `1.1.12`, iOS build number to `22`, and Android version code to `22` after the failed `1.1.11` APK verification attempt.

## [1.1.11] - 2026-09-02

### Fixed

- Regenerated the npm lockfile with the GitHub runner's npm 10 line so clean CI installs include the required Emscripten N-API peer packages.
- Replaced the legacy blue native splash background with the JulesMe brand purple while retaining the centered app logo.

### Changed

- Advanced the Expo version to `1.1.11`, iOS build number to `21`, and Android version code to `21` after the failed `1.1.10` build attempt.

## [1.1.10] - 2026-09-02

### Security

- Split Android release signing into an offline-generated app-signing key for GitHub Release APKs and a separate upload key for Google Play AAB submissions.
- Required both Android package jobs to use the protected `android-release` GitHub Environment and pinned each artifact to its intended certificate SHA-256 fingerprint.

### Changed

- Advanced the Expo version to `1.1.10`, iOS build number to `20`, and Android version code to `20`.
- Aligned Expo SDK 57 patch dependencies with the current versioned compatibility set enforced by Expo Doctor.
- Pinned the patched Browserslist 4.x line to clear newly disclosed high-severity audit findings without forcing an Expo downgrade.

## [1.1.9] - 2026-08-31

### Added

- **Pro Client Foundation**: Added encrypted local license state, monthly expiry fallback, a global Pro provider, a settings activation card, and a dual-plan native paywall sheet.
- **Regression Coverage**: Added tests for non-overlapping incremental polling, request timeouts, strict license contracts, release metadata, and Android signing configuration.

### Documentation

- Recorded the Phase 1 implementation boundary, verification evidence, and server-side prerequisites in `docs/PRO_IMPLEMENTATION_STATUS.md`.

### Fixed

- Upgraded the Expo 57 dependency line and React Native patch release, then synchronized the npm lockfile.
- Replaced full-history request loops with delayed, cancellable incremental activity polling and explicit Jules API timeouts.
- Hardened Pro activation against malformed responses, mismatched License Keys, dead endpoints, timeouts, and secure-storage failures.
- Replaced placeholder platform icons and the anonymous Android application ID with JulesMe release metadata.
- Required secret-backed Android release signing and certificate verification; debug-signed release artifacts are rejected.

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
