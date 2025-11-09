# SimpleDay

A minimalistic diary app built with React Native and Expo, featuring Markdown support.

## Features

- 📝 Write daily diary entries with Markdown formatting
- 📅 Entries are organized by date
- 👀 Live preview of Markdown content
- 💾 Automatic file storage (DATE_title.md format)
- 🎨 Clean, modern, minimalistic design
- ✏️ Edit and delete entries
- 📱 Works on iOS, Android, and Web
- 🔔 Subtle toast notifications (no annoying alerts!)

## User Stories

- As a user, I can write down my thoughts and experiences every day
- When I open the app, I see a list of entries (one entry per day)
- I can add a new entry for today
- When writing an entry, I'm in editing mode with a title field and content area
- I can preview my Markdown content before saving
- I can edit existing entries
- I can delete entries I no longer need
- I get subtle feedback when saving without intrusive alerts

## Data Format

Entries are stored as Markdown files in the format: `DATE_title.md`
- Example: `2025-11-09_my_first_entry.md`
- Files are stored in the app's document directory under `diary/`

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Run on your preferred platform:
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Press `w` for web browser

## Project Structure

- `app/(tabs)/index.tsx` - Main diary list screen
- `app/entry.tsx` - Entry creation/editing screen
- `app/(tabs)/_layout.tsx` - Tab navigation layout

## Technologies Used

- React Native
- Expo Router
- Expo File System (v54+ with new Directory/File API)
- React Native Markdown Display
- TypeScript

## Markdown Support

The app supports standard Markdown features:
- Headers (# ## ###)
- Bold (**text**)
- Italic (*text*)
- Lists
- Code blocks
- Blockquotes
- And more!

Enjoy writing your daily thoughts! 📖✨
