# Changelog

All notable changes to JulesMe are documented in this file.

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
