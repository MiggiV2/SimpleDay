// SPDX-License-Identifier: GPL-3.0-only
jest.mock('expo-file-system', () => require('./helpers/fakeFileSystem').createFakeFileSystem());

jest.mock('../services/storage', () => {
  const items: Record<string, string> = {};
  return {
    __items: items,
    storage: {
      getItem: jest.fn(async (key: string) => items[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        items[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete items[key];
      }),
    },
  };
});

jest.mock('../services/crypto', () => ({
  crypto: {
    getPassword: jest.fn(async () => 'pw'),
    getEncryptionKey: jest.fn(async () => 'the-key'),
    encryptContent: jest.fn(async (content: string) => `ENC(${content})`),
    decryptContent: jest.fn(async (content: string) => content.replace(/^ENC\(|\)$/g, '')),
  },
}));

import { webdavService, WebDAVConfig } from '../services/webdav';

const DIARY_DIR = 'file:///doc/diary';
const AUTH = `Basic ${btoa('user:pw')}`;

let files: Map<string, string>;
let dirs: Set<string>;
let items: Record<string, string>;
let fetchMock: jest.Mock;

function configure(overrides: Partial<WebDAVConfig> = {}) {
  items.webdav_config = JSON.stringify({
    url: 'https://dav.example.com/diary',
    username: 'user',
    password: '',
    enabled: true,
    encryptionEnabled: false,
    ...overrides,
  });
}

function seedLocal(filename: string, content: string) {
  dirs.add(DIARY_DIR);
  files.set(`${DIARY_DIR}/${filename}`, content);
}

function ok(body = '', status = 200) {
  return { ok: true, status, text: async () => body };
}

function propfindBody(hrefs: string[]) {
  return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${hrefs
    .map(href => `<d:response><d:href>${href}</d:href></d:response>`)
    .join('')}</d:multistatus>`;
}

beforeEach(() => {
  const fs = require('expo-file-system');
  files = fs.__files;
  dirs = fs.__dirs;
  files.clear();
  dirs.clear();
  items = require('../services/storage').__items;
  Object.keys(items).forEach(key => delete items[key]);
  fetchMock = jest.fn(async () => ok());
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('webdav: configuration', () => {
  it('is not configured without a stored config', async () => {
    await expect(webdavService.isConfigured()).resolves.toBe(false);
  });

  it('is not configured while sync is disabled', async () => {
    configure({ enabled: false });

    await expect(webdavService.isConfigured()).resolves.toBe(false);
  });

  it('is not configured without a URL', async () => {
    configure({ url: '' });

    await expect(webdavService.isConfigured()).resolves.toBe(false);
  });

  it('ignores a malformed config instead of throwing', async () => {
    items.webdav_config = 'not json';

    await expect(webdavService.isConfigured()).resolves.toBe(false);
  });
});

describe('webdav: upload', () => {
  it('PUTs the file with basic auth', async () => {
    configure();
    seedLocal('2026-07-20_A.md', 'hello');

    await expect(webdavService.uploadFile('2026-07-20_A.md')).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://dav.example.com/diary/2026-07-20_A.md');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe(AUTH);
    expect(init.headers['Content-Type']).toBe('text/markdown');
    expect(init.body).toBe('hello');
  });

  it('does not double the slash when the URL ends with one', async () => {
    configure({ url: 'https://dav.example.com/diary/' });
    seedLocal('a.md', 'x');

    await webdavService.uploadFile('a.md');

    expect(fetchMock.mock.calls[0][0]).toBe('https://dav.example.com/diary/a.md');
  });

  it('URL-encodes the filename', async () => {
    configure();
    seedLocal('2026-07-20_A B.md', 'x');

    await webdavService.uploadFile('2026-07-20_A B.md');

    expect(fetchMock.mock.calls[0][0]).toBe('https://dav.example.com/diary/2026-07-20_A%20B.md');
  });

  it('encrypts the body and appends .enc when encryption is on', async () => {
    configure({ encryptionEnabled: true });
    seedLocal('a.md', 'secret');

    await webdavService.uploadFile('a.md');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://dav.example.com/diary/a.md.enc');
    expect(init.headers['Content-Type']).toBe('application/octet-stream');
    expect(init.body).toBe('ENC(secret)');
  });

  it('fails when the local file is missing', async () => {
    configure();

    await expect(webdavService.uploadFile('missing.md')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails on a server error', async () => {
    configure();
    seedLocal('a.md', 'x');
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => '' });

    await expect(webdavService.uploadFile('a.md')).resolves.toBe(false);
  });
});

describe('webdav: delete', () => {
  it('DELETEs the remote file', async () => {
    configure();

    await expect(webdavService.deleteFile('a.md')).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://dav.example.com/diary/a.md');
    expect(init.method).toBe('DELETE');
  });

  it('targets the .enc file when encryption is on', async () => {
    configure({ encryptionEnabled: true });

    await webdavService.deleteFile('a.md');

    expect(fetchMock.mock.calls[0][0]).toBe('https://dav.example.com/diary/a.md.enc');
  });

  it('treats a missing remote file as success', async () => {
    configure();
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    await expect(webdavService.deleteFile('a.md')).resolves.toBe(true);
  });
});

describe('webdav: listing remote files', () => {
  it('extracts and decodes markdown filenames', async () => {
    configure();
    fetchMock.mockResolvedValue(
      ok(propfindBody(['/diary/', '/diary/2026-07-20_A%20B.md', '/diary/notes.txt']), 207)
    );

    await expect(webdavService.listRemoteFiles()).resolves.toEqual(['2026-07-20_A B.md']);
    expect(fetchMock.mock.calls[0][1].method).toBe('PROPFIND');
  });

  it('strips the .enc suffix when encryption is on', async () => {
    configure({ encryptionEnabled: true });
    fetchMock.mockResolvedValue(ok(propfindBody(['/diary/a.md.enc', '/diary/plain.md']), 207));

    await expect(webdavService.listRemoteFiles()).resolves.toEqual(['a.md']);
  });

  it('returns an empty list when the server errors', async () => {
    configure();
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '' });

    await expect(webdavService.listRemoteFiles()).resolves.toEqual([]);
  });
});

describe('webdav: download', () => {
  it('writes the decrypted content under the plain filename', async () => {
    configure({ encryptionEnabled: true });
    fetchMock.mockResolvedValue(ok('ENC(hello)'));

    await expect(webdavService.downloadFile('a.md')).resolves.toBe(true);

    expect(fetchMock.mock.calls[0][0]).toBe('https://dav.example.com/diary/a.md.enc');
    expect(files.get(`${DIARY_DIR}/a.md`)).toBe('hello');
  });

  it('does not write anything when decryption fails', async () => {
    configure({ encryptionEnabled: true });
    const { crypto } = require('../services/crypto');
    crypto.decryptContent.mockRejectedValueOnce(new Error('Failed to decrypt content'));
    fetchMock.mockResolvedValue(ok('garbage'));

    await expect(webdavService.downloadFile('a.md')).resolves.toBe(false);
    expect(files.size).toBe(0);
  });
});

describe('webdav: sync after rename', () => {
  it('uploads the new name and only then deletes the old one', async () => {
    configure();
    seedLocal('2026-07-20_New.md', 'body');

    await webdavService.syncAfterRename('2026-07-20_Old.md', '2026-07-20_New.md');

    const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`);
    expect(calls).toEqual([
      'PUT https://dav.example.com/diary/2026-07-20_New.md',
      'DELETE https://dav.example.com/diary/2026-07-20_Old.md',
    ]);
  });

  it('keeps the old remote file when the upload fails', async () => {
    configure();
    seedLocal('2026-07-20_New.md', 'body');
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => '' });

    await webdavService.syncAfterRename('2026-07-20_Old.md', '2026-07-20_New.md');

    const methods = fetchMock.mock.calls.map(([, init]) => init.method);
    expect(methods).not.toContain('DELETE');
  });

  it('does nothing when WebDAV is not configured', async () => {
    await webdavService.syncAfterRename('a.md', 'b.md');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('webdav: sync status', () => {
  it('reports files that exist on only one side', async () => {
    configure();
    seedLocal('local-only.md', 'x');
    seedLocal('both.md', 'x');
    fetchMock.mockResolvedValue(
      ok(propfindBody(['/diary/both.md', '/diary/remote-only.md']), 207)
    );

    await expect(webdavService.checkSyncStatus()).resolves.toEqual({
      inSync: false,
      localOnly: ['local-only.md'],
      remoteOnly: ['remote-only.md'],
      total: { local: 2, remote: 2 },
    });
  });

  it('reports in-sync when both sides match', async () => {
    configure();
    seedLocal('both.md', 'x');
    fetchMock.mockResolvedValue(ok(propfindBody(['/diary/both.md']), 207));

    await expect(webdavService.checkSyncStatus()).resolves.toMatchObject({ inSync: true });
  });
});
