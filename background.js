chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received:", request);
  if (request.action === "getPeakCoordinates") {
    handlePeakDataFetch(request.peakId)
      .then((coordinates) => sendResponse(coordinates))
      .catch((error) => sendResponse({ error: error.message }));
    return true; // Required to use sendResponse asynchronously
  }
  if (request.action === "getNearbyPeaks") {
    handleNearbyPeaksFetch(request.lat, request.lon, request.userId)
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
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
