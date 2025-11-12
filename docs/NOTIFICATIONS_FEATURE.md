# Daily Reminder Notifications

## Feature Overview
SimpleDay now supports daily reminder notifications to help you maintain your journaling habit.

## How to Use

1. **Enable Notifications**
   - Go to Settings tab
   - Toggle "Enable Daily Reminder" to ON
   - The app will request notification permissions if needed

2. **Set Your Reminder Time**
   - Tap on the time display to open the time picker
   - Select your preferred reminder time
   - The notification will repeat daily at this time

3. **Save Settings**
   - Tap "Save Settings" at the bottom
   - Your reminder is now active!

## What Happens

- At your chosen time each day, you'll receive a notification: "Time to write in your diary! 📝"
- Tapping the notification will open the app and create a new diary entry for today
- The notification repeats daily until you disable it

## Technical Details

- **Permissions**: The app requests notification permissions when you enable reminders
- **Platform Support**: Works on both iOS and Android
- **Scheduling**: Uses daily recurring notifications
- **Persistence**: Settings are saved locally and persist across app restarts

## Files Modified

- `services/notifications.ts` - New notification service
- `app/(tabs)/settings.tsx` - Added notification settings UI
- `app/_layout.tsx` - Added notification handling
- `app.json` - Added expo-notifications plugin configuration

## Dependencies Added

- `expo-notifications` - For scheduling and handling notifications
- `@react-native-community/datetimepicker` - For time selection UI
