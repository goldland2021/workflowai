import "server-only";

// ─── Types ───

export interface CacheEntry {
  /** Normalized message (used for similarity matching) */
  key: string;
  /** Which company this cached reply belongs to */
  companyId: string;
  /** The cached AI reply text */
  reply: string;
  /** When this entry was created */
  createdAt: number;
  /** How many times this cache hit */
  hits: number;
}

// ─── Configuration ───

const MAX_CACHE_SIZE = 200;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

// ─── In-memory store ───
// Map key is `${companyId}::${normalizedMessage}` so replies (which embed a
// company's own pricing, vehicles, and knowledge) never leak across tenants.

const store = new Map<string, CacheEntry>();

function mapKey(companyId: string, normalizedMessage: string): string {
  return `${companyId}::${normalizedMessage}`;
}

// ─── Text Normalization ───

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, "")  // remove punctuation, keep CJK
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Eviction (LRU-style) ───

function evictIfNeeded(): void {
  if (store.size < MAX_CACHE_SIZE) return;

  // Remove oldest entries
  const entries = [...store.entries()]
    .sort(([, a], [, b]) => a.createdAt - b.createdAt);

  // Remove bottom 20%
  const removeCount = Math.ceil(MAX_CACHE_SIZE * 0.2);
  for (let i = 0; i < removeCount && i < entries.length; i++) {
    store.delete(entries[i][0]);
  }
}

// ─── Public API ───

/**
 * Find a cached reply for the same normalized message, scoped to one company.
 * Returns undefined if no match found.
 */
export function findCachedReply(companyId: string, message: string): string | undefined {
  const now = Date.now();
  const key = mapKey(companyId, normalize(message));
  const entry = store.get(key);
  if (!entry) return undefined;
  if (now - entry.createdAt > CACHE_TTL_MS) {
    store.delete(key);
    return undefined;
  }

  entry.hits++;
  return entry.reply;
}

/**
 * Store a reply in the cache, scoped to one company.
 */
export function cacheReply(companyId: string, message: string, reply: string): void {
  const key = normalize(message);
  if (!key) return; // Don't cache empty messages

  evictIfNeeded();

  store.set(mapKey(companyId, key), {
    key,
    companyId,
    reply,
    createdAt: Date.now(),
    hits: 0,
  });
}

/**
 * Get cache statistics for one company (for debugging/admin).
 */
export function getCacheStats(companyId: string): { size: number; hits: number; entries: Array<{ key: string; hits: number; age: number }> } {
  const now = Date.now();
  let totalHits = 0;
  const entries: Array<{ key: string; hits: number; age: number }> = [];

  for (const [, entry] of store) {
    if (entry.companyId !== companyId) continue;

    totalHits += entry.hits;
    entries.push({
      key: entry.key.slice(0, 50),
      hits: entry.hits,
      age: Math.round((now - entry.createdAt) / 1000 / 60), // minutes
    });
  }

  entries.sort((a, b) => b.hits - a.hits);

  return { size: entries.length, hits: totalHits, entries: entries.slice(0, 20) };
}

/**
 * Clear only one company's cached replies.
 */
export function clearCache(companyId: string): void {
  for (const [key, entry] of store) {
    if (entry.companyId === companyId) store.delete(key);
  }
}
