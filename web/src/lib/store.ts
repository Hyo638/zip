import fs from "fs";
import path from "path";
import type { Listing } from "./listing";
import { extractArticles, normalize } from "./normalize";

/**
 * 매물 저장소.
 * - Vercel 배포: Upstash Redis(REST) 사용. 환경변수 KV_REST_API_URL/KV_REST_API_TOKEN
 *   또는 UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN 이 있으면 자동으로 씀.
 * - 내 컴퓨터: data/listings.json 파일.
 */

const FRESH_MS = 24 * 60 * 60 * 1000; // 24시간 동안 new/changed 표시 유지
const HASH = "zip:listings";
const META = "zip:lastIngest";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const usingRedis = !!(REDIS_URL && REDIS_TOKEN);

async function redis<T = unknown>(cmd: (string | number)[]): Promise<T> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j.result as T;
}

// ---------- 파일 저장소 (로컬) ----------
const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "listings.json");
const VERSION = 4;
type FileStore = { listings: Map<string, Listing>; lastIngest: number | null };
const g = globalThis as unknown as { __zipFileStore?: FileStore };
function fileStore(): FileStore {
  if (g.__zipFileStore) return g.__zipFileStore;
  const listings = new Map<string, Listing>();
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (saved?.version === VERSION) for (const l of saved.listings as Listing[]) listings.set(l.id, l);
  } catch {}
  return (g.__zipFileStore = { listings, lastIngest: null });
}
function persistFile() {
  const s = fileStore();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ version: VERSION, listings: [...s.listings.values()] }));
  } catch {}
}

// ---------- 공통 ----------
async function getMany(ids: string[]): Promise<(Listing | undefined)[]> {
  if (!ids.length) return [];
  if (!usingRedis) return ids.map((id) => fileStore().listings.get(id));
  const vals = await redis<(string | null)[]>(["HMGET", HASH, ...ids]);
  return vals.map((v) => (v ? (JSON.parse(v) as Listing) : undefined));
}

async function putMany(items: Listing[], now: number) {
  if (!items.length) return;
  if (!usingRedis) {
    const s = fileStore();
    for (const l of items) s.listings.set(l.id, l);
    s.lastIngest = now;
    persistFile();
    return;
  }
  await redis(["HSET", HASH, ...items.flatMap((l) => [l.id, JSON.stringify(l)])]);
  await redis(["SET", META, now]);
}

export async function allListings(): Promise<{ listings: Listing[]; lastIngest: number | null }> {
  let list: Listing[];
  let lastIngest: number | null;
  if (usingRedis) {
    const flat = await redis<string[]>(["HGETALL", HASH]);
    list = [];
    for (let i = 1; i < flat.length; i += 2) list.push(JSON.parse(flat[i]));
    const m = await redis<string | null>(["GET", META]);
    lastIngest = m ? Number(m) : null;
  } else {
    list = [...fileStore().listings.values()];
    lastIngest = fileStore().lastIngest;
  }
  const now = Date.now();
  return {
    lastIngest,
    listings: list
      .map((l) => (l.status !== "seen" && now - l.lastSeen > FRESH_MS ? { ...l, status: "seen" as const } : l))
      .sort((a, b) => b.firstSeen - a.firstSeen),
  };
}

/** 확장에서 받은 응답 JSON을 반영하고, 새로 생기거나 가격이 바뀐 매물 수를 돌려준다. */
export async function ingest(data: unknown) {
  const now = Date.now();
  const fresh = extractArticles(data)
    .map((raw) => normalize(raw, now))
    .filter((n): n is Listing => !!n);
  if (!fresh.length) return { total: 0, changed: 0 };

  const prevs = await getMany(fresh.map((n) => n.id));
  const out: Listing[] = [];
  let changed = 0;
  fresh.forEach((n, i) => {
    const prev = prevs[i];
    if (!prev) {
      out.push(n);
      changed++;
    } else if (n.price !== null && prev.price !== null && (n.price !== prev.price || n.rent !== prev.rent)) {
      out.push({ ...prev, ...n, firstSeen: prev.firstSeen, prevPrice: prev.price, status: "changed" });
      changed++;
    } else {
      // 변동 없음: 새로 읽을 수 있게 된 항목(좌표·사진 등)은 채우고 상태·첫 수집 시각은 유지
      out.push({ ...prev, ...n, firstSeen: prev.firstSeen, prevPrice: prev.prevPrice, status: prev.status, lastSeen: now });
    }
  });
  await putMany(out, now);
  return { total: fresh.length, changed };
}
