const DEFAULT_BACKEND_URL = "http://localhost:8000";
const DASHBOARD_URL = "http://localhost:5173";
const STORAGE_KEYS = {
  backendUrl: "backendUrl",
  savedPostUrls: "savedPostUrls",
  savedCount: "savedCount",
};

async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function setStorage(values) {
  return chrome.storage.local.set(values);
}

async function getBackendUrl() {
  const { backendUrl } = await getStorage(STORAGE_KEYS.backendUrl);
  return backendUrl || DEFAULT_BACKEND_URL;
}

async function markSaved(postUrl) {
  const storage = await getStorage([STORAGE_KEYS.savedPostUrls, STORAGE_KEYS.savedCount]);
  const savedPostUrls = storage.savedPostUrls || [];
  if (!savedPostUrls.includes(postUrl)) {
    savedPostUrls.push(postUrl);
  }
  await setStorage({
    [STORAGE_KEYS.savedPostUrls]: savedPostUrls,
    [STORAGE_KEYS.savedCount]: savedPostUrls.length,
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const storage = await getStorage([STORAGE_KEYS.backendUrl, STORAGE_KEYS.savedPostUrls, STORAGE_KEYS.savedCount]);
  await setStorage({
    [STORAGE_KEYS.backendUrl]: storage.backendUrl || DEFAULT_BACKEND_URL,
    [STORAGE_KEYS.savedPostUrls]: storage.savedPostUrls || [],
    [STORAGE_KEYS.savedCount]: storage.savedCount || 0,
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURE_POST") {
    void (async () => {
      try {
        const backendUrl = await getBackendUrl();
        const response = await fetch(`${backendUrl}/api/posts/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.payload),
        });

        if (!response.ok) {
          throw new Error(`Backend responded with ${response.status}`);
        }

        const body = await response.json();
        if (body.status === "saved" || body.status === "already_saved") {
          await markSaved(message.payload.post_url);
        }

        sendResponse({
          ok: true,
          status: body.status === "already_saved" ? "already_saved" : "saved",
          postId: body.post_id,
        });
      } catch (error) {
        sendResponse({ ok: false, status: "error", message: error.message });
      }
    })();
    return true;
  }

  if (message.type === "GET_EXTENSION_STATUS") {
    void (async () => {
      const backendUrl = await getBackendUrl();
      try {
        const response = await fetch(`${backendUrl}/health`);
        const body = await response.json();
        const storage = await getStorage([STORAGE_KEYS.savedCount]);
        sendResponse({
          ok: response.ok && body.status === "ok",
          backendUrl,
          dashboardUrl: DASHBOARD_URL,
          savedCount: storage.savedCount || 0,
        });
      } catch {
        const storage = await getStorage([STORAGE_KEYS.savedCount]);
        sendResponse({
          ok: false,
          backendUrl,
          dashboardUrl: DASHBOARD_URL,
          savedCount: storage.savedCount || 0,
        });
      }
    })();
    return true;
  }

  if (message.type === "SET_BACKEND_URL") {
    void setStorage({ [STORAGE_KEYS.backendUrl]: message.payload.backendUrl }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: DASHBOARD_URL });
  }
});

