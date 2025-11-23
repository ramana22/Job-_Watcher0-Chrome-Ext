# Hiring Cafe Watcher

A Chrome DevTools extension that opens [hiring.cafe](https://hiring.cafe/), watches the Network tab, and saves responses that mention ".Net developer". It also includes a scheduled job runner that queries the public search API, emails the results via SMTP, and downloads both text and JSON snapshots on each run.

## Features
- Opens hiring.cafe in a new tab from the DevTools panel.
- Captures Network requests made to the site while you interact with it.
- Filters responses containing ".Net developer" (case-insensitive) and downloads them as a text file.
- Posts to `https://hiring.cafe/api/search-jobs` with the configured `searchState` (keyword + seniority filters) from a background service worker, emails the results over SMTP, and downloads text/JSON files for each run.
- Automatically retries the API call with a short backoff if hiring.cafe responds with "Too many requests" (HTTP 429), respecting any `Retry-After` header when present.

## Configure email delivery
1. Load the extension in Chrome:
   - Visit `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked** pointing at this folder.
2. Open the options page (click **Details** on the extension card, then **Extension options**):
   - Set your search keyword (default: `.Net developer`).
   - Adjust the comma-separated seniority filters (defaults: "No Prior Experience Required", "Entry Level", "Mid Level").
   - Provide SMTP host, port, username, and app password.
   - Set the **From** and **To** addresses (defaults are prefilled from the supplied Gmail SMTP details).
   - Choose a send interval (minimum 15 minutes; defaults to 120 minutes / 2 hours).
   - Save the settings and optionally click **Run now** to send a test immediately.
   - If hiring.cafe returns `Too many requests`, the background job waits per `Retry-After` (or a 1–3 minute backoff) and retries up to three times before surfacing an error in the console log.

> The extension uses `chrome.storage.sync` to persist configuration and `chrome.alarms` to trigger the scheduled fetches. Search results are fetched via POST to `https://hiring.cafe/api/search-jobs` with a `searchState` matching the filters above. SMTP requests are posted to `https://smtpjs.com/v3/smtpjs.aspx` from the background worker using the credentials you provide. Credentials are saved in Chrome storage in plain text; supply a scoped app password rather than your primary password.

## Usage
1. Load the extension in Chrome:
   - Visit `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked** pointing at this folder.
2. Open the site tools:
   - Navigate to any page on hiring.cafe.
   - Open DevTools and select the **Hiring Cafe** panel.
3. Capture data:
   - Click **Open hiring.cafe** if you need a fresh tab.
   - Perform a search for **.Net developer** on the site so the Network tab records the requests.
   - Watch the log for hiring.cafe requests; when ready, click **Save .Net responses** to download a `net-developer-responses.txt` file with matching request and response bodies.
4. Clear captured requests anytime with **Clear log**.

> The DevTools panel listens only while DevTools stays open. Keep the panel open during your search to ensure responses are captured.
