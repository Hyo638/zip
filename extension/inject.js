// 페이지 안에서 실행: 네이버 부동산이 이미 받은 응답 중 매물 데이터만 골라 bridge.js로 넘긴다.
(() => {
  const LOOKS_LIKE = /"(articleNo|articleNumber|atclNo)"/;
  const post = (url, text) => {
    if (!text || !LOOKS_LIKE.test(text)) return;
    try {
      window.postMessage({ source: "zip-ext", url: String(url), data: JSON.parse(text) }, "*");
    } catch {}
  };

  // 매물 목록 요청 형식을 기록해 둔다 (탭이 화면에 안 보여도 같은 요청을 다시 보낼 수 있도록)
  const isListReq = (u) => /boundedArticles/.test(String(u));
  const captureReq = (url, method, headers, body) => {
    try {
      window.postMessage({ source: "zip-ext-req", req: { url: String(url), method: method || "GET", headers: headers || {}, body: typeof body === "string" ? body : null } }, "*");
    } catch {}
  };
  const plainHeaders = (h) => {
    try {
      if (!h) return {};
      if (h instanceof Headers) return Object.fromEntries(h.entries());
      return Array.isArray(h) ? Object.fromEntries(h) : { ...h };
    } catch { return {}; }
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const [input, init] = args;
      const url = typeof input === "string" ? input : input?.url;
      if (isListReq(url)) captureReq(url, init?.method || input?.method, plainHeaders(init?.headers || input?.headers), init?.body);
    } catch {}
    const res = await origFetch.apply(this, args);
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) res.clone().text().then((t) => post(res.url, t)).catch(() => {});
    } catch {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    (this.__zipHeaders ||= {})[k] = v;
    return origSetHeader.call(this, k, v);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__zipUrl && isListReq(this.__zipUrl)) captureReq(this.__zipUrl, this.__zipMethod, this.__zipHeaders, body);
    return origSend.call(this, body);
  };
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__zipUrl = url;
    this.__zipMethod = method;
    this.addEventListener("load", () => {
      try {
        if (this.responseType === "" || this.responseType === "text") post(url, this.responseText);
        else if (this.responseType === "json") post(url, JSON.stringify(this.response));
      } catch {}
    });
    return origOpen.call(this, method, url, ...rest);
  };

  // 확장이 "다시 보내기"를 요청하면, 기록해 둔 요청을 페이지를 넘겨 가며 끝까지 다시 보낸다.
  // (응답은 위의 fetch 감시를 거쳐 자동으로 집찾기로 전송됨)
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.data?.source !== "zip-ext-replay") return;
    const { url, method, headers, body } = e.data.req;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let payload = null;
    try { payload = body ? JSON.parse(body) : null; } catch {}
    const report = (info) => window.postMessage({ source: "zip-ext-log", info }, "*");
    let pages = 0, total = 0;
    const seen = new Set();
    // 네이버 목록은 articlePagingRequest.lastInfo(직전 응답의 result.lastInfo)로 다음 페이지를 요청한다
    const paging = payload?.articlePagingRequest;
    if (paging) paging.lastInfo = [];
    delete payload?.lastInfo;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await window.fetch(url, { method, headers, body: payload ? JSON.stringify(payload) : undefined, credentials: "include" });
        const j = await res.json();
        pages++;
        const list = j?.result?.list || [];
        const ids = list.map((x) => JSON.stringify(x).match(/"articleNumber":"(\d+)"/)?.[1]).filter(Boolean);
        const fresh = ids.filter((id) => !seen.has(id));
        ids.forEach((id) => seen.add(id));
        total += list.length;
        if (!j?.result?.hasNextPage || !paging || !j.result.lastInfo || (ids.length && !fresh.length)) break;
        paging.lastInfo = j.result.lastInfo;
      } catch (err) {
        report({ event: "replay-error", message: String(err).slice(0, 200) });
        break;
      }
      await sleep(1200 + Math.random() * 800);
    }
    report({ event: "replay-done", pages, total, unique: seen.size, dong: payload?.filter?.legalDivisionNumbers?.[0] });
  });
})();
