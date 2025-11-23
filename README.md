# Hiring Cafe Watcher

A Chrome DevTools extension that opens [hiring.cafe](https://hiring.cafe/), watches the Network tab, and saves responses that mention ".Net developer". It also includes a scheduled job runner that queries the public search API and emails the results at a configurable interval.

## Features
- Opens hiring.cafe in a new tab from the DevTools panel.
- Captures Network requests made to the site while you interact with it.
- Filters responses containing ".Net developer" (case-insensitive) and downloads them as a text file.
- Polls `https://hiring.cafe/api/search-jobs?search=<keyword>` from a background service worker and delivers the results to your email via a webhook.

## Configure email delivery
1. Load the extension in Chrome:
   - Visit `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked** pointing at this folder.
2. Open the options page (click **Details** on the extension card, then **Extension options**):
   - Set your search keyword (default: `.Net developer`).
   - Provide the recipient email address.
   - Provide an email webhook URL that accepts a JSON payload of `{ "to", "subject", "body" }` and forwards an email. Services like SendGrid, Mailgun, Postmark, EmailJS, or a Zapier/Make webhook can be used.
   - Choose a send interval (minimum 15 minutes; defaults to 120 minutes / 2 hours).
   - Save the settings and optionally click **Run now** to send a test immediately.

> The extension uses `chrome.storage.sync` to persist configuration and `chrome.alarms` to trigger the scheduled fetches. Host permissions include `<all_urls>` to allow calling your chosen webhook URL.

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
