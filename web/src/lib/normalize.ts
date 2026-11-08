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

const won = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v / 10000) : null);

const DIR: Record<string, string> = { S: "남", N: "북", E: "동", W: "서" };
/** "SS" → 남향, "WN" → 북서향, "SE" → 남동향 */
function direction(v: string | null): string | null {
  if (!v || !/^[NSEW]{1,2}$/.test(v)) return v;
  const set = [...new Set(v.split(""))];
  set.sort((a, b) => "SNEW".indexOf(a) - "SNEW".indexOf(b));
  return set.map((c) => DIR[c]).join("") + "향";
}

const ESTATE: Record<string, string> = { A01: "아파트", APT: "아파트", A02: "오피스텔", OPST: "오피스텔", B01: "분양권", ABYG: "분양권" };

const TRADE: Record<string, string> = { A1: "매매", B1: "전세", B2: "월세", B3: "단기임대" };

const isArticle = (o: Raw) =>
  ID_KEYS.some((k) => o[k] !== undefined) &&
  !!(pick(o, ["articleName", "complexName", "atclNm", "articleTitle"]) || pick(o, PRICE_KEYS));

function collect(data: unknown, out: Raw[], depth: number): Raw[] {
  if (depth > 8 || data === null || typeof data !== "object") return out;
  if (Array.isArray(data)) {
    for (const d of data) collect(d, out, depth + 1);
    return out;
  }
  const o = data as Raw;
  if (isArticle(o)) {
    out.push(o);
    return out;
  }
  for (const v of Object.values(o)) collect(v, out, depth + 1);
  return out;
}

/**
 * 응답 JSON 어디에 있든 매물 객체를 찾아낸다 (네이버 응답 형식이 바뀌어도 버티도록).
 * 네이버는 같은 집을 여러 중개사가 올리면 목록 한 칸에 묶어서 보내므로,
 * 목록 한 칸(배열 원소) 안에서 나온 매물은 첫 번째(대표 매물)만 쓰고 개수는 brokerCount로 남긴다.
 */
export function extractArticles(data: unknown, out: Raw[] = [], depth = 0): Raw[] {
  if (depth > 8 || data === null || typeof data !== "object") return out;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object" && !Array.isArray(item) && !isArticle(item as Raw)) {
        const found = collect(item, [], 0);
        if (found.length) {
          out.push({ ...found[0], __brokerCount: new Set(found.map((f) => String(pick(f, ID_KEYS)))).size });
          continue;
        }
      }
      extractArticles(item, out, depth + 1);
    }
    return out;
  }
  const o = data as Raw;
  if (isArticle(o)) {
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
  // 새 네이버 부동산(fin.land): priceInfo 안에 원 단위 금액
  const pi = o.priceInfo as Raw | undefined;
  const addr = o.address as Raw | undefined;
  const media = (o.articleMediaDto ?? o.articleMedia) as Raw | undefined;
  const finPrice = pi ? (won(pi.dealPrice) ?? won(pi.warrantyPrice) ?? 0) : undefined;
  const areaRaw = pick(flat, ["area2", "spc2", "exclusiveArea", "exclusiveSpace"]);
  return {
    id,
    name:
      [str(pick(flat, ["articleName", "complexName", "atclNm", "articleTitle"])), str(pick(flat, ["buildingName", "bildNm", "dongName"]))]
        .filter(Boolean)
        .join(" ") || "이름 없음",
    tradeType,
    price: finPrice !== undefined ? finPrice : parsePrice(pick(flat, PRICE_KEYS)),
    rent: pi ? won(pi.rentPrice) : parsePrice(pick(flat, ["rentPrc", "rentPrice", "monthlyRent"])),
    mgmtFee: pi ? won(pi.managementFeeAmount) : null,
    dong: str(addr?.sector ?? pick(flat, ["cortarName", "dongNm"])),
    estateType: (() => {
      const e = str(pick(flat, ["realEstateType", "realEstateTypeCode", "rletTpCd", "realEstateTypeName", "rletTpNm"])) ?? "";
      return ESTATE[e] ?? e;
    })(),
    lat: (() => { const c = addr?.coordinates as Raw | undefined; const v = Number(c?.yCoordinate ?? pick(flat, ["latitude", "lat"])); return v ? v : null; })(),
    lon: (() => { const c = addr?.coordinates as Raw | undefined; const v = Number(c?.xCoordinate ?? pick(flat, ["longitude", "lng", "lon"])); return v ? v : null; })(),
    address: addr ? [addr.division, addr.sector].filter(Boolean).join(" ") || null : null,
    imageUrl: str(media?.imageUrl ?? pick(flat, ["representativeImgUrl", "repImgUrl"])),
    supplyArea: (() => {
      const sp = o.spaceInfo as Raw | undefined;
      if (!sp) return null;
      const v = Number(ESTATE[String(o.realEstateType)] === "오피스텔" ? sp.contractSpace || sp.supplySpace : sp.supplySpace || sp.contractSpace);
      return v > 0 ? v : null;
    })(),
    brokerCount: typeof o.__brokerCount === "number" ? o.__brokerCount : 1,
    verification: (() => {
      const t = str((o.verificationInfo as Raw | undefined)?.verificationType);
      if (!t) return null;
      return t === "OWNER" ? "집주인" : t === "SITE" || t.startsWith("S_") ? "현장" : "확인매물";
    })(),
    area: areaRaw !== undefined && !isNaN(Number(areaRaw)) ? Number(areaRaw) : null,
    floor: str(pick(flat, ["floorInfo", "flrInfo", "floor"])),
    direction: direction(str(pick(flat, ["direction", "direcNm", "directionName"]))),
    desc: str(pick(flat, ["articleFeatureDesc", "atclFetrDesc", "articleFeatureDescription", "description"])),
    confirmed: str(pick(flat, ["articleConfirmYmd", "articleConfirmDate", "cfmYmd", "confirmDate", "exposureStartDate"])),
    url: `https://fin.land.naver.com/articles/${id}`,
    firstSeen: now,
    lastSeen: now,
    prevPrice: null,
    status: "new",
  };
}
