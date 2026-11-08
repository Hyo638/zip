import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import type { Listing } from "./listing";
import { extractArticles, normalize } from "./normalize";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "listings.json");
const FRESH_MS = 24 * 60 * 60 * 1000; // 24시간 동안 new/changed 표시 유지

type Store = { listings: Map<string, Listing>; bus: EventEmitter; lastIngest: number | null };

const g = globalThis as unknown as { __zipStore?: Store };

function load(): Store {
  const listings = new Map<string, Listing>();
  try {
    const arr: Listing[] = JSON.parse(fs.readFileSync(FILE, "utf8"));
    for (const l of arr) listings.set(l.id, l);
  } catch {}
  const bus = new EventEmitter();
  bus.setMaxListeners(100);
  return { listings, bus, lastIngest: null };
}

export const store: Store = (g.__zipStore ??= load());

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify([...store.listings.values()]));
}

export function allListings(): Listing[] {
  const now = Date.now();
  return [...store.listings.values()]
    .map((l) => (l.status !== "seen" && now - l.lastSeen > FRESH_MS ? { ...l, status: "seen" as const } : l))
    .sort((a, b) => b.firstSeen - a.firstSeen);
}

/** 확장에서 받은 응답 JSON을 반영하고, 새로 생기거나 가격이 바뀐 매물을 돌려준다. */
export function ingest(data: unknown) {
  const now = Date.now();
  const changed: Listing[] = [];
  let total = 0;
  for (const raw of extractArticles(data)) {
    const n = normalize(raw, now);
    if (!n) continue;
    total++;
    const prev = store.listings.get(n.id);
    if (!prev) {
      store.listings.set(n.id, n);
      changed.push(n);
    } else if (n.price !== null && prev.price !== null && n.price !== prev.price) {
      const upd: Listing = { ...prev, ...n, firstSeen: prev.firstSeen, prevPrice: prev.price, status: "changed" };
      store.listings.set(n.id, upd);
      changed.push(upd);
    } else {
      store.listings.set(n.id, { ...prev, lastSeen: now });
    }
  }
  if (total) {
    store.lastIngest = now;
    persist();
  }
  if (changed.length) store.bus.emit("update", changed);
  store.bus.emit("ping", { lastIngest: store.lastIngest, count: store.listings.size });
  return { total, changed: changed.length };
}
