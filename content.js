/* global GPXPeakTrack */
window.contentScriptLoaded = true;
console.log("Content script loaded");

// Remove the DOMContentLoaded listener and check immediately
checkForStoredNotification();

chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
  console.log("Message received:", request);
  if (request.action === "processGPXContent") {
    processGPXData(request.peakData);
  }
});

async function processGPXData(peakData) {
  try {
    // Check if we're on an ascent page
    if (!document.body.textContent.includes("Ascent of")) {
      alert("Failed to properly load ascent page. Try logging in again.");
      return;
    }

    const parser = new DOMParser();
    const gpxDocXml = parser.parseFromString(peakData.gpxContent, "text/xml");
    const gpxPeakTrack = new GPXPeakTrack(
      peakData.trackPoints,
      peakData.peakCoordinates
    );
    console.log(
      "processGPXData: Peak coordinates:",
      gpxPeakTrack.peakCoordinates
    );
    await fillFormFields(gpxPeakTrack);
    await uploadTrack(gpxDocXml);
  } catch (error) {
    console.error("Error processing GPX:", error, error.stack);
    alert(error.message);
    return;
  }
}

async function uploadTrack(gpxDocXml) {
  const serializer = new XMLSerializer();
  const gpxString = serializer.serializeToString(gpxDocXml);
  const blob = new Blob([gpxString], { type: "application/gpx+xml" });
  const file = new File([blob], "track.gpx", { type: "application/gpx+xml" });

  // Set the file to the input element
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  const fileInput = document.getElementById("GPXUpload");
  fileInput.files = dataTransfer.files;
  await clickPreviewAndNotify();
}

async function fillFormFields(peak) {
  console.log("Filling form fields with peak", peak);

  // Date
  document.getElementById("DateText").value = peak.startDate;

  // Ascent stats
  // Starting elevation
  await updateFormId("StartFt", Math.round(peak.startElevationFt));
  // Net gain
  const pbNetGain = parseInt(document.getElementById("GainFt").value);
  // PB is a little weird having a net gain and extra gain instead of one number for gain
  const extraGain = peak.toPeakTrack.gainFt - pbNetGain;
  if (extraGain > 0) {
    await updateFormId("ExUpFt", Math.round(extraGain));
  }
  await updateFormId("UpMi", peak.toPeakTrack.miles);
  document.getElementById("UpDay").value = peak.toPeakTrack.duration.days;
  document.getElementById("UpHr").value = peak.toPeakTrack.duration.hours;
  document.getElementById("UpMin").value = peak.toPeakTrack.duration.minutes;

  // Descent Stats
  // Ending elevation and loss
  await updateFormId("EndFt", Math.round(peak.endElevationFt));

  await updateFormId("DnMi", peak.fromPeakTrack.miles);
  // Extra elevation gains/losses
  await updateFormId("ExDnFt", Math.round(peak.fromPeakTrack.gainFt));
  document.getElementById("DnDay").value = peak.fromPeakTrack.duration.days;
  document.getElementById("DnHr").value = peak.fromPeakTrack.duration.hours;
  document.getElementById("DnMin").value = peak.fromPeakTrack.duration.minutes;
  let gpxSummary = `Total distance: ${peak.miles} miles\n`;
  gpxSummary += `Total elevation gain: ${peak.gainFt} ft\n`;
  gpxSummary += `Total elevation loss: ${peak.lossFt} ft\n`;
  gpxSummary += `Total duration: ${peak.duration.days} days, ${peak.duration.hours} hours, ${peak.duration.minutes} minutes`;
  await updateFormId("JournalText", gpxSummary);
}

// Click preview and wait for page to reload before displaying notification
async function clickPreviewAndNotify() {
  console.log("clickPreviewAndNotify");
  const previewButton = document.getElementById("GPXPreview");
  if (previewButton) {
    console.log("Clicking preview button");
    await chrome.storage.local.set({
      pendingNotification:
        "✓ Fields updated! Please review, modify and submit.",
    });
    previewButton.click();
  }
}

function showNotification(message) {
  console.log("Showing notification:", message);
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #4CAF50;
    color: white;
    padding: 16px;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    z-index: 10000;
    font-family: Arial, sans-serif;
    animation: slideIn 0.5s, fadeOut 0.5s 4.0s;
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    document.body.removeChild(notification);
  }, 3000);
}

function triggerChangeAndWait(element) {
  return new Promise((resolve) => {
    const event = new Event("change", { bubbles: true });
    const listener = () => {
      element.removeEventListener("change", listener);
      setTimeout(resolve, 0);
    };
    element.addEventListener("change", listener);
    element.dispatchEvent(event);
  });
}

async function updateFormId(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.value = value;
  await triggerChangeAndWait(element);
}

async function checkForStoredNotification() {
  console.log("Checking for stored notification");
  try {
    const result = await chrome.storage.local.get("pendingNotification");
    if (result.pendingNotification) {
      console.log("Found stored notification:", result.pendingNotification);
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        showNotification(result.pendingNotification);
      }, 500);
      await chrome.storage.local.remove("pendingNotification");
    }
  } catch (error) {
    console.error("Error checking stored notification:", error);
  }
}
