// chrome.action.onClicked.addListener(async (tab) => {
//   if (tab.url.includes('ascentedit.aspx')) {
//     await chrome.scripting.executeScript({
//       target: { tabId: tab.id },
//       files: ['content.js']
//     });
//     chrome.tabs.sendMessage(tab.id, { action: "processAscent" });
//   }
// });

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "getPeakCoordinates") {
    const peakTab = await chrome.tabs.create({
      url: `https://www.peakbagger.com/peak.aspx?pid=${request.peakId}`,
      active: false
    });
    // Get coordinates and send back to content script
    const response = await fetch(`https://www.peakbagger.com/peak.aspx?pid=${request.peakId}`);
    const text = await response.text();
    const coordsMatch = text.match(/([\d.-]+),\s*([\d.-]+)\s*\(Dec Deg\)/);
    chrome.tabs.sendMessage(sender.tab.id, {
      action: "receivePeakCoordinates",
      coordinates: coordsMatch ? {
        lat: parseFloat(coordsMatch[1]),
        lng: parseFloat(coordsMatch[2])
      } : null
    });
    chrome.tabs.remove(peakTab.id);
  }
});
