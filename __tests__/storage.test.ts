// SPDX-License-Identifier: GPL-3.0-only
// The persistent storage is exercised against an in-memory fake of
// expo-file-system, so no native module or real disk access is involved.

jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  class Directory {
    uri: string;

    constructor(parent: string | { uri: string }, name: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = `${base.replace(/\/$/, '')}/${name}`;
    }

    get exists() {
      return dirs.has(this.uri);
    }

    create() {
      dirs.add(this.uri);
    }

    list() {
      return [...files.keys()]
        .filter(uri => uri.startsWith(`${this.uri}/`))
        .map(uri => ({ uri, name: uri.slice(this.uri.length + 1) }));
    }
  }

  class File {
    uri: string;
    name: string;

    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
      this.name = name;
    }

    get exists() {
      return files.has(this.uri);
    }

    text() {
      return files.get(this.uri);
    }

    write(value: string) {
      files.set(this.uri, value);
    }

    delete() {
      files.delete(this.uri);
    }
  }

  return { Paths: { document: 'file:///doc' }, Directory, File, __files: files, __dirs: dirs };
});

const SETTINGS_DIR = 'file:///doc/.settings';

let storage: typeof import('../services/storage').storage;
let files: Map<string, string>;
let dirs: Set<string>;

beforeEach(() => {
  jest.resetModules();
  const fs = require('expo-file-system');
  files = fs.__files;
  dirs = fs.__dirs;
  files.clear();
  dirs.clear();
  storage = require('../services/storage').storage;
});

describe('storage: read and write', () => {
  it('creates the settings directory lazily on first access', async () => {
    expect(dirs.has(SETTINGS_DIR)).toBe(false);

    await storage.setItem('a', '1');

    expect(dirs.has(SETTINGS_DIR)).toBe(true);
  });

  it('round-trips a value', async () => {
    await storage.setItem('webdav_config', '{"enabled":true}');

    await expect(storage.getItem('webdav_config')).resolves.toBe('{"enabled":true}');
  });

  it('returns null for an unknown key', async () => {
    await expect(storage.getItem('nope')).resolves.toBeNull();
  });

  it('overwrites an existing value', async () => {
    await storage.setItem('k', 'old');
    await storage.setItem('k', 'new');

    await expect(storage.getItem('k')).resolves.toBe('new');
  });

  it('stores each key in its own JSON file', async () => {
    await storage.setItem('one', '1');
    await storage.setItem('two', '2');

    expect([...files.keys()].sort()).toEqual([
      `${SETTINGS_DIR}/one.json`,
      `${SETTINGS_DIR}/two.json`,
    ]);
  });
});

describe('storage: key sanitizing', () => {
  it('replaces filesystem-unsafe characters', async () => {
    await storage.setItem('../etc/passwd', 'x');

    expect([...files.keys()]).toEqual([`${SETTINGS_DIR}/___etc_passwd.json`]);
  });

  it('keeps alphanumerics, underscore and dash', async () => {
    await storage.setItem('last_sync-time2', 'x');

    expect([...files.keys()]).toEqual([`${SETTINGS_DIR}/last_sync-time2.json`]);
  });
});

describe('storage: delete', () => {
  it('removes a single key', async () => {
    await storage.setItem('k', 'v');

    await storage.removeItem('k');

    expect(files.size).toBe(0);
    await expect(storage.getItem('k')).resolves.toBeNull();
  });

  it('ignores removing a key that does not exist', async () => {
    await expect(storage.removeItem('ghost')).resolves.toBeUndefined();
  });

  it('clears every stored key', async () => {
    await storage.setItem('a', '1');
    await storage.setItem('b', '2');

    await storage.clear();

    expect(files.size).toBe(0);
    await expect(storage.getItem('a')).resolves.toBeNull();
  });
});
