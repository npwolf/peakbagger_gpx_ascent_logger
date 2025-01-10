chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPeakCoordinates") {
    // Wrap in async IIFE since we can't make the listener itself async
    (async () => {
      try {
        const response = await fetch(
          `https://www.peakbagger.com/peak.aspx?pid=${request.peakId}`
        );
        console.log("Sleeping...");
        await new Promise((r) => setTimeout(r, 10000));
        console.log("Woke up!");
        const text = await response.text();
        const coordsMatch = text.match(/([\d.-]+),\s*([\d.-]+)\s*\(Dec Deg\)/);
        const coordinates = coordsMatch
          ? {
              lat: parseFloat(coordsMatch[1]),
              lng: parseFloat(coordsMatch[2]),
            }
          : null;

        console.log("Peak coordinates:", coordinates);
        sendResponse({ coordinates });
      } catch (error) {
        console.error("Error fetching peak coordinates:", error);
        sendResponse({ error: error.message });
      }
    })();

    // Return true to keep the message port open
    return true;
  }
});
