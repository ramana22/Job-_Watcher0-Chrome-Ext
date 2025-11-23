const form = document.getElementById("config-form");
const statusEl = document.getElementById("status");
const runNowButton = document.getElementById("run-now");

const DEFAULT_CONFIG = {
  keyword: ".Net developer",
  email: "",
  webhookUrl: "",
  intervalMinutes: 120,
};

function showStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b91c1c" : "#0f172a";
}

function ensureConfigShape(config) {
  return {
    keyword: config.keyword || DEFAULT_CONFIG.keyword,
    email: config.email || DEFAULT_CONFIG.email,
    webhookUrl: config.webhookUrl || DEFAULT_CONFIG.webhookUrl,
    intervalMinutes: Number(config.intervalMinutes) || DEFAULT_CONFIG.intervalMinutes,
  };
}

function loadConfig() {
  chrome.storage.sync.get(["config"], (data) => {
    const config = ensureConfigShape(data?.config || DEFAULT_CONFIG);
    form.keyword.value = config.keyword;
    form.email.value = config.email;
    form.webhook.value = config.webhookUrl;
    form.interval.value = config.intervalMinutes;
  });
}

function saveConfig(event) {
  event.preventDefault();
  const config = ensureConfigShape({
    keyword: form.keyword.value.trim(),
    email: form.email.value.trim(),
    webhookUrl: form.webhook.value.trim(),
    intervalMinutes: Number(form.interval.value) || DEFAULT_CONFIG.intervalMinutes,
  });

  chrome.storage.sync.set({ config }, () => {
    showStatus("Settings saved. A new schedule will start with the updated interval.");
  });
}

function runNow() {
  showStatus("Running search now...");
  chrome.runtime.sendMessage({ type: "runJobSearchNow" }, (response) => {
    if (response?.success) {
      showStatus("Search executed. Check your webhook for the email.");
    } else {
      showStatus(response?.error || "Unable to run the search.", true);
    }
  });
}

form.addEventListener("submit", saveConfig);
runNowButton.addEventListener("click", runNow);
document.addEventListener("DOMContentLoaded", loadConfig);
