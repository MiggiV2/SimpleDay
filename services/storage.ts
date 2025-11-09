// Simple in-memory storage for settings (no native modules required)
// For a production app, this should be replaced with persistent storage

interface Storage {
  [key: string]: string;
}

class SimpleStorage {
  private storage: Storage = {};

  async getItem(key: string): Promise<string | null> {
    return this.storage[key] || null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.storage[key] = value;
  }

  async removeItem(key: string): Promise<void> {
    delete this.storage[key];
  }
}

export const storage = new SimpleStorage();
