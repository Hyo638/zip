const $ = (id) => document.getElementById(id);
chrome.storage.local.get(["server", "refreshMin", "sent", "lastStatus"]).then((c) => {
  $("server").value = c.server || "http://localhost:3000";
  $("refresh").value = String(c.refreshMin || 0);
  $("status").textContent = `누적 전송 ${c.sent || 0}건${c.lastStatus ? ` · 최근: ${c.lastStatus}` : ""}`;
});
$("save").onclick = async () => {
  await chrome.storage.local.set({ server: $("server").value.replace(/\/$/, ""), refreshMin: Number($("refresh").value) });
  chrome.runtime.sendMessage({ type: "config-changed" });
  $("save").textContent = "저장됨 ✓";
  setTimeout(() => ($("save").textContent = "저장"), 1200);
};
