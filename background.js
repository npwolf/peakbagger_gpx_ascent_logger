chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  console.log("downloadItem:", downloadItem);
  if (downloadItem.filename.toLowerCase().endsWith('.gpx')) {  // Fixed: endsWith with capital 'S'
    // Create a notification to the content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'GPX_DOWNLOAD',
          downloadId: downloadItem.id,
          filename: downloadItem.filename,
          url: downloadItem.url
        });
      }
    });

    // Pause the download until user makes a decision
    suggest({filename: downloadItem.filename, suspend: true});
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RESUME_DOWNLOAD') {
    chrome.downloads.resume(message.downloadId);
  } else if (message.type === 'CANCEL_DOWNLOAD') {
    chrome.downloads.cancel(message.downloadId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openPopupWithFile') {
    chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 400,
      height: 600
    }, (window) => {
      // Wait a bit for the popup to load, then send the file data
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'processDownloadedFile',
          fileData: message.fileData
        });
      }, 500);
    });
  }
});

// Function to run in the content script context
function processGPX(fileContents) {
  console.log("GPX file contents received:", fileContents);
  // Add your GPX processing logic here
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received:", request);
  if (request.action === "getNearbyPeaks") {
    handleNearbyPeaksFetch(request.lat, request.lon, request.userId)
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

async function handleNearbyPeaksFetch(lat, lon, userId) {
  try {
    const url = `https://peakbagger.com/m/pt.ashx?pn=APIGetNearbyPeaks&p1=${lat}&p2=${lon}&p3=${userId}&p4=1&p5=0&p9=0&p10=0&p6=-32000&p11=32000&p7=0&p8=50&p12='en'&p13=0&p14=0&p15=''&p16=0&p17=0.0`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    console.log("Nearby peaks text:", text);
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
