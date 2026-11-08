const DEFAULTS = { server: "http://localhost:3000", refreshMin: 0, sent: 0, lastStatus: "", watchUrls: [], watchTabs: {} };

async function cfg() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "am-i-watched") {
    cfg().then(async (c) => {
      const url = Object.keys(c.watchTabs).find((u) => c.watchTabs[u] === sender.tab?.id);
      const { templates = {} } = await chrome.storage.local.get("templates");
      sendResponse({ watched: !!url, template: url ? templates[url] : null });
    });
    return true;
  }
  if (msg?.type === "save-template") {
    // 감시 탭에서 사용자가(또는 확장이) 목록을 열었을 때의 요청 형식을 그 감시 주소에 저장
    cfg().then(async (c) => {
      const url = Object.keys(c.watchTabs).find((u) => c.watchTabs[u] === sender.tab?.id);
      if (!url) return debug({ event: "template-ignored-not-watched", tab: sender.tab?.id, watchTabs: Object.values(c.watchTabs) });
      const { templates = {} } = await chrome.storage.local.get("templates");
      if (!templates[url]) debug({ event: "template-saved", body: (msg.req.body || "").slice(0, 400), reqUrl: msg.req.url.slice(0, 150) });
      templates[url] = msg.req;
      await chrome.storage.local.set({ templates });
    });
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
  // 서비스 워커는 기다리는 동안 꺼질 수 있어서 여기서는 기다리지 않는다.
  // 탭마다 간격은 각 탭(bridge.js)이 무작위로 늦게 시작해서 만든다.
  const watchTabs = {};
  for (const url of c.watchUrls) {
    const id = c.watchTabs[url];
    let tab = null;
    if (id) tab = await chrome.tabs.get(id).catch(() => null);
    if (tab && !/tradeTypes=B1-B2/.test(tab.url || "") && /tradeTypes=/.test(url)) {
      await chrome.tabs.remove(tab.id).catch(() => {}); // 예전(월세만) 주소로 열린 탭은 닫고 새로 연다
      tab = null;
    }
    if (tab) {
      watchTabs[url] = tab.id;
      await chrome.storage.local.set({ watchTabs: { ...c.watchTabs, ...watchTabs } });
      await chrome.tabs.reload(tab.id);
    } else {
      // 원하는 거래유형(전세 B1 + 월세 B2)이 항상 포함되도록 주소를 맞춘다
      const openUrl = url.replace(/tradeTypes=[^&]*/, "tradeTypes=B1-B2");
      tab = await chrome.tabs.create({ url: openUrl, active: false, pinned: true });
      watchTabs[url] = tab.id;
      await chrome.storage.local.set({ watchTabs: { ...c.watchTabs, ...watchTabs } });
    }
  }
  await chrome.storage.local.set({ watchTabs });
}

// 설치·업데이트·크롬 시작 때: 새로고침 주기를 다시 잡고, 감시 탭을 바로 새로고침해 새 스크립트가 붙게 한다
chrome.runtime.onInstalled.addListener(() => { schedule(); refreshAll(); });
chrome.runtime.onStartup.addListener(() => { schedule(); refreshAll(); });

async function debug(info) {
  const c = await cfg();
  fetch(`${c.server}/api/debug`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(info) }).catch(() => {});
}
