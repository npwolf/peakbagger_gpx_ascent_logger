window.contentScriptLoaded = true;
console.log('Content script loaded');

let gpxData = null;
let isGPXListenerAttached = false;
let peakCoordinates = null;

class GPXTrack {
  constructor(gpxDoc, peakCoordinates, peakElevationFt) {
    this.peakCoordinates = peakCoordinates;
    this.peakElevationFt = peakElevationFt;
    this.trackPoints = Array.from(gpxDoc.getElementsByTagName('trkpt'));

    if (!this.trackPoints.length) {
      throw new Error('No track points found in GPX file');
    }

    this.firstPoint = this.trackPoints[0];
    this.lastPoint = this.trackPoints[this.trackPoints.length - 1];
    this.findClosestPointToPeak();

    // Calculate basic metrics
    this.date = this.firstPoint.getElementsByTagName('time')[0].textContent.split('T')[0];
    this.startElevation = this.getElevationInFeet(this.firstPoint);
    this.endElevation = this.getElevationInFeet(this.lastPoint);

    // Split track at peak
    this.upTrack = this.trackPoints.slice(0, this.peakIndex + 1);
    this.downTrack = this.trackPoints.slice(this.peakIndex);
  }

  findClosestPointToPeak() {
    let minDistance = Infinity;
    this.trackPoints.forEach((point, index) => {
      const lat = parseFloat(point.getAttribute('lat'));
      const lon = parseFloat(point.getAttribute('lon'));
      const distance = getDistance(lat, lon, this.peakCoordinates.lat, this.peakCoordinates.lng);

      if (distance < minDistance) {
        minDistance = distance;
        this.closestPoint = point;
        this.peakIndex = index;
      }
    });
  }

  getElevationInFeet(point) {
    return metersToFeet(parseFloat(point.getElementsByTagName('ele')[0].textContent));
  }

  calculateSegmentMetrics(points) {
    const miles = (trackLengthMeters(points) / 1609.34).toFixed(2);
    const totalGain = elevationGainFt(points);
    const netGain = this.peakElevationFt - this.startElevation;
    const loss = elevationLossFt(points);
    const time = calculateDuration(points);
    return { miles, netGain, totalGain, loss, time };
  }

  get ascentStats() {
    return this.calculateSegmentMetrics(this.upTrack);
  }

  get descentStats() {
    return this.calculateSegmentMetrics(this.downTrack);
  }
}

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

  showNotification('✓ Fields updated! Please review, modify and submit.');
}

function showNotification(message) {
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
    animation: slideIn 0.5s, fadeOut 0.5s 2.5s;
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

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

function trackLengthMeters(points) {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const lat1 = parseFloat(points[i-1].getAttribute('lat'));
    const lon1 = parseFloat(points[i-1].getAttribute('lon'));
    const lat2 = parseFloat(points[i].getAttribute('lat'));
    const lon2 = parseFloat(points[i].getAttribute('lon'));
    meters += getDistance(lat1, lon1, lat2, lon2);
  }
  return meters;
}

function elevationGainFt(points) {
  let gainMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const elev1 = parseFloat(points[i-1].getElementsByTagName('ele')[0].textContent);
    const elev2 = parseFloat(points[i].getElementsByTagName('ele')[0].textContent);
    if (elev2 > elev1) {
      gainMeters += elev2 - elev1;
    }
  }
  return metersToFeet(gainMeters);
}

function elevationLossFt(points) {
  let metersLost = 0;
  for (let i = 1; i < points.length; i++) {
    const elev1 = parseFloat(points[i-1].getElementsByTagName('ele')[0].textContent);
    const elev2 = parseFloat(points[i].getElementsByTagName('ele')[0].textContent);
    if (elev2 < elev1) {
      metersLost += elev1 - elev2;
    }
  }
  return metersToFeet(metersLost);
}

function calculateDuration(points) {
  const startTime = new Date(points[0].getElementsByTagName('time')[0].textContent);
  const endTime = new Date(points[points.length-1].getElementsByTagName('time')[0].textContent);
  const diffMinutes = (endTime - startTime) / (1000 * 60);

  const days = Math.floor(diffMinutes / (24 * 60));
  const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
  const minutes = Math.floor(diffMinutes % 60);

  return { days, hours, minutes };
}

function metersToFeet(meters) {
  return meters * 3.28084;
}
