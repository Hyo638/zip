import type { Listing } from "./listing";

type Raw = Record<string, unknown>;

const ID_KEYS = ["articleNo", "articleNumber", "atclNo"];

const pick = (o: Raw, keys: string[]): unknown => {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  }
  return undefined;
};

/** "6억 5,000" / "32억" / "5,000" / 65000 / 650000000(원) → 만원 */
export function parsePrice(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return v >= 1e7 ? Math.round(v / 10000) : v;
  const s = String(v).replace(/\s/g, "");
  const m = s.match(/^(?:(\d+)억)?([\d,]+)?$/);
  if (!m) return null;
  const eok = m[1] ? Number(m[1]) * 10000 : 0;
  const man = m[2] ? Number(m[2].replace(/,/g, "")) : 0;
  const total = eok + man;
  return total >= 1e7 ? Math.round(total / 10000) : total;
}

const str = (v: unknown) =>
  v === undefined || v === null || v === "" ? null : String(v);

const TRADE: Record<string, string> = { A1: "매매", B1: "전세", B2: "월세", B3: "단기임대" };

/** 응답 JSON 어디에 있든 매물 객체를 찾아낸다 (네이버 응답 형식이 바뀌어도 버티도록). */
export function extractArticles(data: unknown, out: Raw[] = [], depth = 0): Raw[] {
  if (depth > 8 || data === null || typeof data !== "object") return out;
  if (Array.isArray(data)) {
    for (const d of data) extractArticles(d, out, depth + 1);
    return out;
  }
  const o = data as Raw;
  if (ID_KEYS.some((k) => o[k] !== undefined) && (pick(o, ["articleName", "complexName", "atclNm", "articleTitle"]) || pick(o, PRICE_KEYS))) {
    out.push(o);
    return out;
  }
  for (const v of Object.values(o)) extractArticles(v, out, depth + 1);
  return out;
}

const PRICE_KEYS = ["dealOrWarrantPrc", "prc", "dealPrice", "warrantyPrice", "price", "warrantPrice"];

export function normalize(o: Raw, now: number): Listing | null {
  const id = str(pick(o, ID_KEYS));
  if (!id) return null;
  const flat: Raw = { ...o };
  // 중첩 객체(priceInfo, spaceInfo 등) 한 단계 펼치기
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(flat, v as Raw, { ...flat });
  }
  const tradeRaw = str(pick(flat, ["tradeTypeName", "tradTpNm", "tradeType", "tradTpCd", "tradeTypeCode"])) ?? "";
  const tradeType = TRADE[tradeRaw] ?? tradeRaw;
  const areaRaw = pick(flat, ["area2", "spc2", "exclusiveArea", "exclusiveSpace"]);
  return {
    id,
    name:
      [str(pick(flat, ["articleName", "complexName", "atclNm", "articleTitle"])), str(pick(flat, ["buildingName", "bildNm", "dongName"]))]
        .filter(Boolean)
        .join(" ") || "이름 없음",
    tradeType,
    price: parsePrice(pick(flat, PRICE_KEYS)),
    rent: parsePrice(pick(flat, ["rentPrc", "rentPrice", "monthlyRent"])),
    area: areaRaw !== undefined && !isNaN(Number(areaRaw)) ? Number(areaRaw) : null,
    floor: str(pick(flat, ["floorInfo", "flrInfo", "floor"])),
    direction: str(pick(flat, ["direction", "direcNm", "directionName"])),
    desc: str(pick(flat, ["articleFeatureDesc", "atclFetrDesc", "articleFeatureDescription", "description"])),
    confirmed: str(pick(flat, ["articleConfirmYmd", "cfmYmd", "confirmDate", "exposureStartDate"])),
    url: `https://fin.land.naver.com/articles/${id}`,
    firstSeen: now,
    lastSeen: now,
    prevPrice: null,
    status: "new",
  };
}
