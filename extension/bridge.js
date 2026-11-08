// 페이지 → 확장 백그라운드로 전달
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.source !== "zip-ext") return;
  chrome.runtime.sendMessage({ type: "articles", url: e.data.url, data: e.data.data }).catch(() => {});
});
