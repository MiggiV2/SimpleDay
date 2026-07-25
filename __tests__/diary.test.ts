// SPDX-License-Identifier: GPL-3.0-only
jest.mock('expo-file-system', () => require('./helpers/fakeFileSystem').createFakeFileSystem());

import { diary } from '../services/diary';

const DIARY_DIR = 'file:///doc/diary';

let files: Map<string, string>;
let dirs: Set<string>;

/** Writes a file the way an older app version would have written it. */
function seedLegacy(filename: string, content: string) {
  dirs.add(DIARY_DIR);
  files.set(`${DIARY_DIR}/${filename}`, content);
}

function read(filename: string) {
  return files.get(`${DIARY_DIR}/${filename}`);
}

beforeEach(() => {
  const fs = require('expo-file-system');
  files = fs.__files;
  dirs = fs.__dirs;
  files.clear();
  dirs.clear();
});

describe('diary: reading legacy entries', () => {
  it('derives the title from the filename when there is no front matter', async () => {
    seedLegacy('2026-07-20_Summer trip.md', 'It was hot.');

    const entry = await diary.read('2026-07-20_Summer trip.md');

    expect(entry).toEqual({
      filename: '2026-07-20_Summer trip.md',
      date: '2026-07-20',
      title: 'Summer trip',
      body: 'It was hot.',
    });
  });

  it('keeps the legacy underscore-to-space title rendering', async () => {
    seedLegacy('2026-07-20_Summer_trip.md', 'x');

    await expect(diary.read('2026-07-20_Summer_trip.md')).resolves.toMatchObject({
      title: 'Summer trip',
    });
  });

  it('falls back to Untitled for a filename without a title part', async () => {
    seedLegacy('2026-07-20.md', 'x');

    await expect(diary.read('2026-07-20.md')).resolves.toMatchObject({
      date: '2026-07-20',
      title: 'Untitled',
    });
  });

  it('does not mistake a leading markdown rule for front matter', async () => {
    seedLegacy('2026-07-20_Rule.md', '---\n\nSome text\n\n---\n');

    await expect(diary.read('2026-07-20_Rule.md')).resolves.toMatchObject({
      title: 'Rule',
      body: '---\n\nSome text\n\n---\n',
    });
  });
});

describe('diary: front matter', () => {
  it('reads the title from front matter and strips it from the body', async () => {
    seedLegacy('2026-07-20_old-name.md', '---\ntitle: "Real Title"\n---\n\nBody text\n');

    await expect(diary.read('2026-07-20_old-name.md')).resolves.toMatchObject({
      title: 'Real Title',
      body: 'Body text\n',
    });
  });

  it('round-trips a title containing underscores, quotes and colons', async () => {
    const title = 'snake_case: "quoted" \\ backslash';

    const { filename } = await diary.save({ date: '2026-07-21', title, body: 'b' });

    await expect(diary.read(filename)).resolves.toMatchObject({ title, body: 'b' });
  });

  it('writes front matter for new entries', async () => {
    const { filename } = await diary.save({ date: '2026-07-21', title: 'Hello', body: 'World' });

    expect(read(filename)).toBe('---\ntitle: "Hello"\n---\n\nWorld');
  });
});

describe('diary: saving', () => {
  it('names a new entry DATE_title.md', async () => {
    const { filename, renamedFrom } = await diary.save({
      date: '2026-07-21',
      title: 'My Day',
      body: 'b',
    });

    expect(filename).toBe('2026-07-21_My Day.md');
    expect(renamedFrom).toBeUndefined();
  });

  it('strips filesystem-unsafe characters from the filename but not from the title', async () => {
    const { filename } = await diary.save({
      date: '2026-07-21',
      title: 'a/b:c*d?e"f<g>h|i',
      body: 'b',
    });

    expect(filename).toBe('2026-07-21_a_b_c_d_e_f_g_h_i.md');
    await expect(diary.read(filename)).resolves.toMatchObject({ title: 'a/b:c*d?e"f<g>h|i' });
  });

  it('migrates a legacy entry in place when the title is unchanged', async () => {
    seedLegacy('2026-07-20_Summer trip.md', 'It was hot.');
    const existing = await diary.read('2026-07-20_Summer trip.md');

    const { filename, renamedFrom } = await diary.save({
      filename: existing.filename,
      date: existing.date,
      title: existing.title,
      body: existing.body,
    });

    expect(filename).toBe('2026-07-20_Summer trip.md');
    expect(renamedFrom).toBeUndefined();
    expect(read(filename)).toContain('title: "Summer trip"');
    expect(files.size).toBe(1);
  });

  it('keeps a legacy filename whose underscores only render as spaces', async () => {
    seedLegacy('2026-07-20_Summer_trip.md', 'It was hot.');
    const existing = await diary.read('2026-07-20_Summer_trip.md');

    const { filename, renamedFrom } = await diary.save({
      filename: existing.filename,
      date: existing.date,
      title: existing.title,
      body: existing.body,
    });

    expect(filename).toBe('2026-07-20_Summer_trip.md');
    expect(renamedFrom).toBeUndefined();
    expect(files.size).toBe(1);
  });

  it('reports the old filename and removes it when the title changes', async () => {
    seedLegacy('2026-07-20_Old.md', 'body');

    const { filename, renamedFrom } = await diary.save({
      filename: '2026-07-20_Old.md',
      date: '2026-07-20',
      title: 'New',
      body: 'body',
    });

    expect(filename).toBe('2026-07-20_New.md');
    expect(renamedFrom).toBe('2026-07-20_Old.md');
    expect(read('2026-07-20_Old.md')).toBeUndefined();
    expect(read('2026-07-20_New.md')).toContain('body');
  });

  it('never overwrites a different entry that already owns the target filename', async () => {
    await diary.save({ date: '2026-07-21', title: 'Same', body: 'first' });

    const { filename } = await diary.save({ date: '2026-07-21', title: 'Same', body: 'second' });

    expect(filename).toBe('2026-07-21_Same-2.md');
    await expect(diary.read('2026-07-21_Same.md')).resolves.toMatchObject({ body: 'first' });
  });

  it('falls back to untitled when the title is blank', async () => {
    const { filename } = await diary.save({ date: '2026-07-21', title: '   ', body: 'b' });

    expect(filename).toBe('2026-07-21_untitled.md');
  });
});

describe('diary: listing', () => {
  it('lists entries newest first with a plain-text preview', async () => {
    seedLegacy('2026-07-19_Older.md', '# Heading\n\n*emphasis* text');
    seedLegacy('2026-07-22_Newer.md', '---\ntitle: "Newer"\n---\n\nplain body');

    const entries = await diary.list();

    expect(entries.map(e => e.filename)).toEqual(['2026-07-22_Newer.md', '2026-07-19_Older.md']);
    expect(entries[0].preview).toBe('plain body');
    expect(entries[1].preview).toBe('Heading\n\nemphasis text');
  });

  it('caps the preview at 100 characters', async () => {
    seedLegacy('2026-07-19_Long.md', 'x'.repeat(500));

    const [entry] = await diary.list();

    expect(entry.preview).toHaveLength(100);
  });

  it('ignores non-markdown files', async () => {
    seedLegacy('2026-07-19_Entry.md', 'a');
    seedLegacy('notes.txt', 'b');

    await expect(diary.list()).resolves.toHaveLength(1);
  });

  it('returns an empty list and creates the directory on first run', async () => {
    await expect(diary.list()).resolves.toEqual([]);
    expect(dirs.has(DIARY_DIR)).toBe(true);
  });
});

describe('diary: deleting', () => {
  it('removes a single entry', async () => {
    seedLegacy('2026-07-19_Entry.md', 'a');

    await diary.remove('2026-07-19_Entry.md');

    expect(files.size).toBe(0);
  });

  it('wipes every markdown entry and reports the count', async () => {
    seedLegacy('2026-07-19_A.md', 'a');
    seedLegacy('2026-07-20_B.md', 'b');
    seedLegacy('keep.txt', 'c');

    await expect(diary.wipeAll()).resolves.toBe(2);
    expect([...files.keys()]).toEqual([`${DIARY_DIR}/keep.txt`]);
  });

  it('reports zero when there is nothing to wipe', async () => {
    await expect(diary.wipeAll()).resolves.toBe(0);
  });
});
