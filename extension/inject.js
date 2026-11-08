// 페이지 안에서 실행: 네이버 부동산이 이미 받은 응답 중 매물 데이터만 골라 bridge.js로 넘긴다.
(() => {
  const LOOKS_LIKE = /"(articleNo|articleNumber|atclNo)"/;
  const post = (url, text) => {
    if (!text || !LOOKS_LIKE.test(text)) return;
    try {
      window.postMessage({ source: "zip-ext", url: String(url), data: JSON.parse(text) }, "*");
    } catch {}
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) res.clone().text().then((t) => post(res.url, t)).catch(() => {});
    } catch {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.addEventListener("load", () => {
      try {
        if (this.responseType === "" || this.responseType === "text") post(url, this.responseText);
        else if (this.responseType === "json") post(url, JSON.stringify(this.response));
      } catch {}
    });
    return origOpen.call(this, method, url, ...rest);
  };
})();
