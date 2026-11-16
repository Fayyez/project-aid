import { config } from "@/lib/config";
import type { CollectionName, Collections } from "@/lib/types";
import { MemoryStore } from "./memory";
import { RedisStore } from "./redis";

/**
 * Minimal document store. Collections hold JSON documents keyed by `id`.
 * Two adapters ship: an in-memory store with a JSON file snapshot (zero setup,
 * used for local development and demos) and Upstash Redis / Vercel KV (durable
 * on serverless). Swapping in Postgres means implementing this one interface.
 */
export interface Store {
  readonly kind: "memory" | "redis";
  list<K extends CollectionName>(collection: K): Promise<Collections[K][]>;
  get<K extends CollectionName>(collection: K, id: string): Promise<Collections[K] | null>;
  put<K extends CollectionName>(collection: K, doc: Collections[K]): Promise<void>;
  putMany<K extends CollectionName>(collection: K, docs: Collections[K][]): Promise<void>;
  remove<K extends CollectionName>(collection: K, id: string): Promise<void>;
  /** Removes every document. Used by "reset demo data". */
  clear(): Promise<void>;
  /** Small key/value area for flags such as "seeded". */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

type Seeder = (store: Store) => Promise<void>;

interface StoreGlobal {
  store?: Store;
  ready?: Promise<Store>;
}

const globalRef = globalThis as unknown as { __projectAid?: StoreGlobal };
const state: StoreGlobal = (globalRef.__projectAid ??= {});

function createStore(): Store {
  if (config.storeKind === "redis") {
    return new RedisStore(config.redisUrl!, config.redisToken!);
  }
  return new MemoryStore(config.dataDir);
}

async function init(): Promise<Store> {
  const store = createStore();
  state.store = store;
  if (config.seedDemo) {
    const seeded = await store.getMeta("seeded");
    if (!seeded) {
      // Imported lazily so the seed data is not loaded when it is not needed.
      const { seedDemoData } = (await import("@/lib/seed")) as { seedDemoData: Seeder };
      await seedDemoData(store);
      await store.setMeta("seeded", new Date().toISOString());
    }
  }
  return store;
}

/** Returns the process-wide store, creating and seeding it on first use. */
export function getStore(): Promise<Store> {
  if (!state.ready) {
    state.ready = init().catch((error) => {
      state.ready = undefined;
      throw error;
    });
  }
  return state.ready;
}

/** Wipes everything and re-seeds the demo portfolio. */
export async function resetStore(): Promise<void> {
  const store = await getStore();
  await store.clear();
  if (config.seedDemo) {
    const { seedDemoData } = (await import("@/lib/seed")) as { seedDemoData: Seeder };
    await seedDemoData(store);
    await store.setMeta("seeded", new Date().toISOString());
  }
}

/** Test helper: start from a fresh, unseeded in-memory store. */
export function useFreshMemoryStore(): Store {
  const store = new MemoryStore("");
  state.store = store;
  state.ready = Promise.resolve(store);
  return store;
}
