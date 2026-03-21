const backendUrlInput = document.getElementById("backend-url");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const savedCount = document.getElementById("saved-count");
const saveSettingsButton = document.getElementById("save-settings");
const openDashboardButton = document.getElementById("open-dashboard");

function renderStatus({ ok, backendUrl, savedCount: total }) {
  backendUrlInput.value = backendUrl;
  savedCount.textContent = total;
  statusDot.classList.toggle("online", ok);
  statusDot.classList.toggle("offline", !ok);
  statusText.textContent = ok ? "Backend connected." : "Backend unreachable.";
}

async function refresh() {
  const status = await chrome.runtime.sendMessage({ type: "GET_EXTENSION_STATUS" });
  renderStatus(status);
}

saveSettingsButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "SET_BACKEND_URL",
    payload: { backendUrl: backendUrlInput.value.trim() || "http://localhost:8000" },
  });
  await refresh();
});

openDashboardButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
});

void refresh();

