import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { storage } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

class NotificationService {
  private notificationId: string | null = null;

  async requestPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('daily-reminder', {
        name: 'Daily Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return true;
  }

  async scheduleNotification(hour: number, minute: number): Promise<void> {
    await this.cancelNotification();

    const trigger: Notifications.DailyTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: Platform.OS === 'android' ? 'daily-reminder' : undefined,
    };

    this.notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Time to write in your diary! 📝",
        body: "Take a moment to reflect on your day.",
        data: { screen: 'new-entry' },
      },
      trigger,
    });

    await storage.setItem('notification_id', this.notificationId);
  }

  async cancelNotification(): Promise<void> {
    if (!this.notificationId) {
      this.notificationId = await storage.getItem('notification_id');
    }

    if (this.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(this.notificationId);
      this.notificationId = null;
      await storage.removeItem('notification_id');
    }
  }

  async saveSettings(settings: NotificationSettings): Promise<boolean> {
    await storage.setItem('notification_settings', JSON.stringify(settings));

    if (settings.enabled) {
      const hasPermission = await this.requestPermissions();
      if (hasPermission) {
        await this.scheduleNotification(settings.hour, settings.minute);
        return true;
      } else {
        return false;
      }
    } else {
      await this.cancelNotification();
      return true;
    }
  }

  async loadSettings(): Promise<NotificationSettings> {
    const settingsStr = await storage.getItem('notification_settings');
    if (settingsStr) {
      return JSON.parse(settingsStr);
    }
    
    return {
      enabled: false,
      hour: 20,
      minute: 0,
    };
  }

  async getAllScheduledNotifications() {
    return await Notifications.getAllScheduledNotificationsAsync();
  }
}

export const notificationService = new NotificationService();
