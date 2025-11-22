const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");
const saveButton = document.getElementById("save");

const capturedEntries = [];

function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  logEl.textContent += `[${timestamp}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function saveMatches() {
  const matches = capturedEntries.filter((entry) => {
    const payload = `${entry.requestBody}\n${entry.responseBody}`.toLowerCase();
    return payload.includes(".net developer") || payload.includes(".net");
  });

  if (!matches.length) {
    appendLog("No entries contained '.Net developer'.");
    return;
  }

  const content = matches
    .map(
      (entry, index) =>
        `#${index + 1} ${entry.method} ${entry.url}\nStatus: ${entry.status}\nRequest Body:\n${entry.requestBody || "<empty>"}\n\nResponse Body:\n${entry.responseBody || "<empty>"}\n\n`
    )
    .join("\n-----------------------------\n\n");

  chrome.runtime.sendMessage(
    { type: "saveText", text: content, filename: "hiring-cafe/net-developer-responses.txt" },
    (response) => {
      if (response?.success) {
        appendLog("Saved .Net developer responses to downloads.");
      } else {
        appendLog(`Failed to save responses: ${response?.error || "unknown error"}`);
      }
    }
  );
}

function wireNetworkListener() {
  chrome.devtools.network.onRequestFinished.addListener((request) => {
    if (!request.request.url.includes("hiring.cafe")) return;

    request.getContent((responseBody) => {
      const requestBody = request.request.postData?.text || "";
      capturedEntries.push({
        url: request.request.url,
        method: request.request.method,
        status: request.response?.status,
        requestBody,
        responseBody: responseBody || "",
      });

      appendLog(`${request.request.method} ${request.request.url} (status ${request.response?.status})`);
      saveButton.disabled = capturedEntries.length === 0;
      updateStatus(`${capturedEntries.length} requests captured for hiring.cafe.`);
    });
  });
}

document.getElementById("open-site").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "openSite" }, (response) => {
    if (response?.tabId) {
      appendLog(`Opened hiring.cafe in tab ${response.tabId}.`);
    } else {
      appendLog("Unable to open hiring.cafe tab.");
    }
  });
});

saveButton.addEventListener("click", saveMatches);

document.getElementById("clear").addEventListener("click", () => {
  capturedEntries.length = 0;
  logEl.textContent = "";
  saveButton.disabled = true;
  updateStatus("Waiting for network traffic...");
  appendLog("Cleared captured requests.");
});

wireNetworkListener();
appendLog("Network listener ready. Perform a search for '.Net developer' to capture responses.");
