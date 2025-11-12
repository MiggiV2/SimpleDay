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
      const encodedFilename = encodeURIComponent(filename);
      const uploadUrl = config.url.endsWith('/') ? config.url + encodedFilename : `${config.url}/${encodedFilename}`;

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
      const encodedFilename = encodeURIComponent(filename);
      const deleteUrl = config.url.endsWith('/') ? config.url + encodedFilename : `${config.url}/${encodedFilename}`;

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

  async downloadFile(filename: string): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return false;

    try {
      const encodedFilename = encodeURIComponent(filename);
      const downloadUrl = config.url.endsWith('/') ? config.url + encodedFilename : `${config.url}/${encodedFilename}`;

      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(config),
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const content = await response.text();
      
      const diaryDir = new Directory(Paths.document, 'diary');
      if (!(await diaryDir.exists)) {
        await diaryDir.create();
      }

      const file = new File(diaryDir, filename);
      await file.write(content);

      return true;
    } catch (error) {
      console.error(`Error downloading file ${filename}:`, error);
      return false;
    }
  }

  async listRemoteFiles(): Promise<string[]> {
    const config = await this.getConfig();
    if (!config) return [];

    try {
      const response = await fetch(config.url, {
        method: 'PROPFIND',
        headers: {
          'Authorization': this.getAuthHeader(config),
          'Depth': '1',
        },
      });

      if (!response.ok && response.status !== 207) {
        throw new Error(`Failed to list files: ${response.status}`);
      }

      const text = await response.text();
      
      // Parse XML to extract .md file names
      const fileMatches = text.match(/<d:href>([^<]+\.md)<\/d:href>/gi) || [];
      const files = fileMatches.map(match => {
        const href = match.replace(/<\/?d:href>/gi, '');
        const parts = href.split('/');
        const encodedName = parts[parts.length - 1] || '';
        // Decode URL-encoded filename
        return decodeURIComponent(encodedName);
      }).filter(name => name.endsWith('.md'));

      return files;
    } catch (error) {
      console.error('Error listing remote files:', error);
      return [];
    }
  }

  async importFromWebDAV(
    onProgress?: (current: number, total: number, filename: string) => void
  ): Promise<{ success: boolean; imported: number; errors: string[] }> {
    const config = await this.getConfig();
    if (!config) {
      return { success: false, imported: 0, errors: ['WebDAV not configured'] };
    }

    const result = { success: true, imported: 0, errors: [] as string[] };

    try {
      // List remote files
      const remoteFiles = await this.listRemoteFiles();
      
      if (remoteFiles.length === 0) {
        return { success: true, imported: 0, errors: ['No files found on WebDAV server'] };
      }

      // Get local files
      const diaryDir = new Directory(Paths.document, 'diary');
      if (!(await diaryDir.exists)) {
        await diaryDir.create();
      }

      const localFiles = (await diaryDir.list())
        .filter(f => f.name.endsWith('.md'))
        .map(f => f.name);

      // Get files to download
      const filesToDownload = remoteFiles.filter(f => !localFiles.includes(f));
      const total = filesToDownload.length;

      // Download files that are remote but not local
      for (let i = 0; i < filesToDownload.length; i++) {
        const filename = filesToDownload[i];
        
        if (onProgress) {
          onProgress(i + 1, total, filename);
        }
        
        const downloaded = await this.downloadFile(filename);
        if (downloaded) {
          result.imported++;
        } else {
          result.errors.push(`Failed to download ${filename}`);
        }
      }

      // Update last sync time
      if (result.imported > 0) {
        await storage.setItem('last_sync_time', new Date().toISOString());
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      console.error('Import error:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
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

  async checkSyncStatus(): Promise<{
    inSync: boolean;
    localOnly: string[];
    remoteOnly: string[];
    total: { local: number; remote: number };
  }> {
    const result = {
      inSync: true,
      localOnly: [] as string[],
      remoteOnly: [] as string[],
      total: { local: 0, remote: 0 },
    };

    const config = await this.getConfig();
    if (!config) {
      return result;
    }

    try {
      // Get local files
      const diaryDir = new Directory(Paths.document, 'diary');
      let localFiles: string[] = [];
      
      if (await diaryDir.exists) {
        const files = await diaryDir.list();
        localFiles = files
          .filter(f => f.name.endsWith('.md'))
          .map(f => f.name);
      }

      // Get remote files
      const remoteFiles = await this.listRemoteFiles();

      result.total.local = localFiles.length;
      result.total.remote = remoteFiles.length;

      // Find files only in local
      result.localOnly = localFiles.filter(f => !remoteFiles.includes(f));

      // Find files only in remote
      result.remoteOnly = remoteFiles.filter(f => !localFiles.includes(f));

      result.inSync = result.localOnly.length === 0 && result.remoteOnly.length === 0;

      return result;
    } catch (error) {
      console.error('Error checking sync status:', error);
      return result;
    }
  }

  async syncAllToWebDAV(): Promise<{ success: boolean; uploaded: number; errors: string[] }> {
    const config = await this.getConfig();
    if (!config) {
      return { success: false, uploaded: 0, errors: ['WebDAV not configured'] };
    }

    const result = { success: true, uploaded: 0, errors: [] as string[] };

    try {
      const diaryDir = new Directory(Paths.document, 'diary');
      if (!(await diaryDir.exists)) {
        return { success: true, uploaded: 0, errors: [] };
      }

      const files = await diaryDir.list();
      const mdFiles = files.filter(f => f.name.endsWith('.md'));

      for (const file of mdFiles) {
        const uploaded = await this.uploadFile(file.name);
        if (uploaded) {
          result.uploaded++;
        } else {
          result.errors.push(`Failed to upload ${file.name}`);
        }
      }

      if (result.uploaded > 0) {
        await storage.setItem('last_sync_time', new Date().toISOString());
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      console.error('Sync all error:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }
}

export const webdavService = new WebDAVService();
