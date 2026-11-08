"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, ExternalLink, Home, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { defaultFilters, formatPrice, matches, type Filters, type Listing } from "@/lib/listing";

const FILTER_KEY = "zip.filters";

function timeAgo(ts: number | null) {
  if (!ts) return "아직 없음";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  return `${Math.round(s / 3600)}시간 전`;
}

export default function Page() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [connected, setConnected] = useState(false);
  const [lastIngest, setLastIngest] = useState<number | null>(null);
  const [, tick] = useState(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) setFilters({ ...defaultFilters, ...JSON.parse(saved) });
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
        return [...map.values()].sort((a, b) => b.firstSeen - a.firstSeen);
      });
      const hits = items.filter((l) => matches(l, { ...filtersRef.current, onlyFresh: false }));
      for (const l of hits.slice(0, 5)) {
        const title = l.status === "changed" ? "가격 변동" : "새 매물";
        const body = `${l.name} · ${l.tradeType} ${formatPrice(l.price)}${l.rent ? `/${l.rent}` : ""}`;
        toast(title, { description: body, action: { label: "보기", onClick: () => window.open(l.url, "_blank") } });
        if (filtersRef.current.notify && typeof Notification !== "undefined" && Notification.permission === "granted") {
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

  const update = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    const next = { ...filters, [k]: v };
    setFilters(next);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {}
    if (k === "notify" && v && typeof Notification !== "undefined") Notification.requestPermission();
  };

  const shown = useMemo(() => listings.filter((l) => matches(l, filters)), [listings, filters]);
  const freshCount = shown.filter((l) => l.status !== "seen").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Home className="size-6" />
          <h1 className="text-2xl font-semibold tracking-tight">집찾기</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Radio className={`size-4 ${connected ? "text-emerald-500" : "text-muted-foreground"}`} />
            {connected ? "실시간 연결됨" : "연결 끊김"}
          </span>
          <Separator orientation="vertical" className="h-4" />
          <span>마지막 수신 {timeAgo(lastIngest)}</span>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <Card className="h-fit md:sticky md:top-6">
          <CardHeader>
            <CardTitle>원하는 조건</CardTitle>
            <CardDescription>가격은 만원 단위, 면적은 전용 ㎡</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>거래 유형</Label>
              <Select value={filters.tradeType} onValueChange={(v) => update("tradeType", v ?? "all")}>
                <SelectTrigger className="w-full"><SelectValue>{(v: string) => (v === "all" ? "전체" : v)}</SelectValue></SelectTrigger>
                <SelectContent>
                  {["all", "매매", "전세", "월세"].map((t) => (
                    <SelectItem key={t} value={t}>{t === "all" ? "전체" : t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>가격 / 보증금</Label>
              <div className="flex items-center gap-2">
                <Input inputMode="numeric" placeholder="최소" value={filters.priceMin} onChange={(e) => update("priceMin", e.target.value)} />
                <span className="text-muted-foreground">~</span>
                <Input inputMode="numeric" placeholder="최대" value={filters.priceMax} onChange={(e) => update("priceMax", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>월세 최대</Label>
              <Input inputMode="numeric" placeholder="예: 100" value={filters.rentMax} onChange={(e) => update("rentMax", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>전용면적</Label>
              <div className="flex items-center gap-2">
                <Input inputMode="numeric" placeholder="최소" value={filters.areaMin} onChange={(e) => update("areaMin", e.target.value)} />
                <span className="text-muted-foreground">~</span>
                <Input inputMode="numeric" placeholder="최대" value={filters.areaMax} onChange={(e) => update("areaMax", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>단지명·설명 키워드</Label>
              <Input placeholder="예: 래미안, 역세권" value={filters.keyword} onChange={(e) => update("keyword", e.target.value)} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="low">저층 제외</Label>
              <Switch id="low" checked={filters.excludeLowFloor} onCheckedChange={(v) => update("excludeLowFloor", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="fresh">새 매물·가격변동만</Label>
              <Switch id="fresh" checked={filters.onlyFresh} onCheckedChange={(v) => update("onlyFresh", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notify" className="flex items-center gap-1.5"><Bell className="size-4" />데스크톱 알림</Label>
              <Switch id="notify" checked={filters.notify} onCheckedChange={(v) => update("notify", v)} />
            </div>
            <Button variant="outline" className="w-full" onClick={() => { setFilters(defaultFilters); try { localStorage.removeItem(FILTER_KEY); } catch {} }}>
              조건 초기화
            </Button>
          </CardContent>
        </Card>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-medium">조건에 맞는 매물 {shown.length}건</h2>
            <span className="text-sm text-muted-foreground">새 매물·변동 {freshCount}건 / 전체 수집 {listings.length}건</span>
          </div>

          {shown.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {listings.length === 0
                  ? "아직 받은 매물이 없습니다. 크롬 확장을 켠 상태로 네이버 부동산에서 원하는 지역의 매물 목록을 열어 주세요."
                  : "조건에 맞는 매물이 없습니다. 조건을 넓혀 보세요."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {shown.map((l) => (
                <Card key={l.id} className={l.status === "new" ? "border-emerald-500/60" : l.status === "changed" ? "border-amber-500/60" : ""}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {l.status === "new" && <Badge className="bg-emerald-600 hover:bg-emerald-600">NEW</Badge>}
                        {l.status === "changed" && <Badge className="bg-amber-500 hover:bg-amber-500">가격변동</Badge>}
                        <Badge variant="secondary">{l.tradeType || "?"}</Badge>
                        <span className="font-medium">{l.name}</span>
                      </div>
                      <div className="text-xl font-semibold">
                        {formatPrice(l.price)}
                        {l.rent ? <span> / {l.rent.toLocaleString()}</span> : null}
                        {l.status === "changed" && l.prevPrice !== null && (
                          <span className="ml-2 text-sm font-normal text-muted-foreground line-through">{formatPrice(l.prevPrice)}</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {[l.area && `전용 ${l.area}㎡ (${(l.area / 3.3058).toFixed(1)}평)`, l.floor && `${l.floor}층`, l.direction, l.confirmed && `확인 ${l.confirmed}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {l.desc && <p className="line-clamp-2 text-sm">{l.desc}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <a href={l.url} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                        네이버에서 보기 <ExternalLink />
                      </a>
                      <span className="text-xs text-muted-foreground">수집 {timeAgo(l.firstSeen)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
