// SPDX-License-Identifier: GPL-3.0-only
// Single access point for diary entries on disk.
//
// File layout: `YYYY-MM-DD_title.md` inside the app's `diary` directory.
// The title is additionally stored in a small YAML front matter block so it
// survives characters the filename cannot represent. Entries written by older
// app versions have no front matter — those are read with the title derived
// from the filename and are migrated in place the next time they are saved.

import { Paths, Directory, File } from 'expo-file-system';

export interface DiaryEntryMeta {
  filename: string;
  date: string;
  title: string;
  preview: string;
}

export interface DiaryEntry {
  filename: string;
  date: string;
  title: string;
  body: string;
}

export interface SaveResult {
  filename: string;
  /** Set when the entry was stored under a new filename and the old one was removed. */
  renamedFrom?: string;
}

const FORBIDDEN_FILENAME_CHARS = /[/\\:*?"<>|]/g;
// Trailing group swallows the blank line the serializer puts after the block.
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n){0,2}/;
const FRONT_MATTER_LINE = /^[A-Za-z][\w-]*:\s/;
const PREVIEW_LENGTH = 100;

/**
 * A date as `YYYY-MM-DD` in the device's timezone.
 *
 * Not `toISOString()`: that formats in UTC, so east of Greenwich the hours right
 * after local midnight still carry the previous date. An entry started at 00:30
 * in Berlin would be filed under yesterday — and, with one entry per day, would
 * reopen yesterday's entry instead of starting today's.
 */
export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * A stored `YYYY-MM-DD` entry date as a Date at local midnight, for display.
 *
 * The inverse problem to `localDateString`: `new Date('2026-07-31')` is parsed
 * as UTC midnight, so west of Greenwich it renders as the previous day and the
 * entry card shows the wrong weekday.
 */
export function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);

  return new Date(year, month - 1, day);
}

/** Title of a legacy entry, derived from `DATE_title.md`. */
export function titleFromFilename(filename: string): string {
  const parts = filename.replace(/\.md$/, '').split('_');
  return parts.slice(1).join('_').replace(/_/g, ' ') || 'Untitled';
}

export function dateFromFilename(filename: string): string {
  return filename.replace(/\.md$/, '').split('_')[0];
}

/**
 * Split a stored document into its front matter title and its body.
 * A leading `---` block is only treated as front matter when every line in it
 * looks like a `key: value` pair, so a markdown rule at the top of a legacy
 * entry is never swallowed.
 */
export function parseDocument(raw: string): { title: string | null; body: string } {
  const match = raw.match(FRONT_MATTER);
  if (!match) return { title: null, body: raw };

  const lines = match[1].split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0 || !lines.every(line => FRONT_MATTER_LINE.test(line))) {
    return { title: null, body: raw };
  }

  const titleLine = lines.find(line => line.startsWith('title:'));
  if (!titleLine) return { title: null, body: raw.slice(match[0].length) };

  return { title: unquote(titleLine.slice('title:'.length).trim()), body: raw.slice(match[0].length) };
}

export function serializeDocument(title: string, body: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}`;
}

function unquote(value: string): string {
  if (!value.startsWith('"')) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Whether a filename looks like one `freeFilename` handed out to avoid a
 * collision. A title genuinely ending in `-2` is indistinguishable, which only
 * affects which same-day entry is preferred.
 */
function hasDuplicateSuffix(filename: string): boolean {
  return /-\d+$/.test(filename.replace(/\.md$/, ''));
}

function toPreview(body: string): string {
  return body.substring(0, PREVIEW_LENGTH).replace(/[#*_`]/g, '').trim();
}

class DiaryService {
  private async dir(): Promise<Directory> {
    const diaryDir = new Directory(Paths.document, 'diary');
    if (!(await diaryDir.exists)) {
      await diaryDir.create();
    }
    return diaryDir;
  }

  private async markdownFiles(diaryDir: Directory): Promise<string[]> {
    const files = await diaryDir.list();
    return files.filter(file => file.name.endsWith('.md')).map(file => file.name);
  }

  /** All entries, newest first. */
  async list(): Promise<DiaryEntryMeta[]> {
    const diaryDir = await this.dir();
    const names = await this.markdownFiles(diaryDir);

    const entries = await Promise.all(
      names.map(async name => {
        const raw = await new File(diaryDir, name).text();
        const { title, body } = parseDocument(raw ?? '');
        return {
          filename: name,
          date: dateFromFilename(name),
          title: title ?? titleFromFilename(name),
          preview: toPreview(body),
        };
      })
    );

    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }

  async read(filename: string): Promise<DiaryEntry> {
    const diaryDir = await this.dir();
    const raw = (await new File(diaryDir, filename).text()) ?? '';
    const { title, body } = parseDocument(raw);

    return {
      filename,
      date: dateFromFilename(filename),
      title: title ?? titleFromFilename(filename),
      body,
    };
  }

  /**
   * Write an entry. Keeps the existing filename when the title is unchanged,
   * otherwise stores it under the new name and removes the old file. An
   * unrelated entry that already owns the target name is never overwritten.
   */
  async save(input: { filename?: string; date: string; title: string; body: string }): Promise<SaveResult> {
    const diaryDir = await this.dir();
    const title = input.title.trim() || 'untitled';
    const filename = this.keepsCurrentFilename(input.filename, input.date, title)
      ? (input.filename as string)
      : await this.freeFilename(diaryDir, input.date, title, input.filename);

    await new File(diaryDir, filename).write(serializeDocument(title, input.body));

    if (input.filename && input.filename !== filename) {
      const oldFile = new File(diaryDir, input.filename);
      if (await oldFile.exists) {
        await oldFile.delete();
      }
      return { filename, renamedFrom: input.filename };
    }

    return { filename };
  }

  /**
   * A legacy filename renders underscores as spaces, so `A_B.md` and `A B.md`
   * describe the same title. Keep the file where it is in that case instead of
   * renaming it — and with it the copy already on the WebDAV server.
   */
  private keepsCurrentFilename(filename: string | undefined, date: string, title: string): boolean {
    if (!filename) return false;
    return dateFromFilename(filename) === date && titleFromFilename(filename) === title;
  }

  private async freeFilename(
    diaryDir: Directory,
    date: string,
    title: string,
    currentFilename?: string
  ): Promise<string> {
    const base = `${date}_${title.replace(FORBIDDEN_FILENAME_CHARS, '_')}`;

    for (let suffix = 1; ; suffix++) {
      const candidate = suffix === 1 ? `${base}.md` : `${base}-${suffix}.md`;
      if (candidate === currentFilename) return candidate;
      if (!(await new File(diaryDir, candidate).exists)) return candidate;
    }
  }

  /**
   * The entry that already covers a date, or null. The app offers one entry per
   * day, so the "new entry" action uses this to reopen today instead of starting
   * a second one next to it.
   *
   * Versions before 1.3.0 had no such check and could leave several files on the
   * same date, the extra ones carrying the `-2` suffix `freeFilename` hands out.
   * Those stay readable as separate entries; this picks the unsuffixed one so the
   * day keeps reopening whichever file was written first.
   */
  async findByDate(date: string): Promise<DiaryEntryMeta | null> {
    const sameDay = (await this.list()).filter(entry => entry.date === date);
    if (sameDay.length === 0) return null;

    return sameDay.sort((a, b) => {
      const bySuffix = Number(hasDuplicateSuffix(a.filename)) - Number(hasDuplicateSuffix(b.filename));
      if (bySuffix !== 0) return bySuffix;
      return a.filename < b.filename ? -1 : 1;
    })[0];
  }

  async remove(filename: string): Promise<void> {
    const diaryDir = await this.dir();
    const file = new File(diaryDir, filename);
    if (await file.exists) {
      await file.delete();
    }
  }

  /** Delete every local entry. Returns how many were removed. */
  async wipeAll(): Promise<number> {
    const diaryDir = await this.dir();
    const names = await this.markdownFiles(diaryDir);

    for (const name of names) {
      await new File(diaryDir, name).delete();
    }

    return names.length;
  }
}

export const diary = new DiaryService();

/**
 * Where the "write an entry for this day" action should navigate. Reopens the
 * day's existing entry when there is one, so neither the "+" button nor the
 * daily reminder can start a second entry for a day that is already written.
 *
 * Typed as the `/entry?…` template so `typedRoutes` accepts it without this
 * module having to depend on expo-router.
 */
export async function hrefForDate(date: string): Promise<`/entry?${string}`> {
  const existing = await diary.findByDate(date);

  // `edit=true` because the caller asked to *write*. Opening the read view here
  // would make the button cost an extra tap on every day already started; tapping
  // a card in the list still opens read-only.
  return existing
    ? `/entry?filename=${encodeURIComponent(existing.filename)}&edit=true`
    : `/entry?date=${date}&new=true`;
}
