// SPDX-License-Identifier: GPL-3.0-only
// In-memory stand-in for expo-file-system, shared by the service tests.

export function createFakeFileSystem() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  /** Every `File.text()` call, so tests can assert how much a lookup reads. */
  const reads: string[] = [];

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
      if (!files.has(this.uri)) {
        throw new Error(`File not found: ${this.uri}`);
      }
      reads.push(this.name);
      return files.get(this.uri);
    }

    write(value: string) {
      files.set(this.uri, value);
    }

    delete() {
      files.delete(this.uri);
    }
  }

  return {
    Paths: { document: 'file:///doc' },
    Directory,
    File,
    __files: files,
    __dirs: dirs,
    __reads: reads,
  };
}
