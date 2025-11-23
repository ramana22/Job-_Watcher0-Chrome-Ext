const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");
const saveButton = document.getElementById("save");
const saveJsonButton = document.getElementById("save-json");

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

function saveSearchJson() {
  const searchEntries = capturedEntries.filter(
    (entry) =>
      entry.method === "POST" &&
      entry.url.includes("/api/search-jobs") &&
      (entry.responseBody || "").trim()
  );

  if (!searchEntries.length) {
    appendLog("No POST https://hiring.cafe/api/search-jobs responses captured yet.");
    return;
  }

  const records = searchEntries.map((entry) => {
    let parsedRequest = entry.requestBody;
    let parsedResponse = entry.responseBody;

    try {
      parsedRequest = entry.requestBody ? JSON.parse(entry.requestBody) : entry.requestBody;
    } catch (_) {
      parsedRequest = entry.requestBody;
    }

    try {
      parsedResponse = entry.responseBody ? JSON.parse(entry.responseBody) : entry.responseBody;
    } catch (_) {
      parsedResponse = entry.responseBody;
    }

    return {
      url: entry.url,
      status: entry.status,
      method: entry.method,
      request: parsedRequest,
      response: parsedResponse,
    };
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `hiring-cafe/search-jobs-${timestamp}.json`;

  chrome.runtime.sendMessage(
    { type: "saveJson", content: JSON.stringify(records, null, 2), filename },
    (response) => {
      if (response?.success) {
        appendLog(`Saved ${searchEntries.length} search-jobs responses to ${filename}.`);
      } else {
        appendLog(`Failed to save search responses: ${response?.error || "unknown error"}`);
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
      const hasCaptured = capturedEntries.length > 0;
      const hasSearchResponse = capturedEntries.some(
        (entry) => entry.method === "POST" && entry.url.includes("/api/search-jobs")
      );
      saveButton.disabled = !hasCaptured;
      saveJsonButton.disabled = !hasSearchResponse;
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
saveJsonButton.addEventListener("click", saveSearchJson);

document.getElementById("clear").addEventListener("click", () => {
  capturedEntries.length = 0;
  logEl.textContent = "";
  saveButton.disabled = true;
  saveJsonButton.disabled = true;
  updateStatus("Waiting for network traffic...");
  appendLog("Cleared captured requests.");
});

wireNetworkListener();
appendLog("Network listener ready. Perform a search for '.Net developer' to capture responses.");
