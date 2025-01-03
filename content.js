window.contentScriptLoaded = true;
console.log('Content script loaded');

// Remove the DOMContentLoaded listener and check immediately
checkForStoredNotification();

if (!window.GPXTrack) {
  console.error('GPX utilities not loaded correctly');
}

let gpxData = null;
let isGPXListenerAttached = false;
let peakCoordinates = null;

function setupGPXListener() {
  const gpxUpload = document.getElementById('GPXUpload');
  if (gpxUpload && !isGPXListenerAttached) {
      gpxUpload.addEventListener('change', handleGPXFile);
      isGPXListenerAttached = true;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  if (request.action === "processAscent") {
    handleAscentForm();
  } else if (request.action === "receivePeakCoordinates") {
    peakCoordinates = request.coordinates;
    console.log('Received peak coordinates:', peakCoordinates);
    if (peakCoordinates) {
      const gpxUpload = document.getElementById('GPXUpload');
      setupGPXListener();
      gpxUpload.value = '';
      gpxUpload.click();
    } else {
      alert('Could not find peak coordinates');
    }
  }
});

async function handleAscentForm() {
  console.log('Handling ascent form');
  const peakListBox = document.getElementById('PeakListBox');

  const peakElevationFt = parseInt(document.getElementById('PointFt').value, 10);
  if (isNaN(peakElevationFt) || peakElevationFt <= 0) {
    alert('Please select a peak from the list first');
    return;
  }

  chrome.runtime.sendMessage({
    action: "getPeakCoordinates",
    peakId: peakListBox.value
  });
}

function handleGPXFile(event) {
  console.log('Handling GPX file:', event.target.files[0]);
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = function(e) {
    const gpxContent = e.target.result;
    const parser = new DOMParser();
    const gpxDoc = parser.parseFromString(gpxContent, "text/xml");
    processGPXData(gpxDoc);
  };

  reader.readAsText(file);
}

function processGPXData(gpxDoc) {
  try {
      const track = new GPXTrack(gpxDoc, peakCoordinates, parseInt(document.getElementById('PointFt').value));
      fillFormFields(track);
  } catch (error) {
      console.error('Error processing GPX:', error);
      alert(error.message);
      return;
  }
}

async function fillFormFields(track) {
  console.log('Filling form fields');

  // Date
  document.getElementById('DateText').value = track.date;

  // Ascent stats
  // Starting elevation
  await updateFormId('StartFt', Math.round(track.startElevation));
  const ascentStats = track.ascentStats;
  // Net gain
  await updateFormId('GainFt', Math.round(ascentStats.netGain));
  // PB is a little weird having a net gain and extra gain instead of one number for gain
  const extraGain = ascentStats.totalGain - ascentStats.netGain;
  if (extraGain > 0) {
    await updateFormId('ExUpFt', Math.round(extraGain));
  }
  await updateFormId('UpMi', track.ascentStats.miles);
  document.getElementById('UpDay').value = ascentStats.time.days;
  document.getElementById('UpHr').value = ascentStats.time.hours;
  document.getElementById('UpMin').value = ascentStats.time.minutes;

  // Descent Stats
  // Ending elevation and loss
  await updateFormId('EndFt', Math.round(track.endElevation));
  // Net loss (note this is different than calculated loss)
  await updateFormId('LossFt', Math.round(track.peakElevationFt - track.endElevation));
  const descentStats = track.descentStats;
  await updateFormId('DnMi', descentStats.miles);
  // Extra elevation gains/losses
  const baseLoss = parseInt(document.getElementById('LossFt').value) || 0;
  await updateFormId('ExDnFt', Math.round(descentStats.totalGain));
  document.getElementById('DnDay').value = descentStats.time.days;
  document.getElementById('DnHr').value = descentStats.time.hours;
  document.getElementById('DnMin').value = descentStats.time.minutes;
  await clickPreviewAndNotify();
}

// Click preview and wait for page to reload before displaying notification
async function clickPreviewAndNotify() {
  console.log('clickPreviewAndNotify');
  const previewButton = document.getElementById('GPXPreview');
  if (previewButton) {
    console.log("Clicking preview button");
    await chrome.storage.local.set({
      pendingNotification: '✓ Fields updated! Please review, modify and submit.'
    });
    previewButton.click();
  }
}

function showNotification(message) {
  console.log('Showing notification:', message);
  const notification = document.createElement('div');
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

  const style = document.createElement('style');
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
  return new Promise(resolve => {
    const event = new Event('change', { bubbles: true });
    const listener = () => {
      element.removeEventListener('change', listener);
      setTimeout(resolve, 0);
    };
    element.addEventListener('change', listener);
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
    const result = await chrome.storage.local.get('pendingNotification');
    if (result.pendingNotification) {
      console.log("Found stored notification:", result.pendingNotification);
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        showNotification(result.pendingNotification);
      }, 500);
      await chrome.storage.local.remove('pendingNotification');
    }
  } catch (error) {
    console.error('Error checking stored notification:', error);
  }
}

