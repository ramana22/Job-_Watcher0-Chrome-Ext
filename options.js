const form = document.getElementById("config-form");
const statusEl = document.getElementById("status");
const runNowButton = document.getElementById("run-now");

const DEFAULT_CONFIG = {
  keyword: ".Net developer",
  intervalMinutes: 120,
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  smtpUser: "ramanagajula1999@gmail.com",
  smtpPass: "jsrkmzzimefqnljt",
  mailFrom: "ramanagajula1999@gmail.com",
  mailTo: "ramanagajula001@gmail.com",
};

function showStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b91c1c" : "#0f172a";
}

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
  };
}

function loadConfig() {
  chrome.storage.sync.get(["config"], (data) => {
    const config = ensureConfigShape(data?.config || DEFAULT_CONFIG);
    form.keyword.value = config.keyword;
    form.smtpHost.value = config.smtpHost;
    form.smtpPort.value = config.smtpPort;
    form.smtpUser.value = config.smtpUser;
    form.smtpPass.value = config.smtpPass;
    form.mailFrom.value = config.mailFrom;
    form.mailTo.value = config.mailTo;
    form.interval.value = config.intervalMinutes;
  });
}

function saveConfig(event) {
  event.preventDefault();
  const config = ensureConfigShape({
    keyword: form.keyword.value.trim(),
    intervalMinutes: Number(form.interval.value) || DEFAULT_CONFIG.intervalMinutes,
    smtpHost: form.smtpHost.value.trim(),
    smtpPort: Number(form.smtpPort.value) || DEFAULT_CONFIG.smtpPort,
    smtpUser: form.smtpUser.value.trim(),
    smtpPass: form.smtpPass.value.trim(),
    mailFrom: form.mailFrom.value.trim(),
    mailTo: form.mailTo.value.trim(),
  });

  chrome.storage.sync.set({ config }, () => {
    showStatus("Settings saved. A new schedule will start with the updated interval.");
  });
}

function runNow() {
  showStatus("Running search now...");
  chrome.runtime.sendMessage({ type: "runJobSearchNow" }, (response) => {
    if (response?.success) {
      showStatus("Search executed. Check your inbox for the email.");
    } else {
      showStatus(response?.error || "Unable to run the search.", true);
    }
  });
}

form.addEventListener("submit", saveConfig);
runNowButton.addEventListener("click", runNow);
document.addEventListener("DOMContentLoaded", loadConfig);
