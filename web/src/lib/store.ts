import fs from "fs";
import path from "path";
import { defaultFilters, matches, type Listing } from "./listing";
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
const EVENTS = "zip:events";
const MAX_EVENTS = 300;
// 한 번에 이보다 많이 "새 매물"이 오면 첫 수집(동기화)으로 보고 알림을 만들지 않는다
const BULK_THRESHOLD = 10;

export type ListingEvent = { type: "new" | "changed"; at: number; listing: Listing };

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
type FileStore = { listings: Map<string, Listing>; lastIngest: number | null; events: ListingEvent[] };
const g = globalThis as unknown as { __zipFileStore?: FileStore };
function fileStore(): FileStore {
  if (g.__zipFileStore) {
    g.__zipFileStore.events ??= []; // 이전 버전 메모리 저장소 호환
    return g.__zipFileStore;
  }
  const listings = new Map<string, Listing>();
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (saved?.version === VERSION) for (const l of saved.listings as Listing[]) listings.set(l.id, l);
  } catch {}
  let events: ListingEvent[] = [];
  try { events = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "events.json"), "utf8")); } catch {}
  return (g.__zipFileStore = { listings, lastIngest: null, events });
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

async function pushEvents(events: ListingEvent[]) {
  if (!events.length) return;
  if (!usingRedis) {
    const s = fileStore();
    s.events = [...events.reverse(), ...s.events].slice(0, MAX_EVENTS);
    try { fs.writeFileSync(path.join(DATA_DIR, "events.json"), JSON.stringify(s.events)); } catch {}
    return;
  }
  await redis(["LPUSH", EVENTS, ...events.map((e) => JSON.stringify(e))]);
  await redis(["LTRIM", EVENTS, 0, MAX_EVENTS - 1]);
}

export async function recentEvents(limit = 100): Promise<ListingEvent[]> {
  if (!usingRedis) return fileStore().events.slice(0, limit);
  const rows = await redis<string[]>(["LRANGE", EVENTS, 0, limit - 1]);
  return rows.map((r) => JSON.parse(r));
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
  if (!fresh.length) return { total: 0, changed: 0, notify: [] };

  const prevs = await getMany(fresh.map((n) => n.id));
  const out: Listing[] = [];
  let changed = 0;
  fresh.forEach((n, i) => {
    const prev = prevs[i];
    if (!prev) {
      out.push(n);
      changed++;
    } else if (n.price !== null && prev.price !== null && (n.price !== prev.price || n.rent !== prev.rent)) {
      out.push({ ...prev, ...n, firstSeen: prev.firstSeen, prevPrice: prev.price, prevRent: prev.rent, status: "changed" });
      changed++;
    } else {
      // 변동 없음: 새로 읽을 수 있게 된 항목(좌표·사진 등)은 채우고 상태·첫 수집 시각은 유지
      out.push({ ...prev, ...n, firstSeen: prev.firstSeen, prevPrice: prev.prevPrice, status: prev.status, lastSeen: now });
    }
  });
  await putMany(out, now);

  // 원하는 조건(동·종류·월세)에 맞는 새 매물/가격변동만 알림으로 남긴다
  const evts: ListingEvent[] = [];
  out.forEach((l, i) => {
    const prev = prevs[i];
    const type = !prev ? "new" : prev.price !== l.price || prev.rent !== l.rent ? "changed" : null;
    if (type && matches(l, defaultFilters)) evts.push({ type, at: now, listing: l });
  });
  const newCount = evts.filter((e) => e.type === "new").length;
  const notify = newCount > BULK_THRESHOLD ? evts.filter((e) => e.type === "changed") : evts;
  await pushEvents(notify);
  return {
    total: fresh.length,
    changed,
    // 확장이 크롬 알림을 띄울 수 있게 알림 대상 요약을 돌려준다
    notify: notify.map((e) => ({ type: e.type, id: e.listing.id, dong: e.listing.dong, name: e.listing.name, price: e.listing.price, rent: e.listing.rent, tradeType: e.listing.tradeType, url: e.listing.url })),
  };
}
