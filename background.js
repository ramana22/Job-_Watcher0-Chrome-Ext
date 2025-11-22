const HIRING_CAFE_URL = "https://hiring.cafe/";

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
});
