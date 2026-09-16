import { promises as fs } from 'node:fs';
import path from 'node:path';
import { kvGet, kvSet, libsqlEnabled } from './libsql.js';

/**
 * A tiny key/value store with debounced writes.
 *
 * This server runs as a single-threaded process, so an in-memory object
 * flushed to storage is enough persistence for a home-game tracker. Writes
 * are debounced — many mutations collapse into one write.
 *
 * Backend:
 *  - **libSQL / Turso** when `TURSO_DATABASE_URL` is set. The store is one row
 *    in a shared `kv` table keyed by the path string passed to {@link load}.
 *    Used in production, where the filesystem is ephemeral.
 *  - **JSON file** otherwise — write to a temp file, then rename, so a crash
 *    mid-write cannot corrupt the data. Used for local development.
 */
export class JsonStore<T> {
  private data: T;
  /** libSQL row key, or the original path for file mode. */
  private readonly key: string;
  /** resolved filesystem path, used only in file mode. */
  private readonly file: string;
  private readonly useDb: boolean;
  private writeTimer: NodeJS.Timeout | null = null;

  private constructor(key: string, file: string, useDb: boolean, data: T) {
    this.key = key;
    this.file = file;
    this.useDb = useDb;
    this.data = data;
  }

  static async load<T>(file: string, defaults: T): Promise<JsonStore<T>> {
    const useDb = libsqlEnabled();
    const abs = path.resolve(file);
    const store = new JsonStore<T>(file, abs, useDb, defaults);

    let raw: string | null = null;
    if (useDb) {
      raw = await kvGet(file);
    } else {
      try {
        raw = await fs.readFile(abs, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }

    if (raw !== null) {
      store.data = { ...defaults, ...(JSON.parse(raw) as T) };
    } else {
      // First run: persist the defaults so the row / file exists.
      await store.flush();
    }
    return store;
  }

  /** The live data object. Read from it directly; mutate only via `update`. */
  get(): T {
    return this.data;
  }

  /** Apply a mutation and schedule a flush. */
  update(mutator: (data: T) => void): void {
    mutator(this.data);
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush();
    }, 250);
  }

  /** Write the current data immediately. */
  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    const json = JSON.stringify(this.data, null, 2);
    if (this.useDb) {
      await kvSet(this.key, json);
      return;
    }
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, json);
    await fs.rename(tmp, this.file);
  }
}
