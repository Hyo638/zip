"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, Briefcase, Home, Radio, TrainFront } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { DONG_OPTIONS, OFFICE, commute, commuteUrl, defaultFilters, formatPrice, matches, nearestStation, type Listing } from "@/lib/listing";
import { cn } from "@/lib/utils";

const NOTIFY_KEY = "zip.notify";

type Sort = "latest" | "price" | "area";
const SORTS: { key: Sort; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "price", label: "가격순" },
  { key: "area", label: "면적순" },
];

function timeAgo(ts: number | null) {
  if (!ts) return "아직 없음";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  return `${Math.round(s / 3600)}시간 전`;
}

function priceText(l: Listing) {
  const deposit = formatPrice(l.price);
  return l.rent ? `${l.tradeType} ${deposit}/${l.rent.toLocaleString()}` : `${l.tradeType} ${deposit}`;
}

function formatDate(d: string | null) {
  if (!d) return null;
  const m = d.replace(/-/g, "").match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : d;
}

// 단지 이름(뒤의 동 번호 제외)으로 구글 이미지 검색을 연다. 카드 전체 링크(네이버)로는 넘어가지 않게 막는다.
function openImageSearch(e: React.SyntheticEvent, l: Listing) {
  e.preventDefault();
  e.stopPropagation();
  const complex = l.name.replace(/\s+\S*\d+\S*$/, "").trim() || l.name;
  window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(complex)}`, "_blank", "noopener");
}

function ListingCard({ l }: { l: Listing }) {
  const area = l.area
    ? l.supplyArea
      ? `${Math.round(l.supplyArea)}㎡ (전용${l.area})`
      : `전용 ${l.area}㎡`
    : null;
  return (
    <a
      href={l.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-neutral-200 bg-card p-4 shadow-xs transition-colors hover:bg-accent/50 dark:border-neutral-800"
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            {l.status === "new" && <Badge className="bg-emerald-600 px-1.5 text-[10px]">NEW</Badge>}
            {l.status === "changed" && <Badge className="bg-amber-500 px-1.5 text-[10px]">가격변동</Badge>}
            <span
              role="link"
              tabIndex={0}
              title="구글 이미지에서 보기"
              onClick={(e) => openImageSearch(e, l)}
              onKeyDown={(e) => e.key === "Enter" && openImageSearch(e, l)}
              className="cursor-pointer truncate text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {l.name}
            </span>
          </div>
          <div className="text-lg font-bold leading-tight">
            {priceText(l)}
            {l.status === "changed" && l.prevPrice !== null && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">{formatPrice(l.prevPrice)}</span>
            )}
          </div>
          <div className="text-[13px] text-muted-foreground">
            {[l.estateType, area, l.floor && `${l.floor}층`, l.direction].filter(Boolean).join(" | ")}
          </div>
          {(() => {
            const st = nearestStation(l);
            return st ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrainFront className="size-3.5" />
                {st.name}역 도보 {st.minutes}분
                <span className="text-muted-foreground/70">({st.meters >= 1000 ? `${(st.meters / 1000).toFixed(1)}km` : `${st.meters}m`})</span>
              </div>
            ) : null;
          })()}
          {(() => {
            const c = commute(l);
            return c ? (
              <div
                role="link"
                tabIndex={0}
                title="구글 지도에서 대중교통 경로 보기"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(commuteUrl(l), "_blank", "noopener"); }}
                className="flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-sky-700 hover:underline dark:text-sky-400"
              >
                <Briefcase className="size-3.5" />
                직장까지 약 {c.minutes}분{c.walkOnly ? " (도보)" : c.byBus ? " (버스+지하철)" : " (지하철)"}
              </div>
            ) : null;
          })()}
          {l.mgmtFee ? <div className="text-xs text-muted-foreground">관리비 {l.mgmtFee}만</div> : null}
          {l.brokerCount && l.brokerCount > 1 ? (
            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">중개사 {l.brokerCount}곳에서 등록</div>
          ) : null}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {l.verification && l.verification !== "확인매물" && (
              <span className={cn("rounded px-1.5 py-0.5 text-xs", l.verification === "집주인" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300")}>
                {l.verification}
              </span>
            )}
            {l.confirmed && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600 dark:bg-red-950 dark:text-red-300">확인매물 {formatDate(l.confirmed)}</span>
            )}
          </div>
        </div>
        {l.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.imageUrl} alt="" referrerPolicy="no-referrer" className="size-20 shrink-0 rounded-lg object-cover" />
        )}
      </div>
    </a>
  );
}

const RANK_STYLE: Record<number, string> = {
  1: "bg-amber-500 text-white",
  2: "bg-slate-500 text-white",
  3: "bg-orange-700 text-white",
};

function DongColumn({ label, rank, items }: { label: string; rank: number; items: Listing[] }) {
  const [sort, setSort] = useState<Sort>("latest");
  const sorted = useMemo(() => {
    const arr = [...items];
    if (sort === "price") arr.sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || (a.rent ?? 0) - (b.rent ?? 0));
    else if (sort === "area") arr.sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
    else {
      // 최신순: 확인매물 날짜가 최근인 순, 같은 날이면 먼저 수집된 새 매물이 위로
      const ymd = (l: Listing) => (l.confirmed ?? "").replace(/\D/g, "").slice(0, 8);
      arr.sort((a, b) => ymd(b).localeCompare(ymd(a)) || b.firstSeen - a.firstSeen);
    }
    return arr;
  }, [items, sort]);
  const fresh = items.filter((l) => l.status !== "seen").length;

  return (
    <section className="flex min-h-[60vh] flex-col rounded-2xl border bg-muted/40 md:min-h-0">
      <div className="rounded-t-2xl border-b bg-background px-4 py-3">
        <h2 className="flex items-center justify-center gap-2 text-base font-semibold">
          <Badge className={cn("px-2", RANK_STYLE[rank])}>{rank}순위</Badge>
          {label}
        </h2>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-sm font-semibold">
          매물 <span className="text-emerald-600">{items.length}</span>
          {fresh > 0 && <span className="ml-1.5 text-xs font-normal text-emerald-600">새 {fresh}</span>}
        </div>
        <div className="flex items-center text-xs">
          {SORTS.map((s, i) => (
            <span key={s.key} className="flex items-center">
              {i > 0 && <span className="mx-1.5 text-border">|</span>}
              <button
                type="button"
                onClick={() => setSort(s.key)}
                className={sort === s.key ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}
              >
                {s.label}
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">아직 받은 매물이 없습니다.</p>
        ) : (
          sorted.map((l) => <ListingCard key={l.id} l={l} />)
        )}
      </div>
    </section>
  );
}

export default function Page() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [notify, setNotify] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastIngest, setLastIngest] = useState<number | null>(null);
  const [, tick] = useState(0);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    try {
      if (localStorage.getItem(NOTIFY_KEY) === "off") setNotify(false);
    } catch {}
    fetch("/api/listings")
      .then((r) => r.json())
      .then((d) => {
        setListings(d.listings);
        setLastIngest(d.lastIngest);
      });

    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("ping", (e) => setLastIngest(JSON.parse((e as MessageEvent).data).lastIngest));
    es.addEventListener("update", (e) => {
      const items: Listing[] = JSON.parse((e as MessageEvent).data);
      setListings((prev) => {
        const map = new Map(prev.map((l) => [l.id, l]));
        for (const it of items) map.set(it.id, it);
        return [...map.values()];
      });
      const hits = items.filter((l) => matches(l, defaultFilters));
      for (const l of hits.slice(0, 5)) {
        const title = l.status === "changed" ? "가격 변동" : `새 매물 · ${l.dong}`;
        const body = `${l.name} · ${priceText(l)}`;
        toast(title, { description: body, action: { label: "보기", onClick: () => window.open(l.url, "_blank") } });
        if (notifyRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(`${title} — 집찾기`, { body });
        }
      }
    });
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => {
      es.close();
      clearInterval(t);
    };
  }, []);

  const toggleNotify = (v: boolean) => {
    setNotify(v);
    try {
      localStorage.setItem(NOTIFY_KEY, v ? "on" : "off");
    } catch {}
    if (v && typeof Notification !== "undefined") Notification.requestPermission();
  };

  const byDong = useMemo(() => {
    const shown = listings.filter((l) => matches(l, defaultFilters));
    return DONG_OPTIONS.map((d) => ({ ...d, items: shown.filter((l) => l.dong === d.dong) }));
  }, [listings]);

  return (
    <div className="flex flex-col px-4 py-4 md:h-dvh">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Home className="size-5" />
          <h1 className="text-xl font-semibold tracking-tight">집찾기</h1>
          <span className="hidden text-sm text-muted-foreground sm:inline">아파트·오피스텔 · 월세 · 직장 {OFFICE.name}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Radio className={cn("size-4", connected ? "text-emerald-500" : "text-muted-foreground")} />
            {connected ? "실시간 연결됨" : "연결 끊김"}
          </span>
          <Separator orientation="vertical" className="h-4" />
          <span>마지막 수신 {timeAgo(lastIngest)}</span>
          <Separator orientation="vertical" className="h-4" />
          <Label htmlFor="notify" className="flex cursor-pointer items-center gap-1.5 font-normal">
            <Bell className="size-4" />
            알림
          </Label>
          <Switch id="notify" checked={notify} onCheckedChange={toggleNotify} />
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-3 md:min-h-0 md:grid-cols-3">
        {byDong.map((d) => (
          <DongColumn key={d.dong} label={d.label} rank={d.rank} items={d.items} />
        ))}
      </main>
    </div>
  );
}
