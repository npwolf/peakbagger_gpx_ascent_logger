// peakbagger.com is behind Cloudflare, which serves a bot challenge to any
// request made from the extension's own origin. Requests only succeed from a
// real top-level peakbagger.com document, so every call to the site is handed
// to the pb-session.js content script running in a peakbagger tab. An already
// open tab is reused; otherwise a background tab is opened and closed again.
const PB_ORIGIN_MATCH = "https://peakbagger.com/*";
const PB_PROXY_PAGE = "https://peakbagger.com/Default.aspx";

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out loading peakbagger.com."));
    }, timeoutMs);

    function listener(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function fetchViaPeakbaggerTab(tabId, url) {
  const result = await chrome.tabs.sendMessage(tabId, {
    action: "pbFetch",
    url,
  });
  if (!result) {
    throw new Error("No response from the peakbagger.com tab.");
  }
  if (result.error) {
    throw new Error(result.error);
  }
  if (!result.ok) {
    throw new Error(`Peakbagger returned HTTP ${result.status}.`);
  }
  return result.text;
}

async function pbFetch(url) {
  const openTabs = await chrome.tabs.query({ url: PB_ORIGIN_MATCH });
  for (const tab of openTabs) {
    try {
      return await fetchViaPeakbaggerTab(tab.id, url);
    } catch (error) {
      // Tabs loaded before this extension have no content script in them, and
      // the user may close a tab mid-flight. Fall through to a fresh tab.
      console.log("Peakbagger tab unusable, trying another:", error.message);
    }
  }

  const tab = await chrome.tabs.create({ url: PB_PROXY_PAGE, active: false });
  try {
    await waitForTabLoad(tab.id);
    // Give the content script a moment to register its message listener.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return await fetchViaPeakbaggerTab(tab.id, url);
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received:", request);

  // Add new handler for bounding box search
  if (request.action === "getPeaksInBoundingBox") {
    handlePeaksInBoundingBox(request.boundingBox)
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (request.action === "searchPeaks") {
    handlePeakSearch(request.searchText, request.userId)
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (request.action === "draftPBAscent") {
    draftPBAscent(request.userId, request.peakData);
    return true; // Keep message channel open for async response
  }
  if (request.action === "draftMultiplePBAscents") {
    console.log("Drafting multiple ascents", request.peaksData);
    for (const peakData of request.peaksData) {
      console.log("Drafting ascent for peak:", peakData);
      draftPBAscent(request.userId, peakData);
    }
    return true; // Keep message channel open for async response
  }
});

async function handlePeaksInBoundingBox(boundingBox) {
  try {
    const url = `https://peakbagger.com/Async/pllbb2.aspx?miny=${boundingBox.miny}&maxy=${boundingBox.maxy}&minx=${boundingBox.minx}&maxx=${boundingBox.maxx}`;
    const text = await pbFetch(url);
    console.log("Peaks in bounding box response:", text);
    return { peaksText: text };
  } catch (error) {
    console.error(error);
    return { error: error.message };
  }
}

async function handlePeakSearch(searchText, userId) {
  try {
    const encodedSearch = encodeURIComponent(searchText);
    const url = `https://peakbagger.com/m/ps.aspx?s=${encodedSearch}&c=${userId}&lang=en`;
    const text = await pbFetch(url);
    return { peaksText: text };
  } catch (error) {
    console.error(error);
    return { error: error.message };
  }
}

async function draftPBAscent(userId, peakData) {
  try {
    // Create the tab
    const url = `https://peakbagger.com/climber/ascentedit.aspx?pid=${peakData.id}&cid=${userId}`;
    const tab = await chrome.tabs.create({ url });

    // Wait for page load
    await waitForTabLoad(tab.id);

    // Wait a bit for content script to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log(
      "Sending GPX content to new tab: ",
      peakData.peakCoordinates.lat,
      peakData.peakCoordinates.lon
    );
    // Send the GPX content to the tab
    await chrome.tabs.sendMessage(tab.id, {
      action: "processGPXContent",
      peakData: peakData,
    });
  } catch (error) {
    console.error("Error processing GPX in new tab:", error);
  }
}
