// 페이지 → 확장 백그라운드로 전달
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.source !== "zip-ext") return;
  chrome.runtime.sendMessage({ type: "articles", url: e.data.url, data: e.data.data }).catch(() => {});
});

// 감시 탭이면: 페이지가 뜬 뒤 매물 목록을 끝까지 자동 스크롤해서 남은 매물도 불러오게 한다.
if (window === window.top) {
  chrome.runtime.sendMessage({ type: "am-i-watched" }).then((r) => {
    if (r?.watched) setTimeout(autoScroll, 3000);
  }).catch(() => {});
}

// 화면에서 가장 큰 스크롤 가능한 영역(=매물 목록)을 찾는다
function findList() {
  let best = null, bestScore = 0;
  for (const el of document.querySelectorAll("div, ul, section, main, aside")) {
    const st = getComputedStyle(el);
    if (!/(auto|scroll)/.test(st.overflowY)) continue;
    const extra = el.scrollHeight - el.clientHeight;
    if (extra < 50 || el.clientHeight < 150) continue;
    if (extra > bestScore) { best = el; bestScore = extra; }
  }
  return best || document.scrollingElement;
}

async function autoScroll() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let stable = 0, lastHeight = 0;
  for (let i = 0; i < 40 && stable < 3; i++) {
    const list = findList();
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event("scroll", { bubbles: true }));
    await sleep(1500 + Math.random() * 1000); // 다음 페이지 로딩 대기 (네이버에 몰아서 요청하지 않도록)
    const h = list.scrollHeight;
    stable = h === lastHeight ? stable + 1 : 0;
    lastHeight = h;
  }
  chrome.runtime.sendMessage({ type: "scroll-done" }).catch(() => {});
}
