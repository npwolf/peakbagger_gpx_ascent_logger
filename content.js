console.log('Content script loaded');

let peakCoordinates = null;
let gpxData = null;


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "processAscent") {
    handleAscentForm();
  } else if (request.action === "receivePeakCoordinates") {
    peakCoordinates = request.coordinates;
    console.log('Received peak coordinates:', peakCoordinates);
    if (peakCoordinates) {
      const gpxUpload = document.getElementById('GPXUpload');
      gpxUpload.addEventListener('change', handleGPXFile);
      gpxUpload.click();
    } else {
      alert('Could not find peak coordinates');
    }
  }
});

async function handleAscentForm() {
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
  const trackPoints = Array.from(gpxDoc.getElementsByTagName('trkpt'));
  if (!trackPoints.length) {
    alert('No track points found in GPX file');
    return;
  }

  // Get first and last points
  const firstPoint = trackPoints[0];
  const lastPoint = trackPoints[trackPoints.length - 1];

  // Find point closest to peak
  let closestPoint = null;
  let minDistance = Infinity;
  let peakIndex = 0;

  trackPoints.forEach((point, index) => {
    const lat = parseFloat(point.getAttribute('lat'));
    const lon = parseFloat(point.getAttribute('lon'));
    const distance = getDistance(lat, lon, peakCoordinates.lat, peakCoordinates.lng);

    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = point;
      peakIndex = index;
    }
  });

  // Fill form fields
  fillFormFields({
    firstPoint,
    lastPoint,
    closestPoint,
    peakIndex,
    trackPoints
  });
}

function fillFormFields(data) {
  // Date
  const date = data.firstPoint.getElementsByTagName('time')[0].textContent.split('T')[0];
  document.getElementById('DateText').value = date;

  const peakElevationFt = parseInt(document.getElementById('PointFt').value);

  // Starting elevation
  const startElev = metersToFeet(parseFloat(data.firstPoint.getElementsByTagName('ele')[0].textContent));
  document.getElementById('StartFt').value = Math.round(startElev);
  // Net Gain
  document.getElementById('GainFt').value = Math.round(peakElevationFt - startElev);

  // Ending elevation
  const endElev = metersToFeet(parseFloat(data.lastPoint.getElementsByTagName('ele')[0].textContent));
  document.getElementById('EndFt').value = Math.round(endElev);
  // Net Loss
  document.getElementById('LossFt').value = Math.round(peakElevationFt - endElev);

  // Calculate distances and times
  const upTrack = data.trackPoints.slice(0, data.peakIndex + 1);
  const downTrack = data.trackPoints.slice(data.peakIndex);

  // Up distance
  const upDistance = calculateTrackDistance(upTrack);
  document.getElementById('UpMi').value = (upDistance / 1609.34).toFixed(2);

  // Down distance
  const downDistance = calculateTrackDistance(downTrack);
  document.getElementById('DnMi').value = (downDistance / 1609.34).toFixed(2);

  // Calculate elevation gains/losses
  const upGain = calculateElevationGain(upTrack);
  console.log("Up gain:", upGain);
  const baseGain = parseInt(document.getElementById('GainFt').value) || 0;
  document.getElementById('ExUpFt').value = Math.round(upGain - baseGain);

  const downGain = calculateElevationGain(downTrack);
  console.log("Down gain:", downGain);
  const downLoss = calculateElevationLoss(downTrack);
  const baseLoss = parseInt(document.getElementById('LossFt').value) || 0;
  document.getElementById('ExDnFt').value = Math.round(downLoss - baseLoss);

  // Calculate times
  const { days: upDays, hours: upHours, minutes: upMinutes } = calculateTime(upTrack);
  document.getElementById('UpDay').value = upDays;
  document.getElementById('UpHr').value = upHours;
  document.getElementById('UpMin').value = upMinutes;

  const { days: downDays, hours: downHours, minutes: downMinutes } = calculateTime(downTrack);
  document.getElementById('DnDay').value = downDays;
  document.getElementById('DnHr').value = downHours;
  document.getElementById('DnMin').value = downMinutes;
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

function calculateTrackDistance(points) {
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const lat1 = parseFloat(points[i-1].getAttribute('lat'));
    const lon1 = parseFloat(points[i-1].getAttribute('lon'));
    const lat2 = parseFloat(points[i].getAttribute('lat'));
    const lon2 = parseFloat(points[i].getAttribute('lon'));
    distance += getDistance(lat1, lon1, lat2, lon2);
  }
  return distance;
}

function calculateElevationGain(points) {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const elev1 = parseFloat(points[i-1].getElementsByTagName('ele')[0].textContent);
    const elev2 = parseFloat(points[i].getElementsByTagName('ele')[0].textContent);
    if (elev2 > elev1) {
      gain += metersToFeet(elev2 - elev1);
    }
  }
  return gain;
}

function calculateElevationLoss(points) {
  let loss = 0;
  for (let i = 1; i < points.length; i++) {
    const elev1 = parseFloat(points[i-1].getElementsByTagName('ele')[0].textContent);
    const elev2 = parseFloat(points[i].getElementsByTagName('ele')[0].textContent);
    if (elev2 < elev1) {
      loss += metersToFeet(elev1 - elev2);
    }
  }
  return loss;
}

function calculateTime(points) {
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
