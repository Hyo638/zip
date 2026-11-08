const $ = (id) => document.getElementById(id);
chrome.storage.local.get(["server", "token", "refreshMin", "sent", "lastStatus", "watchUrls"]).then((c) => {
  $("server").value = c.server || "http://localhost:3000";
  $("token").value = c.token || "";
  $("refresh").value = String(c.refreshMin || 0);
  $("urls").value = (c.watchUrls || []).join("\n");
  $("status").textContent = `누적 전송 ${c.sent || 0}건${c.lastStatus ? ` · 최근: ${c.lastStatus}` : ""}`;
});
$("save").onclick = async () => {
  await chrome.storage.local.set({ server: $("server").value.trim().replace(/\/$/, ""), token: $("token").value.trim(), refreshMin: Number($("refresh").value),
    watchUrls: $("urls").value.split("\n").map((u) => u.trim()).filter((u) => /^https:\/\/[^/]*land\.naver\.com\//.test(u)),
  });
  chrome.runtime.sendMessage({ type: "config-changed" });
  $("save").textContent = "저장됨 ✓";
  setTimeout(() => ($("save").textContent = "저장"), 1200);
};
$("now").onclick = () => chrome.runtime.sendMessage({ type: "refresh-now" });
chrome.storage.local.get("templates").then(({ templates = [] }) => {
  $("tpl").textContent = `기억된 지역 ${Array.isArray(templates) ? templates.length : 0}곳`;
});
$("clear").onclick = async () => {
  chrome.runtime.sendMessage({ type: "clear-templates" });
  $("tpl").textContent = "기억된 지역 0곳";
};
