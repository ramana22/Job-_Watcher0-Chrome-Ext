const HIRING_CAFE_URL = "https://hiring.cafe/";
const SEARCH_ENDPOINT = "https://hiring.cafe/api/search-jobs";
const ALARM_NAME = "hiringCafeFetch";
const MIN_INTERVAL_MINUTES = 15;

const DEFAULT_CONFIG = {
  keyword: ".Net developer",
  email: "",
  webhookUrl: "",
  intervalMinutes: 120,
};

function ensureConfigShape(config) {
  return {
    keyword: config.keyword || DEFAULT_CONFIG.keyword,
    email: config.email || DEFAULT_CONFIG.email,
    webhookUrl: config.webhookUrl || DEFAULT_CONFIG.webhookUrl,
    intervalMinutes: Number(config.intervalMinutes) || DEFAULT_CONFIG.intervalMinutes,
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

async function fetchJobs(keyword) {
  const params = new URLSearchParams({ search: keyword });
  const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }
  const data = await response.json();
  const jobs = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return jobs;
}

function formatJobs(keyword, jobs) {
  if (!jobs.length) {
    return `No results found for "${keyword}" at ${new Date().toISOString()}.`;
  }

  const lines = jobs.map((job, index) => {
    const jobId = job.job_id || job.id || "";
    const title = job.job_title || job.title || "Untitled role";
    const company = job.company_name || job.company || "Unknown company";
    const url = job.job_url || job.url || "";
    const location = job.location || job.job_location || "";

    return [
      `#${index + 1} ${title}`,
      company ? `Company: ${company}` : null,
      location ? `Location: ${location}` : null,
      jobId ? `Job ID: ${jobId}` : null,
      url ? `Job URL: ${url}` : null,
      job.description ? `Description: ${job.description}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `Hiring.cafe search results for "${keyword}" as of ${new Date().toISOString()}\n\n${lines.join(
    "\n\n----------------------------------------\n\n"
  )}`;
}

async function sendEmail(config, jobs) {
  if (!config.webhookUrl) {
    throw new Error("No webhook URL configured for email delivery.");
  }
  if (!config.email) {
    throw new Error("No recipient email configured.");
  }

  const payload = {
    to: config.email,
    subject: `Hiring.cafe results for ${config.keyword}`,
    body: formatJobs(config.keyword, jobs),
  };

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Email webhook failed with status ${response.status}: ${text}`);
  }
}

async function runJobSearch() {
  const config = await getConfig();
  try {
    const jobs = await fetchJobs(config.keyword);
    await sendEmail(config, jobs);
    console.info(
      `[Hiring Cafe Watcher] Sent ${jobs.length} results for "${config.keyword}" to ${config.email || "<no-email-set>"}.`
    );
  } catch (error) {
    console.error("[Hiring Cafe Watcher]", error);
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

  if (message?.type === "runJobSearchNow") {
    runJobSearch()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error?.message }));
    return true;
  }
});
