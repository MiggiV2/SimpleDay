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
