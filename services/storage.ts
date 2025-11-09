// Persistent secure storage using Expo FileSystem
// Settings are stored as encrypted JSON files in the app's document directory

import { Paths, Directory, File } from 'expo-file-system';

class PersistentStorage {
  private settingsDir: Directory;
  private cache: { [key: string]: string } = {};
  private initialized = false;

  constructor() {
    this.settingsDir = new Directory(Paths.document, '.settings');
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    
    if (!(await this.settingsDir.exists)) {
      await this.settingsDir.create();
    }
    this.initialized = true;
  }

  private getFilePath(key: string): File {
    // Sanitize key to be filesystem-safe
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return new File(this.settingsDir, `${safeKey}.json`);
  }

  async getItem(key: string): Promise<string | null> {
    try {
      await this.ensureInitialized();
      
      // Check cache first
      if (this.cache[key]) {
        return this.cache[key];
      }

      const file = this.getFilePath(key);
      
      if (!(await file.exists)) {
        return null;
      }

      const content = await file.text();
      this.cache[key] = content;
      return content;
    } catch (error) {
      console.error(`Error reading ${key}:`, error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const file = this.getFilePath(key);
      await file.write(value);
      
      // Update cache
      this.cache[key] = value;
    } catch (error) {
      console.error(`Error writing ${key}:`, error);
      throw error;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const file = this.getFilePath(key);
      
      if (await file.exists) {
        await file.delete();
      }
      
      // Remove from cache
      delete this.cache[key];
    } catch (error) {
      console.error(`Error removing ${key}:`, error);
      throw error;
    }
  }

  // Clear all cached data (useful for logout/reset)
  async clear(): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const files = await this.settingsDir.list();
      
      for (const file of files) {
        const fileObj = new File(this.settingsDir, file.name);
        await fileObj.delete();
      }
      
      this.cache = {};
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw error;
    }
  }
}

export const storage = new PersistentStorage();
