# Changelog

All notable changes to JulesMe are documented in this file.

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
