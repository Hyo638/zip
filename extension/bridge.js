// 페이지 → 확장 백그라운드로 전달
let gotArticles = 0;
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.source !== "zip-ext") return;
  if (/boundedArticles|articleList|articles/i.test(e.data.url)) gotArticles++;
  safeSend({ type: "articles", url: e.data.url, data: e.data.data });
});

// 감시 탭이면: 페이지가 뜬 뒤 매물 목록을 끝까지 자동 스크롤해서 남은 매물도 불러오게 한다.
if (window === window.top) {
  chrome.runtime.sendMessage({ type: "am-i-watched" }).then((r) => {
    log({ event: "loaded", watched: !!r?.watched });
    if (r?.watched) setTimeout(openListThenScroll, 3000 + Math.random() * 15000); // 탭끼리 겹치지 않게 무작위 지연
  }).catch(() => {});
}

// 새로고침 직후에는 매물 목록 패널이 닫혀 있어서, 지도 위 "매물 215" 버튼을 눌러 목록을 연다
async function openListThenScroll() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 10; i++) {
    // 매물 목록 응답이 이미 왔으면 목록이 열려 있는 것
    if (gotArticles > 0) { log({ event: "list-already-loading", gotArticles }); break; }
    const btn = [...document.querySelectorAll("button, a, [role=button]")].find((el) =>
      /^매물\s*[\d,]+$/.test(el.textContent.replace(/\s+/g, " ").trim()),
    );
    if (btn) {
      log({ event: "click-list-button", text: btn.textContent.trim() });
      btn.click();
      await sleep(2500);
      break;
    }
    await sleep(1000);
    if (i === 9) log({ event: "list-button-not-found", buttons: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => t && t.length < 30).slice(0, 40) });
  }
  autoScroll();
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
  log({ event: "scroll-done", gotArticles, height: lastHeight, list: findList()?.className?.toString().slice(0, 80) });
}

function log(info) {
  safeSend({ type: "debug", info });
}

// 확장을 업데이트하면 이미 열려 있던 탭의 예전 스크립트는 확장과 연결이 끊긴다
// (Extension context invalidated). 이때는 조용히 멈추고, 탭이 새로고침되면 새 스크립트가 붙는다.
function safeSend(msg) {
  try {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {}
}
