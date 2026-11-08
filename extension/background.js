const DEFAULTS = { server: "http://localhost:3000", refreshMin: 0, sent: 0, lastStatus: "", watchUrls: [], watchTabs: {} };

async function cfg() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "am-i-watched") {
    cfg().then((c) => sendResponse({ watched: Object.values(c.watchTabs).includes(sender.tab?.id) }));
    return true;
  }
  if (msg?.type === "articles") send(msg);
  if (msg?.type === "debug") debug({ ...msg.info, tab: sender.tab?.id, url: sender.tab?.url });
  if (msg?.type === "config-changed") schedule();
  if (msg?.type === "refresh-now") refreshAll();
});

async function send(msg) {
  const c = await cfg();
  try {
    const r = await fetch(`${c.server}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: msg.url, data: msg.data }),
    });
    const j = await r.json();
    await chrome.storage.local.set({
      sent: c.sent + (j.total || 0),
      lastStatus: `${new Date().toLocaleTimeString()} · ${j.total ?? 0}건 전송, 새/변동 ${j.changed ?? 0}건`,
    });
  } catch (e) {
    await chrome.storage.local.set({ lastStatus: `전송 실패: 집찾기 서버(${c.server})가 켜져 있는지 확인하세요` });
  }
}

// 자동 새로고침: 열려 있는 네이버 부동산 탭을 주기적으로 다시 불러와 새 매물을 받는다.
async function schedule() {
  const c = await cfg();
  await chrome.alarms.clear("refresh");
  if (c.refreshMin > 0) chrome.alarms.create("refresh", { periodInMinutes: Number(c.refreshMin) });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "refresh") refreshAll();
});

// 감시 주소가 있으면 그 주소들을 고정 탭으로 열어 두고 새로고침, 없으면 열린 네이버 부동산 탭 전부 새로고침
async function refreshAll() {
  const c = await cfg();
  debug({ event: "refreshAll", watchUrls: c.watchUrls.length, watchTabs: c.watchTabs });
  if (!c.watchUrls.length) {
    const tabs = await chrome.tabs.query({ url: "*://*.land.naver.com/*" });
    for (const t of tabs) chrome.tabs.reload(t.id);
    return;
  }
  const watchTabs = {};
  for (const url of c.watchUrls) {
    const id = c.watchTabs[url];
    let tab = null;
    if (id) tab = await chrome.tabs.get(id).catch(() => null);
    if (tab) {
      await chrome.tabs.reload(tab.id);
    } else {
      tab = await chrome.tabs.create({ url, active: false, pinned: true });
    }
    watchTabs[url] = tab.id;
    await chrome.storage.local.set({ watchTabs: { ...c.watchTabs, ...watchTabs } }); // 탭이 뜨기 전에 감시 탭으로 등록
    await new Promise((r) => setTimeout(r, 15000)); // 한 탭의 자동 스크롤이 어느 정도 끝난 뒤 다음 탭으로
  }
  await chrome.storage.local.set({ watchTabs });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);

async function debug(info) {
  const c = await cfg();
  fetch(`${c.server}/api/debug`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(info) }).catch(() => {});
}
