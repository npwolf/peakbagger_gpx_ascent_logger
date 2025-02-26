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
    const url = `https://peakbagger.com/Async/PLLBB.aspx?miny=${boundingBox.miny}&maxy=${boundingBox.maxy}&minx=${boundingBox.minx}&maxx=${boundingBox.maxx}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
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
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
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
    await new Promise((resolve) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });

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
