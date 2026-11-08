export type ListingStatus = "new" | "changed" | "seen";

export type Listing = {
  id: string;
  name: string;
  tradeType: string; // 매매 | 전세 | 월세 | 단기임대 ...
  price: number | null; // 만원 (매매가 또는 보증금)
  rent: number | null; // 만원 (월세)
  mgmtFee: number | null; // 만원 (관리비)
  address: string | null;
  lat?: number | null;
  lon?: number | null;
  dong: string | null; // 법정동 이름 (송도동 등)
  estateType: string; // 아파트 | 오피스텔 | ...
  imageUrl: string | null;
  area: number | null; // 전용면적 ㎡
  supplyArea?: number | null; // 공급(오피스텔은 계약)면적 ㎡
  brokerCount?: number; // 같은 집을 올린 중개사 수
  verification?: string | null; // 집주인 | 현장 | 확인매물
  floor: string | null;
  direction: string | null;
  desc: string | null;
  confirmed: string | null;
  url: string;
  firstSeen: number;
  lastSeen: number;
  prevPrice: number | null;
  prevRent?: number | null;
  status: ListingStatus;
};

export type Filters = {
  tradeTypes: string[]; // 비어 있으면 전체
  estateTypes: string[];
  dongs: string[];
  priceMin: string;
  priceMax: string;
  rentMax: string;
  areaMin: string;
  areaMax: string;
  keyword: string;
  excludeLowFloor: boolean;
  onlyFresh: boolean;
  notify: boolean;
};

export const DONG_OPTIONS = [
  { dong: "송도동", label: "연수구 송도동", rank: 1 },
  { dong: "구월동", label: "남동구 구월동", rank: 2 },
  { dong: "청라동", label: "서해구 청라동", rank: 3 },
]
export const TRADE_OPTIONS = ["매매", "전세", "월세"];
export const ESTATE_OPTIONS = ["아파트", "오피스텔"];

export const defaultFilters: Filters = {
  tradeTypes: ["월세"],
  estateTypes: ["아파트", "오피스텔"],
  dongs: ["송도동", "청라동", "구월동"],
  priceMin: "",
  priceMax: "",
  rentMax: "",
  areaMin: "",
  areaMax: "",
  keyword: "",
  excludeLowFloor: false,
  onlyFresh: false,
  notify: true,
};

const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function matches(l: Listing, f: Filters): boolean {
  if (f.tradeTypes.length && !f.tradeTypes.includes(l.tradeType)) return false;
  if (f.estateTypes.length && !f.estateTypes.includes(l.estateType)) return false;
  if (f.dongs.length && !(l.dong && f.dongs.includes(l.dong))) return false;
  const pMin = num(f.priceMin), pMax = num(f.priceMax);
  if (pMin !== null && (l.price ?? -1) < pMin) return false;
  if (pMax !== null && (l.price ?? Infinity) > pMax) return false;
  const rMax = num(f.rentMax);
  if (rMax !== null && l.rent !== null && l.rent > rMax) return false;
  const aMin = num(f.areaMin), aMax = num(f.areaMax);
  if (aMin !== null && (l.area ?? -1) < aMin) return false;
  if (aMax !== null && (l.area ?? Infinity) > aMax) return false;
  if (f.keyword.trim()) {
    const words = f.keyword.split(/[,\s]+/).filter(Boolean);
    const hay = `${l.name} ${l.desc ?? ""}`;
    if (!words.some((w) => hay.includes(w))) return false;
  }
  if (f.excludeLowFloor && l.floor && /^(저|1\/|B|지하)/.test(l.floor)) return false;
  if (f.onlyFresh && l.status === "seen") return false;
  return true;
}

/** 만원 → "6억 5,000" */
export function formatPrice(v: number | null): string {
  if (v === null) return "-";
  const eok = Math.floor(v / 10000);
  const man = v % 10000;
  if (eok && man) return `${eok}억 ${man.toLocaleString()}`;
  if (eok) return `${eok}억`;
  return man.toLocaleString();
}

import { STATIONS } from "./stations";

/** 가장 가까운 역과 도보 시간(분). 직선거리 × 1.3(실제 길 보정) ÷ 분당 70m 로 어림잡는다. */
export function nearestStation(l: Listing): { name: string; minutes: number; meters: number } | null {
  if (l.lat == null || l.lon == null) return null;
  let best: { name: string; d: number } | null = null;
  for (const [name, lat, lon] of STATIONS) {
    const dy = (lat - l.lat) * 111_000;
    const dx = (lon - l.lon) * 111_000 * Math.cos((l.lat * Math.PI) / 180);
    const d = Math.hypot(dx, dy);
    if (!best || d < best.d) best = { name, d };
  }
  if (!best) return null;
  const walk = best.d * 1.3;
  return { name: best.name, meters: Math.round(walk), minutes: Math.max(1, Math.round(walk / 70)) };
}

// 직장: 송도 테크노파크 IT센터 (인천1호선 테크노파크역 바로 앞)
export const OFFICE = { name: "송도 테크노파크 IT센터", lat: 37.3821, lon: 126.6566, station: "테크노파크", walkFromStation: 3 };

// 인천1호선 역 (테크노파크역까지 갈아타지 않고 가는 역)
const LINE1 = ["계양", "귤현", "박촌", "임학", "계산", "경인교대입구", "작전", "갈산", "부평구청", "부평시장", "부평", "동수", "부평삼거리", "간석오거리", "인천시청", "예술회관", "인천터미널", "문학경기장", "선학", "신연수", "원인재", "동춘", "동막", "캠퍼스타운", "테크노파크", "지식정보단지", "인천대입구", "센트럴파크", "국제업무지구", "송도달빛축제공원"];

const meters = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  Math.hypot((aLat - bLat) * 111_000, (aLon - bLon) * 111_000 * Math.cos((aLat * Math.PI) / 180));

/**
 * 직장까지 대중교통 소요시간 어림값(분).
 * 가까우면 걸어서, 아니면 [역까지 도보 + 대기 + 지하철 + (환승) + 역에서 직장까지 도보].
 * 인천1호선은 역 간 약 2분, 다른 노선은 직선거리 기준 평균 시속 35km와 환승 8분으로 잡는다.
 */
export function commute(l: Listing): { minutes: number; walkOnly: boolean; byBus: boolean } | null {
  if (l.lat == null || l.lon == null) return null;
  const direct = meters(l.lat, l.lon, OFFICE.lat, OFFICE.lon) * 1.3;
  const walkDirect = Math.round(direct / 70);
  const st = nearestStation(l);
  if (!st) return null;
  let ride: number;
  const i = LINE1.indexOf(st.name), j = LINE1.indexOf(OFFICE.station);
  if (i >= 0) ride = Math.abs(i - j) * 2;
  else {
    const s = STATIONS.find(([n]) => n === st.name)!;
    ride = Math.round((meters(s[1], s[2], OFFICE.lat, OFFICE.lon) * 1.25) / 583) + 8;
  }
  // 역까지 걸어서 15분이 넘으면 마을버스·버스로 역까지 간다고 본다 (분당 250m + 대기 5분)
  const byBus = st.minutes > 15;
  const access = byBus ? Math.round(st.meters / 250) + 5 : st.minutes;
  const transit = access + 4 + ride + OFFICE.walkFromStation;
  if (walkDirect <= transit || walkDirect <= 15) return { minutes: Math.max(1, walkDirect), walkOnly: true, byBus: false };
  return { minutes: transit, walkOnly: false, byBus };
}

export const commuteUrl = (l: Listing) =>
  `https://www.google.com/maps/dir/?api=1&origin=${l.lat},${l.lon}&destination=${encodeURIComponent(OFFICE.name)}&travelmode=transit`;
