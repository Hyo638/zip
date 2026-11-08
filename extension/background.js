const DEFAULTS = { server: "http://localhost:3000", refreshMin: 0, sent: 0, lastStatus: "", watchUrls: [], watchTabs: {} };

async function cfg() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "am-i-watched") {
    cfg().then(async (c) => {
      const ids = c.watchUrls.map((u) => c.watchTabs[u]).filter(Boolean);
      const watched = ids.includes(sender.tab?.id);
      const { templates = [] } = await chrome.storage.local.get("templates");
      // 기억된 목록 요청은 첫 번째 감시 탭 하나에서만 차례로 다시 보낸다 (중복 요청 방지)
      const first = ids[0] === sender.tab?.id;
      sendResponse({ watched, templates: watched && first && Array.isArray(templates) ? templates.map((t) => t.req) : [] });
    });
    return true;
  }
  if (msg?.type === "save-template") {
    // 동(법정동) 단위로 걸러진 매물 목록 요청만 기억한다. 동마다 1개, 최대 8개.
    (async () => {
      let j;
      try { j = JSON.parse(msg.req.body); } catch { return; }
      const dongCode = j?.filter?.legalDivisionNumbers?.[0];
      if (!dongCode) return; // 지도 화면 범위로만 걸러진 요청은 다른 동 매물이 섞이므로 쓰지 않는다
      delete j.lastInfo;
      if ("page" in j) j.page = 0;
      const body = JSON.stringify(j);
      let { templates = [] } = await chrome.storage.local.get("templates");
      if (!Array.isArray(templates)) templates = [];
      const isNew = !templates.some((t) => t.key === dongCode);
      templates = [{ key: dongCode, req: { ...msg.req, body }, at: Date.now() }, ...templates.filter((t) => t.key !== dongCode && t.key.length === 10)].slice(0, 8);
      await chrome.storage.local.set({ templates });
      if (isNew) debug({ event: "template-saved", dongCode, count: templates.length, body });
    })();
  }
  if (msg?.type === "clear-templates") chrome.storage.local.set({ templates: [] });
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
    if (tab) {
      watchTabs[url] = tab.id;
      await chrome.storage.local.set({ watchTabs: { ...c.watchTabs, ...watchTabs } });
      await chrome.tabs.reload(tab.id);
    } else {
      tab = await chrome.tabs.create({ url, active: false, pinned: true });
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
