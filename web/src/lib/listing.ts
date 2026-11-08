export type ListingStatus = "new" | "changed" | "seen";

export type Listing = {
  id: string;
  name: string;
  tradeType: string; // 매매 | 전세 | 월세 | 단기임대 ...
  price: number | null; // 만원 (매매가 또는 보증금)
  rent: number | null; // 만원 (월세)
  mgmtFee: number | null; // 만원 (관리비)
  address: string | null;
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
  { dong: "송도동", label: "연수구 송도동" },
  { dong: "청라동", label: "서해구 청라동" },
  { dong: "구월동", label: "남동구 구월동" },
];
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
