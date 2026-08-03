// lib/store.ts
//
// Abstraction over "where leaderboard scores live" so the API route doesn't
// need to know or care whether it's talking to Vercel KV or a local fallback.

export type ScoreEntry = { name: string; score: number; ts: number };

const LEADERBOARD_KEY = "leaderboard";
const MAX_ENTRIES = 50;

// In-memory fallback used only when KV env vars aren't set (i.e. local dev
// before you've connected Vercel KV, or if you never add it at all).
// NOTE: this resets every time the dev server restarts, and on Vercel's
// serverless functions it will NOT persist between invocations reliably —
// it's a convenience for local testing only. Add the Vercel KV integration
// in your project dashboard for real persistence in production.
let memoryStore: ScoreEntry[] = [];

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function addScore(entry: ScoreEntry): Promise<void> {
  if (hasKv()) {
    // Dynamic import so the @vercel/kv package (and its env var reads)
    // only happen when KV is actually configured.
    const { kv } = await import("@vercel/kv");
    // A sorted set keyed by score. The "member" has to be unique per entry,
    // so we pack name+timestamp together and parse it back out on read.
    const member = `${entry.name}::${entry.ts}`;
    await kv.zadd(LEADERBOARD_KEY, { score: entry.score, member });
    return;
  }

  memoryStore.push(entry);
  memoryStore.sort((a, b) => b.score - a.score);
  memoryStore = memoryStore.slice(0, MAX_ENTRIES);
}

export async function getTopScores(limit = 10): Promise<ScoreEntry[]> {
  if (hasKv()) {
    const { kv } = await import("@vercel/kv");
    // withScores: true returns [member, score, member, score, ...]
    const raw = await kv.zrange(LEADERBOARD_KEY, 0, limit - 1, {
      rev: true,
      withScores: true,
    });

    const entries: ScoreEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const member = String(raw[i]);
      const score = Number(raw[i + 1]);
      const [name, tsStr] = member.split("::");
      entries.push({ name, score, ts: Number(tsStr) || 0 });
    }
    return entries;
  }

  return memoryStore.slice(0, limit);
}
