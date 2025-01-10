chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received:", request);
  if (request.action === "getPeakCoordinates") {
    handlePeakDataFetch(request.peakId)
      .then((coordinates) => sendResponse(coordinates))
      .catch((error) => sendResponse({ error: error.message }));

    return true; // Required to use sendResponse asynchronously
  }
});

async function handlePeakDataFetch(peakId) {
  try {
    const response = await fetch(
      `https://www.peakbagger.com/peak.aspx?pid=${peakId}`
    );
    const text = await response.text();

    const matches = text.match(/([\d.-]+),\s*([\d.-]+)\s*\(Dec Deg\)/);

    if (!matches || matches.length < 3) {
      console.error("Could not find coordinates in the page");
      throw new Error("Could not find coordinates in the page");
    }
    const lat = parseFloat(matches[1]);
    const lon = parseFloat(matches[2]);
    return {
      coordinates: {
        lat: lat,
        lon: lon,
      },
    };
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to fetch peak data: ${error.message}`);
  }
}
