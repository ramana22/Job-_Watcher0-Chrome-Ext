const HIRING_CAFE_URL = "https://hiring.cafe/";
const SEARCH_ENDPOINT = "https://hiring.cafe/api/search-jobs";
const ALARM_NAME = "hiringCafeFetch";
const MIN_INTERVAL_MINUTES = 15;

const DEFAULT_SENIORITY_FILTER = [
  "No Prior Experience Required",
  "Entry Level",
  "Mid Level",
];

const DEFAULT_CONFIG = {
  keyword: ".Net developer",
  intervalMinutes: 120,
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  smtpUser: "ramanagajula1999@gmail.com",
  smtpPass: "jsrkmzzimefqnljt",
  mailFrom: "ramanagajula1999@gmail.com",
  mailTo: "ramanagajula001@gmail.com",
  seniorityLevel: DEFAULT_SENIORITY_FILTER,
};

function ensureConfigShape(config) {
  return {
    keyword: config.keyword || DEFAULT_CONFIG.keyword,
    intervalMinutes: Number(config.intervalMinutes) || DEFAULT_CONFIG.intervalMinutes,
    smtpHost: config.smtpHost || DEFAULT_CONFIG.smtpHost,
    smtpPort: Number(config.smtpPort) || DEFAULT_CONFIG.smtpPort,
    smtpUser: config.smtpUser || DEFAULT_CONFIG.smtpUser,
    smtpPass: config.smtpPass || DEFAULT_CONFIG.smtpPass,
    mailFrom: config.mailFrom || config.smtpUser || DEFAULT_CONFIG.mailFrom,
    mailTo: config.mailTo || config.email || DEFAULT_CONFIG.mailTo,
    seniorityLevel:
      Array.isArray(config.seniorityLevel) && config.seniorityLevel.length
        ? config.seniorityLevel
        : DEFAULT_SENIORITY_FILTER,
  };
}

function setAlarm(intervalMinutes) {
  const minutes = Math.max(MIN_INTERVAL_MINUTES, Number(intervalMinutes) || DEFAULT_CONFIG.intervalMinutes);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: minutes, delayInMinutes: 1 });
}

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["config"], (data) => {
      resolve(ensureConfigShape(data?.config || DEFAULT_CONFIG));
    });
  });
}

function buildSearchState(keyword, seniorityLevel = DEFAULT_SENIORITY_FILTER) {
  return {
    searchQuery: keyword,
    seniorityLevel: Array.isArray(seniorityLevel) && seniorityLevel.length
      ? seniorityLevel
      : DEFAULT_SENIORITY_FILTER,
  };
}

function buildSearchUrl(keyword, seniorityLevel = DEFAULT_SENIORITY_FILTER) {
  const state = buildSearchState(keyword, seniorityLevel);
  return `${HIRING_CAFE_URL}?searchState=${encodeURIComponent(JSON.stringify(state))}`;
}

function isRateLimited(status, bodyText = "", errorMessage = "") {
  return status === 429 || /too many requests/i.test(bodyText) || /too many requests/i.test(errorMessage);
}

function getRetryDelay(response, attempt) {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return Math.max(seconds * 1000, 1000);
    }
    const dateTarget = Date.parse(retryAfter);
    if (!Number.isNaN(dateTarget)) {
      const delayMs = dateTarget - Date.now();
      if (delayMs > 0) return delayMs;
    }
  }
  // Back off with jitter: 60s, 120s, 180s ...
  const base = 60000 * attempt;
  const jitter = Math.floor(Math.random() * 5000);
  return base + jitter;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for hiring.cafe to load"));
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function fetchJobsInRealBrowser(config, attempt = 1, maxAttempts = 3) {
  const targetUrl = buildSearchUrl(config.keyword, config.seniorityLevel);

  const tabId = await new Promise((resolve, reject) => {
    chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error || !tab?.id) {
        reject(new Error(error?.message || "Unable to open hiring.cafe tab"));
      } else {
        resolve(tab.id);
      }
    });
  });

  try {
    await waitForTabComplete(tabId);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [SEARCH_ENDPOINT, buildSearchState(config.keyword, config.seniorityLevel)],
      func: async (endpoint, searchState) => {
        try {
          // Give the page a moment to set any session cookies before posting.
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // Warm the session with a same-origin GET to mirror browser traffic even when the
          // tab is backgrounded.
          await fetch(window.location.href, { credentials: "include", mode: "same-origin" });

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/plain, */*",
            },
            credentials: "include",
            mode: "same-origin",
            body: JSON.stringify({ searchState }),
          });

          const text = await response.text();
          return { ok: response.ok, status: response.status, text };
        } catch (err) {
          return { ok: false, status: 0, error: err?.message || String(err) };
        }
      },
    });

    const bodyText = result?.text || "";
    let parsed;

    try {
      parsed = bodyText ? JSON.parse(bodyText) : {};
    } catch (parseError) {
      parsed = {};
    }

    if (!result?.ok || parsed?.error) {
      const rateLimited = isRateLimited(result?.status, bodyText, parsed?.error || result?.error);
      if (rateLimited && attempt < maxAttempts) {
        const delay = getRetryDelay({ headers: new Headers() }, attempt);
        console.warn(
          `[Hiring Cafe Watcher] Rate limited in browser tab (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delay / 1000)}s...`
        );
        await wait(delay);
        return fetchJobsInRealBrowser(config, attempt + 1, maxAttempts);
      }

      if (result?.status === 403 && attempt < maxAttempts) {
        console.warn(
          `[Hiring Cafe Watcher] 403 forbidden from browser tab (attempt ${attempt}/${maxAttempts}). Retrying after reload...`
        );
        await wait(1000);
        return fetchJobsInRealBrowser(config, attempt + 1, maxAttempts);
      }

      if (/an error occurred while searching/i.test(bodyText) && attempt < maxAttempts) {
        const delay = 2000 * attempt;
        console.warn(
          `[Hiring Cafe Watcher] Search failed in browser tab (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delay / 1000)}s...`
        );
        await wait(delay);
        return fetchJobsInRealBrowser(config, attempt + 1, maxAttempts);
      }

      const reason = parsed?.error || bodyText || result?.error || `status ${result?.status}`;
      throw new Error(`Search request failed in browser tab: ${reason}`);
    }

    const jobs = Array.isArray(parsed?.results)
      ? parsed.results
      : Array.isArray(parsed?.data)
        ? parsed.data
        : Array.isArray(parsed)
          ? parsed
          : [];

    return jobs;
  } finally {
    chrome.tabs.remove(tabId, () => {});
  }
}

function formatJobs(keyword, jobs) {
  if (!jobs.length) {
    return `No results found for "${keyword}" at ${new Date().toISOString()}.`;
  }

  const lines = jobs.map((job, index) => {
    const info = job.job_information || job;
    const jobId = job.job_id || job.id || job.objectID || job.requisition_id || "";
    const title = info.job_title || info.title || "Untitled role";
    const company = info.company_name || info.company || job.company_name || job.company || "Unknown company";
    const url = job.apply_url || info.job_url || job.job_url || job.url || "";
    const location = info.formatted_workplace_location || info.location || job.location || job.job_location || "";
    const description = info.description || info.job_description || "";

    return [
      `#${index + 1} ${title}`,
      company ? `Company: ${company}` : null,
      location ? `Location: ${location}` : null,
      jobId ? `Job ID: ${jobId}` : null,
      url ? `Job URL: ${url}` : null,
      description ? `Description: ${description.replace(/\s+/g, " ").trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const divider = "\n\n----------------------------------------\n\n";
  return `Hiring.cafe search results for "${keyword}" as of ${new Date().toISOString()}\n\n${lines.join(divider)}`;
}

async function sendEmail(config, jobs) {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass || !config.mailTo) {
    throw new Error("SMTP host, credentials, and recipient email are required.");
  }

  const payload = {
    Host: config.smtpHost,
    Username: config.smtpUser,
    Password: config.smtpPass,
    To: config.mailTo,
    From: config.mailFrom || config.smtpUser,
    Subject: `Hiring.cafe results for ${config.keyword}`,
    Body: formatJobs(config.keyword, jobs).replace(/\n/g, "<br>"),
    Port: Number(config.smtpPort) || DEFAULT_CONFIG.smtpPort,
  };

  const response = await fetch("https://smtpjs.com/v3/smtpjs.aspx?", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok || text.toLowerCase().includes("error")) {
    throw new Error(`SMTP send failed (${response.status}): ${text}`);
  }
}

function downloadFile(filename, content, mimeType = "text/plain") {
  const url = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  chrome.downloads.download({ url, filename }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error(`[Hiring Cafe Watcher] Download failed for ${filename}:`, chrome.runtime.lastError.message);
    } else {
      console.info(`[Hiring Cafe Watcher] Saved ${filename} (download ${downloadId}).`);
    }
  });
}

function saveJobsToFiles(keyword, jobs) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary = formatJobs(keyword, jobs);
  const baseName = `hiring-cafe/${encodeURIComponent(keyword)}`;

  downloadFile(`${baseName}-${timestamp}.txt`, summary, "text/plain");
  downloadFile(`${baseName}-${timestamp}.json`, JSON.stringify(jobs, null, 2), "application/json");
}

async function runJobSearch() {
  const config = await getConfig();
  try {
    const jobs = await fetchJobsInRealBrowser(config);
    await sendEmail(config, jobs);
    saveJobsToFiles(config.keyword, jobs);

    const summary = {
      jobsCount: jobs.length,
      mailTo: config.mailTo,
      keyword: config.keyword,
    };

    console.info(
      `[Hiring Cafe Watcher] Sent ${summary.jobsCount} results for "${summary.keyword}" to ${summary.mailTo || "<no-email-set>"}.`
    );

    return summary;
  } catch (error) {
    console.error("[Hiring Cafe Watcher]", error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["config"], (data) => {
    const config = ensureConfigShape(data?.config || DEFAULT_CONFIG);
    chrome.storage.sync.set({ config }, () => {
      setAlarm(config.intervalMinutes);
    });
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.config) {
    const newConfig = ensureConfigShape(changes.config.newValue || DEFAULT_CONFIG);
    setAlarm(newConfig.intervalMinutes);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runJobSearch();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "openSite") {
    chrome.tabs.create({ url: HIRING_CAFE_URL }, (tab) => {
      sendResponse({ tabId: tab?.id });
    });
    return true;
  }

  if (message?.type === "saveText") {
    const filename = message.filename || "hiring-cafe/net-developer-responses.txt";
    const content = message.text || "";
    const url = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;

    chrome.downloads.download({ url, filename }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }

  if (message?.type === "saveJson") {
    const filename = message.filename || "hiring-cafe/search-jobs.json";
    const content = message.content || "{}";
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(content)}`;

    chrome.downloads.download({ url, filename }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }

  if (message?.type === "runJobSearchNow") {
    runJobSearch()
      .then((summary) =>
        sendResponse({ success: true, summary })
      )
      .catch((error) => sendResponse({ success: false, error: error?.message }));
    return true;
  }
});
