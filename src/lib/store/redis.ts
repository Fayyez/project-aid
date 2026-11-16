import { Redis } from "@upstash/redis";
import { COLLECTION_NAMES, type CollectionName, type Collections } from "@/lib/types";
import type { Store } from "./index";

const PREFIX = "pa";

/**
 * Upstash Redis / Vercel KV adapter. Each collection is one hash of
 * id -> JSON document, which keeps reads to a single round trip per collection.
 * This is sized for a portfolio of tens of projects; beyond that, move the
 * `events` and `runs` collections to a relational store.
 */
export class RedisStore implements Store {
  readonly kind = "redis" as const;
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  private key(collection: CollectionName) {
    return `${PREFIX}:c:${collection}`;
  }

  async list<K extends CollectionName>(collection: K): Promise<Collections[K][]> {
    const all = await this.redis.hgetall<Record<string, Collections[K]>>(this.key(collection));
    return all ? Object.values(all) : [];
  }

  async get<K extends CollectionName>(collection: K, id: string): Promise<Collections[K] | null> {
    return (await this.redis.hget<Collections[K]>(this.key(collection), id)) ?? null;
  }

  async put<K extends CollectionName>(collection: K, doc: Collections[K]): Promise<void> {
    await this.redis.hset(this.key(collection), { [doc.id]: doc });
  }

  async putMany<K extends CollectionName>(collection: K, docs: Collections[K][]): Promise<void> {
    // Chunked so a large seed does not exceed the request size limit.
    for (let i = 0; i < docs.length; i += 100) {
      const chunk = docs.slice(i, i + 100);
      if (chunk.length === 0) continue;
      await this.redis.hset(this.key(collection), Object.fromEntries(chunk.map((doc) => [doc.id, doc])));
    }
  }

  async remove<K extends CollectionName>(collection: K, id: string): Promise<void> {
    await this.redis.hdel(this.key(collection), id);
  }

  async clear(): Promise<void> {
    await this.redis.del(...COLLECTION_NAMES.map((name) => this.key(name)), `${PREFIX}:meta`);
  }

  async getMeta(key: string): Promise<string | null> {
    const value = await this.redis.hget<string>(`${PREFIX}:meta`, key);
    return value === null || value === undefined ? null : String(value);
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.redis.hset(`${PREFIX}:meta`, { [key]: value });
  }
}
