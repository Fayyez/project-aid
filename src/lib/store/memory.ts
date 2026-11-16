import fs from "node:fs";
import path from "node:path";
import { COLLECTION_NAMES, type CollectionName, type Collections } from "@/lib/types";
import type { Store } from "./index";

type Data = { [K in CollectionName]: Map<string, Collections[K]> };

interface Snapshot {
  meta: Record<string, string>;
  collections: Partial<Record<CollectionName, unknown[]>>;
}

function emptyData(): Data {
  const data = {} as Record<CollectionName, Map<string, unknown>>;
  for (const name of COLLECTION_NAMES) data[name] = new Map();
  return data as Data;
}

/**
 * In-memory store with an optional JSON snapshot on disk.
 * Documents are deep-copied on the way in and out so callers can mutate freely.
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private data: Data = emptyData();
  private meta = new Map<string, string>();
  private readonly file?: string;
  private writeTimer?: NodeJS.Timeout;

  constructor(dataDir: string) {
    if (dataDir) {
      this.file = path.join(dataDir, "db.json");
      this.load();
    }
  }

  private load() {
    if (!this.file) return;
    try {
      if (!fs.existsSync(this.file)) return;
      const snapshot = JSON.parse(fs.readFileSync(this.file, "utf8")) as Snapshot;
      for (const name of COLLECTION_NAMES) {
        const docs = (snapshot.collections[name] ?? []) as { id: string }[];
        const map = this.data[name] as Map<string, unknown>;
        for (const doc of docs) map.set(doc.id, doc);
      }
      for (const [key, value] of Object.entries(snapshot.meta ?? {})) this.meta.set(key, value);
    } catch {
      // A corrupt snapshot must never stop the app from starting.
      this.data = emptyData();
      this.meta.clear();
    }
  }

  private schedulePersist() {
    if (!this.file) return;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.persist(), 250);
    this.writeTimer.unref?.();
  }

  private persist() {
    if (!this.file) return;
    try {
      const snapshot: Snapshot = { meta: Object.fromEntries(this.meta), collections: {} };
      for (const name of COLLECTION_NAMES) snapshot.collections[name] = Array.from(this.data[name].values());
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snapshot));
      fs.renameSync(tmp, this.file);
    } catch {
      // Read-only file systems are fine: the store keeps working in memory.
    }
  }

  async list<K extends CollectionName>(collection: K): Promise<Collections[K][]> {
    return structuredClone(Array.from(this.data[collection].values())) as Collections[K][];
  }

  async get<K extends CollectionName>(collection: K, id: string): Promise<Collections[K] | null> {
    const doc = this.data[collection].get(id);
    return doc ? (structuredClone(doc) as Collections[K]) : null;
  }

  async put<K extends CollectionName>(collection: K, doc: Collections[K]): Promise<void> {
    (this.data[collection] as Map<string, Collections[K]>).set(doc.id, structuredClone(doc));
    this.schedulePersist();
  }

  async putMany<K extends CollectionName>(collection: K, docs: Collections[K][]): Promise<void> {
    const map = this.data[collection] as Map<string, Collections[K]>;
    for (const doc of docs) map.set(doc.id, structuredClone(doc));
    this.schedulePersist();
  }

  async remove<K extends CollectionName>(collection: K, id: string): Promise<void> {
    this.data[collection].delete(id);
    this.schedulePersist();
  }

  async clear(): Promise<void> {
    this.data = emptyData();
    this.meta.clear();
    this.schedulePersist();
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
    this.schedulePersist();
  }
}
