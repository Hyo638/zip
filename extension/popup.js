const $ = (id) => document.getElementById(id);
chrome.storage.local.get(["server", "refreshMin", "sent", "lastStatus", "watchUrls"]).then((c) => {
  $("server").value = c.server || "http://localhost:3000";
  $("refresh").value = String(c.refreshMin || 0);
  $("urls").value = (c.watchUrls || []).join("\n");
  $("status").textContent = `누적 전송 ${c.sent || 0}건${c.lastStatus ? ` · 최근: ${c.lastStatus}` : ""}`;
});
$("save").onclick = async () => {
  await chrome.storage.local.set({ server: $("server").value.replace(/\/$/, ""), refreshMin: Number($("refresh").value),
    watchUrls: $("urls").value.split("\n").map((u) => u.trim()).filter((u) => /^https:\/\/[^/]*land\.naver\.com\//.test(u)),
  });
  chrome.runtime.sendMessage({ type: "config-changed" });
  $("save").textContent = "저장됨 ✓";
  setTimeout(() => ($("save").textContent = "저장"), 1200);
};
$("now").onclick = () => chrome.runtime.sendMessage({ type: "refresh-now" });
