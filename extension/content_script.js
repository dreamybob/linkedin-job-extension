const STORAGE_KEYS = {
  savedPostUrls: "savedPostUrls",
};

const BUTTON_CLASS = "pm-job-saver-button";
const POST_FLAG = "data-pm-job-saver-injected";
const ACTION_BAR_FLAG = "data-pm-job-saver-action-injected";
const DEBUG = false;
const DEBUG_PREFIX = "[PM Job Saver]";

const SHARED_SELECTORS = {
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

const FEED_SELECTORS = {
  containers: [
    ".feed-shared-update-v2",
    "[data-urn*='activity']",
    ".occludable-update",
    "article",
  ],
  actionBars: [
    ".feed-shared-social-action-bar",
    ".social-actions-bar",
  ],
  toolbarFallback: [
    "div[role='toolbar']",
  ],
};

const SEARCH_SELECTORS = {
  headings: "h2",
  textBox: "[data-testid='expandable-text-box']",
  textButton: "[data-testid='expandable-text-button']",
  actionBars: [
    "div[role='toolbar']",
  ],
  actionLabels: ["like", "comment", "repost", "send", "share"],
};

function debugLog(message, details) {
  if (!DEBUG) {
    return;
  }

  if (details === undefined) {
    console.log(`${DEBUG_PREFIX} ${message}`);
    return;
  }

  console.log(`${DEBUG_PREFIX} ${message}`, details);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function firstMatch(container, selectors) {
  for (const selector of selectors) {
    const node = container.querySelector(selector);
    if (node) {
      return node;
    }
  }

  return null;
}

function collectMatches(container, selectors) {
  const seen = new Set();
  const matches = [];

  selectors.forEach((selector) => {
    container.querySelectorAll(selector).forEach((node) => {
      if (!seen.has(node)) {
        seen.add(node);
        matches.push(node);
      }
    });
  });

  return matches;
}

function collectDocumentMatches(selectors) {
  const seen = new Set();
  const matches = [];

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (!seen.has(node)) {
        seen.add(node);
        matches.push(node);
      }
    });
  });

  return matches;
}

function isVisible(node) {
  const style = window.getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return node.getClientRects().length > 0;
}

function hasSocialActionButtons(node, labels = SEARCH_SELECTORS.actionLabels, minimumMatches = 3) {
  const controls = Array.from(node.querySelectorAll("button, a"));
  const matchedLabels = labels.filter((label) =>
    controls.some((control) => control.textContent?.toLowerCase().includes(label))
  );
  return matchedLabels.length >= minimumMatches;
}

function getLargestTextBlock(container) {
  const nodes = Array.from(container.querySelectorAll("span, p, div"));
  const sorted = nodes
    .map((node) => node.innerText?.trim() || "")
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return sorted[0] || "";
}

function normalizePostUrl(url) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url, window.location.origin);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function buildActivityUrl(activityUrn) {
  if (!activityUrn) {
    return "";
  }

  return normalizePostUrl(`${window.location.origin}/feed/update/${activityUrn}/`);
}

function findActivityUrn(container) {
  const candidates = [
    container,
    container.closest("[data-urn*='activity']"),
    container.querySelector("[data-urn*='activity']"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const urn = candidate.getAttribute?.("data-urn")?.trim();
    if (urn?.includes("activity")) {
      return urn;
    }
  }

  return "";
}

function extractDefaultPostUrl(container) {
  if (
    window.location.pathname.startsWith("/posts/") ||
    window.location.pathname.startsWith("/feed/update/")
  ) {
    return normalizePostUrl(window.location.href);
  }

  const anchor = firstMatch(container, SHARED_SELECTORS.canonicalLink);
  if (anchor?.href) {
    return normalizePostUrl(anchor.href);
  }

  const activityUrn = findActivityUrn(container);
  if (activityUrn) {
    return buildActivityUrl(activityUrn);
  }

  return "";
}

function extractLinks(container) {
  return Array.from(container.querySelectorAll("a[href]"))
    .map((anchor) => anchor.href)
    .filter((href) => href && !href.includes("linkedin.com/feed") && !href.includes("/reactions/"));
}

function extractSharedText(container) {
  const textNode = firstMatch(container, SHARED_SELECTORS.postText);
  return textNode?.innerText?.trim() || getLargestTextBlock(container);
}

function extractPosterName(container) {
  return firstMatch(container, SHARED_SELECTORS.posterName)?.innerText?.trim() || "";
}

function extractPosterHeadline(container) {
  return firstMatch(container, SHARED_SELECTORS.posterHeadline)?.innerText?.trim() || "";
}

function extractPosterProfileUrl(container) {
  return firstMatch(container, SHARED_SELECTORS.posterProfileLink)?.href || "";
}

async function expandSharedSeeMore(container) {
  for (const selector of SHARED_SELECTORS.seeMoreButtons) {
    const buttons = Array.from(container.querySelectorAll(selector));
    const button = buttons.find((candidate) =>
      candidate.textContent?.toLowerCase().includes("see more")
    );
    if (button instanceof HTMLElement) {
      button.click();
      await sleep(400);
      return;
    }
  }
}

function createButton() {
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
  return button;
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

function lastVisibleCandidate(candidates) {
  return candidates.filter((candidate) => isVisible(candidate)).at(-1) || null;
}

function findFeedActionBar(container) {
  const exactCandidates = collectMatches(container, FEED_SELECTORS.actionBars);
  const socialExactCandidates = exactCandidates.filter(
    (candidate) => isVisible(candidate) && hasSocialActionButtons(candidate, SEARCH_SELECTORS.actionLabels, 2)
  );
  if (socialExactCandidates.length > 0) {
    return socialExactCandidates.at(-1);
  }

  const visibleExactCandidate = lastVisibleCandidate(exactCandidates);
  if (visibleExactCandidate) {
    return visibleExactCandidate;
  }

  const toolbarCandidates = collectMatches(container, FEED_SELECTORS.toolbarFallback).filter(
    (candidate) => isVisible(candidate) && hasSocialActionButtons(candidate)
  );
  return toolbarCandidates.at(-1) || null;
}

function isSearchPostHeading(heading) {
  return heading.textContent?.trim().toLowerCase() === "feed post";
}

function findSearchStructuralActionBar(container) {
  const toolbarCandidates = collectMatches(container, SEARCH_SELECTORS.actionBars).filter(
    (candidate) => isVisible(candidate) && hasSocialActionButtons(candidate)
  );
  if (toolbarCandidates.length > 0) {
    return toolbarCandidates.at(-1);
  }

  const structuralCandidates = Array.from(container.querySelectorAll("div")).filter(
    (candidate) => isVisible(candidate) && hasSocialActionButtons(candidate)
  );
  return structuralCandidates.at(-1) || null;
}

function findSearchContainerFromHeading(heading) {
  let current = heading.parentElement;
  let textOnlyMatch = null;

  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const hasTextBox = Boolean(current.querySelector(SEARCH_SELECTORS.textBox));
    if (!hasTextBox) {
      continue;
    }

    if (findSearchStructuralActionBar(current)) {
      return current;
    }

    if (!textOnlyMatch) {
      textOnlyMatch = current;
    }
  }

  return textOnlyMatch;
}

function buildSearchFallbackUrl(container, strategy) {
  const componentKey =
    container.getAttribute("componentkey") ||
    container.querySelector("[componentkey]")?.getAttribute("componentkey");
  if (componentKey) {
    return `${window.location.origin}/pm-job-saver/search-post/${encodeURIComponent(componentKey)}`;
  }

  const text = strategy.extractText(container)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (text) {
    return `${window.location.origin}/pm-job-saver/search-post/${text}`;
  }

  return `${window.location.origin}/pm-job-saver/search-post/unknown`;
}

const FEED_STRATEGY = {
  name: "feed",
  matches(pathname) {
    return !pathname.startsWith("/search/results/");
  },
  findContainers() {
    return collectDocumentMatches(FEED_SELECTORS.containers);
  },
  findActionBar(container) {
    return findFeedActionBar(container);
  },
  extractText(container) {
    return extractSharedText(container);
  },
  extractPostUrl(container) {
    return extractDefaultPostUrl(container);
  },
  async expandSeeMore(container) {
    await expandSharedSeeMore(container);
  },
};

const SEARCH_STRATEGY = {
  name: "search",
  matches(pathname) {
    return pathname.startsWith("/search/results/");
  },
  findContainers() {
    const seen = new Set();
    const results = [];

    document.querySelectorAll(SEARCH_SELECTORS.headings).forEach((heading) => {
      if (!isSearchPostHeading(heading)) {
        return;
      }

      const candidate = findSearchContainerFromHeading(heading);
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        results.push(candidate);
      }
    });

    return results;
  },
  findActionBar(container) {
    return findSearchStructuralActionBar(container);
  },
  extractText(container) {
    const textNode = container.querySelector(SEARCH_SELECTORS.textBox);
    return textNode?.innerText?.trim() || extractSharedText(container);
  },
  extractPostUrl(container) {
    return extractDefaultPostUrl(container) || buildSearchFallbackUrl(container, SEARCH_STRATEGY);
  },
  async expandSeeMore(container) {
    const button = container.querySelector(SEARCH_SELECTORS.textButton);
    if (
      button instanceof HTMLElement &&
      button.textContent?.toLowerCase().includes("more")
    ) {
      button.click();
      await sleep(400);
      return;
    }

    await expandSharedSeeMore(container);
  },
};

const STRATEGIES = [SEARCH_STRATEGY, FEED_STRATEGY];

function getStrategy() {
  const pathname = window.location.pathname;
  return STRATEGIES.find((strategy) => strategy.matches(pathname)) || FEED_STRATEGY;
}

function buildPayload(container, strategy) {
  return {
    post_url: strategy.extractPostUrl(container),
    post_text: strategy.extractText(container),
    poster_name: extractPosterName(container),
    poster_profile_url: extractPosterProfileUrl(container),
    poster_headline: extractPosterHeadline(container),
    links_in_post: extractLinks(container),
    saved_at: new Date().toISOString(),
  };
}

async function handleSaveClick(container, button, strategy) {
  try {
    setButtonState(button, "capturing");
    await strategy.expandSeeMore(container);

    const payload = buildPayload(container, strategy);
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

async function injectButton(container, strategy) {
  if (container.getAttribute(POST_FLAG) === "true") {
    return;
  }

  const actionBar = strategy.findActionBar(container);
  if (!actionBar) {
    debugLog("skip: no action bar", {
      strategy: strategy.name,
      path: window.location.pathname,
    });
    return;
  }

  if (
    actionBar.getAttribute(ACTION_BAR_FLAG) === "true" ||
    actionBar.querySelector(`.${BUTTON_CLASS}`)
  ) {
    container.setAttribute(POST_FLAG, "true");
    return;
  }

  container.setAttribute(POST_FLAG, "true");
  actionBar.setAttribute(ACTION_BAR_FLAG, "true");

  const button = createButton();
  setButtonState(button, "ready");
  actionBar.appendChild(button);

  const postUrl = strategy.extractPostUrl(container);
  const savedPostUrls = await getSavedPostUrls();
  if (postUrl && savedPostUrls.includes(postUrl)) {
    setButtonState(button, "already_saved");
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleSaveClick(container, button, strategy);
  });
}

function scanAndInject() {
  const strategy = getStrategy();
  const containers = strategy.findContainers();
  debugLog("scan", {
    strategy: strategy.name,
    path: window.location.pathname,
    containersFound: containers.length,
  });

  containers.forEach((container) => {
    void injectButton(container, strategy);
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
