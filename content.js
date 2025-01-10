/* global GPXTrackReducer */
/* global GPXPeakTrack */
window.contentScriptLoaded = true;
console.log("Content script loaded");

// Remove the DOMContentLoaded listener and check immediately
checkForStoredNotification();

const MAX_PEAKBAGGER_GPX_POINTS = 3000;

chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
  console.log("Message received:", request);
  if (request.action === "processGPXContent") {
    const parser = new DOMParser();
    const gpxDocXml = parser.parseFromString(request.gpxContent, "text/xml");
    processGPXData(gpxDocXml);
  }
});

async function getPeakCoordinates() {
  const peakElevationFt = parseInt(
    document.getElementById("PointFt").value,
    10
  );
  if (isNaN(peakElevationFt) || peakElevationFt <= 0) {
    alert("Please select a peak from the list first");
    return;
  }

  const peakId = getPeakId();
  if (isNaN(peakId) || peakId <= 0) {
    alert("Unable to determine peak ID");
    return;
  }

  try {
    const response = await Promise.race([
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "getPeakCoordinates", peakId },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.coordinates);
            }
          }
        );
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), 10000)
      ),
    ]);

    console.log("Coordinates received:", response);
    return response;
  } catch (error) {
    throw new Error("Unable to get peak coordinates: ", error);
  }
}

function getPeakId() {
  let peakId;
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("pid")) {
    peakId = parseInt(urlParams.get("pid"), 10);
  } else {
    const peakListBox = document.getElementById("PeakListBox");
    peakId = parseInt(peakListBox.value, 10);
  }
  console.log("Got peak ID:", peakId);
  return peakId;
}

async function processGPXData(gpxDocXml) {
  try {
    // Create a file from the GPX document
    const gpxTrackReducer = new GPXTrackReducer(gpxDocXml);
    gpxTrackReducer.reduceGPXTrack(MAX_PEAKBAGGER_GPX_POINTS);
    gpxDocXml = gpxTrackReducer.gpxDocXml;

    const peakCoordinates = await getPeakCoordinates();
    console.log("processGPXData: Peak coordinates:", peakCoordinates);
    const track = new GPXPeakTrack(
      gpxTrackReducer.gpxTrack.trackPoints,
      peakCoordinates
    );
    await fillFormFields(track);
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

async function fillFormFields(track) {
  console.log("Filling form fields");

  // Date
  document.getElementById("DateText").value = track.startDate;

  // Ascent stats
  // Starting elevation
  await updateFormId("StartFt", Math.round(track.startElevationFt));
  // Net gain
  const pbNetGain = parseInt(document.getElementById("GainFt").value);
  // PB is a little weird having a net gain and extra gain instead of one number for gain
  const extraGain = track.toPeakTrack.gainFt - pbNetGain;
  if (extraGain > 0) {
    await updateFormId("ExUpFt", Math.round(extraGain));
  }
  await updateFormId("UpMi", track.toPeakTrack.miles);
  document.getElementById("UpDay").value = track.toPeakTrack.duration.days;
  document.getElementById("UpHr").value = track.toPeakTrack.duration.hours;
  document.getElementById("UpMin").value = track.toPeakTrack.duration.minutes;

  // Descent Stats
  // Ending elevation and loss
  await updateFormId("EndFt", Math.round(track.endElevationFt));

  await updateFormId("DnMi", track.fromPeakTrack.miles);
  // Extra elevation gains/losses
  await updateFormId("ExDnFt", Math.round(track.fromPeakTrack.gainFt));
  document.getElementById("DnDay").value = track.fromPeakTrack.duration.days;
  document.getElementById("DnHr").value = track.fromPeakTrack.duration.hours;
  document.getElementById("DnMin").value = track.fromPeakTrack.duration.minutes;
  let gpxSummary = `Total distance: ${track.miles} miles\n`;
  gpxSummary += `Total elevation gain: ${track.gainFt} ft\n`;
  gpxSummary += `Total elevation loss: ${track.lossFt} ft\n`;
  gpxSummary += `Total duration: ${track.duration.days} days, ${track.duration.hours} hours, ${track.duration.minutes} minutes`;
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
