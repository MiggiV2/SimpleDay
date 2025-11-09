import { storage } from './storage';
import { crypto } from './crypto';
import { Paths, Directory, File } from 'expo-file-system';

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string; // Stored encrypted
  enabled: boolean;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  errors: string[];
}

class WebDAVService {
  private async getConfig(): Promise<WebDAVConfig | null> {
    try {
      const configStr = await storage.getItem('webdav_config');
      if (!configStr) return null;
      
      const config: WebDAVConfig = JSON.parse(configStr);
      if (!config.enabled || !config.url) return null;
      
      return config;
    } catch (error) {
      console.error('Error getting WebDAV config:', error);
      return null;
    }
  }

  private getAuthHeader(config: WebDAVConfig): string {
    // Decrypt password for authentication
    const plainPassword = config.password ? crypto.decrypt(config.password) : '';
    return 'Basic ' + btoa(config.username + ':' + plainPassword);
  }

  async uploadFile(filename: string): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return false;

    try {
      const diaryDir = new Directory(Paths.document, 'diary');
      const file = new File(diaryDir, filename);
      
      if (!(await file.exists)) {
        console.warn(`File ${filename} does not exist locally`);
        return false;
      }

      const content = await file.text();
      const uploadUrl = config.url.endsWith('/') ? config.url + filename : `${config.url}/${filename}`;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': this.getAuthHeader(config),
          'Content-Type': 'text/markdown',
        },
        body: content,
      });

      if (!response.ok && response.status !== 201 && response.status !== 204) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(`Error uploading file ${filename}:`, error);
      return false;
    }
  }

  async deleteFile(filename: string): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return false;

    try {
      const deleteUrl = config.url.endsWith('/') ? config.url + filename : `${config.url}/${filename}`;

      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': this.getAuthHeader(config),
        },
      });

      if (!response.ok && response.status !== 204 && response.status !== 404) {
        throw new Error(`Delete failed: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(`Error deleting file ${filename}:`, error);
      return false;
    }
  }

  async syncAfterSave(filename: string): Promise<void> {
    const configured = await this.isConfigured();
    if (!configured) return;

    // Sync in background
    this.uploadFile(filename).then(success => {
      if (success) {
        // Update last sync time
        storage.setItem('last_sync_time', new Date().toISOString()).catch(error => {
          console.error('Failed to update sync time:', error);
        });
      }
    }).catch(error => {
      console.error('Background sync failed:', error);
    });
  }

  async syncAfterDelete(filename: string): Promise<void> {
    const configured = await this.isConfigured();
    if (!configured) return;

    // Delete from WebDAV in background
    this.deleteFile(filename).then(success => {
      if (success) {
        // Update last sync time
        storage.setItem('last_sync_time', new Date().toISOString()).catch(error => {
          console.error('Failed to update sync time:', error);
        });
      }
    }).catch(error => {
      console.error('Background delete failed:', error);
    });
  }

  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return config !== null;
  }
}

export const webdavService = new WebDAVService();
