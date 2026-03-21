const STORAGE_KEYS = {
  savedPostUrls: "savedPostUrls",
};

const BUTTON_CLASS = "pm-job-saver-button";
const POST_FLAG = "data-pm-job-saver-injected";

const SELECTORS = {
  postContainers: [
    ".feed-shared-update-v2",
    "[data-urn*='activity']",
    ".occludable-update",
    "article",
  ],
  actionBars: [
    ".feed-shared-social-action-bar",
    ".social-actions-bar",
    "div[role='toolbar']",
  ],
  seeMoreButtons: [
    "button[aria-label*='See more']",
    ".feed-shared-inline-show-more-text__see-more-less-toggle",
    "button span[aria-hidden='true']",
  ],
  postText: [
    ".update-components-text",
    ".feed-shared-inline-show-more-text",
    "[data-test-id='main-feed-activity-card__commentary']",
  ],
  posterName: [
    ".update-components-actor__title span[dir='ltr']",
    ".feed-shared-actor__name",
    "a[href*='/in/'] span[aria-hidden='true']",
  ],
  posterHeadline: [
    ".update-components-actor__description",
    ".feed-shared-actor__description",
  ],
  posterProfileLink: [
    "a[href*='/in/']",
    "a[href*='/company/']",
  ],
  canonicalLink: [
    "a[href*='/posts/']",
    "a[href*='/feed/update/']",
  ],
};

function firstMatch(container, selectors) {
  for (const selector of selectors) {
    const node = container.querySelector(selector);
    if (node) return node;
  }
  return null;
}

function allPostContainers() {
  const seen = new Set();
  const results = [];
  SELECTORS.postContainers.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (!seen.has(node)) {
        seen.add(node);
        results.push(node);
      }
    });
  });
  return results;
}

function getLargestTextBlock(container) {
  const nodes = Array.from(container.querySelectorAll("span, p, div"));
  const sorted = nodes
    .map((node) => node.innerText?.trim() || "")
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return sorted[0] || "";
}

function extractPostUrl(container) {
  if (window.location.pathname.startsWith("/posts/")) {
    return window.location.href;
  }
  const anchor = firstMatch(container, SELECTORS.canonicalLink);
  return anchor?.href || window.location.href;
}

function extractLinks(container) {
  return Array.from(container.querySelectorAll("a[href]"))
    .map((anchor) => anchor.href)
    .filter((href) => href && !href.includes("linkedin.com/feed") && !href.includes("/reactions/"));
}

function extractText(container) {
  const textNode = firstMatch(container, SELECTORS.postText);
  return textNode?.innerText?.trim() || getLargestTextBlock(container);
}

async function expandSeeMore(container) {
  for (const selector of SELECTORS.seeMoreButtons) {
    const buttons = Array.from(container.querySelectorAll(selector));
    const button = buttons.find((candidate) =>
      candidate.textContent?.toLowerCase().includes("see more")
    );
    if (button instanceof HTMLElement) {
      button.click();
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      return;
    }
  }
}

async function getSavedPostUrls() {
  const storage = await chrome.storage.local.get(STORAGE_KEYS.savedPostUrls);
  return storage.savedPostUrls || [];
}

function setButtonState(button, state) {
  const states = {
    ready: { icon: "💾", title: "Save post" },
    capturing: { icon: "⏳", title: "Capturing post" },
    saved: { icon: "✅", title: "Saved" },
    already_saved: { icon: "✓", title: "Already saved" },
    error: { icon: "❌", title: "Failed to save" },
  };
  const current = states[state] || states.ready;
  button.textContent = current.icon;
  button.title = current.title;
  button.dataset.state = state;
  button.style.opacity = state === "already_saved" ? "0.65" : "1";
}

async function handleSaveClick(container, button) {
  try {
    setButtonState(button, "capturing");
    await expandSeeMore(container);

    const payload = {
      post_url: extractPostUrl(container),
      post_text: extractText(container),
      poster_name: firstMatch(container, SELECTORS.posterName)?.innerText?.trim() || "",
      poster_profile_url: firstMatch(container, SELECTORS.posterProfileLink)?.href || "",
      poster_headline: firstMatch(container, SELECTORS.posterHeadline)?.innerText?.trim() || "",
      links_in_post: extractLinks(container),
      saved_at: new Date().toISOString(),
    };

    const result = await chrome.runtime.sendMessage({ type: "CAPTURE_POST", payload });
    if (!result?.ok) {
      throw new Error(result?.message || "Unknown error");
    }
    setButtonState(button, result.status);
  } catch (error) {
    console.error("PM Job Saver failed to save post", error);
    setButtonState(button, "error");
  }
}

async function injectButton(container) {
  if (container.getAttribute(POST_FLAG) === "true") {
    return;
  }

  const actionBar = firstMatch(container, SELECTORS.actionBars);
  if (!actionBar) {
    return;
  }

  container.setAttribute(POST_FLAG, "true");
  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  Object.assign(button.style, {
    width: "28px",
    height: "28px",
    marginLeft: "8px",
    borderRadius: "999px",
    border: "1px solid rgba(15, 23, 42, 0.15)",
    background: "rgba(255, 255, 255, 0.9)",
    cursor: "pointer",
    fontSize: "14px",
    lineHeight: "1",
  });
  setButtonState(button, "ready");

  const savedPostUrls = await getSavedPostUrls();
  const postUrl = extractPostUrl(container);
  if (savedPostUrls.includes(postUrl)) {
    setButtonState(button, "already_saved");
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleSaveClick(container, button);
  });

  actionBar.appendChild(button);
}

function scanAndInject() {
  allPostContainers().forEach((container) => {
    void injectButton(container);
  });
}

scanAndInject();

const observer = new MutationObserver(() => {
  scanAndInject();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

