# Changelog

All notable changes to SimpleDay will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-11-12

### Added
- **Startup Sync Check**: Automatically checks sync status when app starts with WebDAV enabled
- **Sync Status Dialog**: Smart prompt showing files that are out of sync (local-only vs remote-only)
- **Flexible Sync Options**: 
  - Upload local files to server
  - Download remote files to device
  - Sync both ways (bidirectional)
- **Batch Sync Operations**: Upload all local files or download all remote files
- **Progress Tracking**: Visual progress indicators for sync operations with file counts
- **Toast Notifications**: Non-intrusive success messages for sync operations

### Changed
- Improved sync error handling with detailed error messages
- Enhanced sync UI with modern card-based dialogs
- Updated WebDAV documentation with startup sync check details

### Fixed
- Better handling of sync conflicts and edge cases

## [1.0.0] - 2025-01-XX

### Added
- **Diary App**: Simple, elegant diary/journal application
- **Local-First Storage**: All entries stored locally using Expo FileSystem
- **Markdown Support**: Write entries with markdown formatting
- **WebDAV Sync**: Optional cloud sync via WebDAV
  - Enable/disable sync toggle
  - Connection verification
  - Automatic background sync after saving entries
  - Manual import from WebDAV
  - Secure password storage with XOR encryption
- **Daily Notifications**: Optional reminders to write diary entries
- **Entry Management**:
  - Create new entries
  - Edit existing entries
  - Date-based organization
  - Preview on list screen
- **Modern UI**:
  - Clean, minimal design
  - Dark mode support
  - Smooth animations
  - Progress indicators for imports
- **Settings Screen**:
  - WebDAV configuration
  - Notification settings
  - Last sync timestamp display

### Technical
- Built with Expo SDK 54
- React Native 0.81
- TypeScript support
- React Navigation 7
- Hermes JavaScript engine
- GPL v3 License
