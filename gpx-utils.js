console.log('GPX utils loaded');

function metersToFeet(meters) {
  return meters * 3.28084;
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = R * c; // in metres
  return d;
}

// Define a constant for the vertical noise threshold
const ELEVATION_THRESHOLD_METERS = 10;

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
  // Calculate total elevation gain, ignoring changes below the threshold to reduce noise
  let gainMeters = 0;
  let lastValidElevation = parseFloat(points[0].getElementsByTagName('ele')[0].textContent);
  for (let i = 1; i < points.length; i++) {
    const elev = parseFloat(points[i].getElementsByTagName('ele')[0].textContent);
    if (elev - lastValidElevation > ELEVATION_THRESHOLD_METERS) {
      gainMeters += elev - lastValidElevation;
      lastValidElevation = elev;
    }
  }
  return metersToFeet(gainMeters);
}

function elevationLossFt(points) {
  // Calculate total elevation loss, ignoring changes below the threshold to reduce noise
  let metersLost = 0;
  let lastValidElevation = parseFloat(points[0].getElementsByTagName('ele')[0].textContent);
  for (let i = 1; i < points.length; i++) {
    const elev = parseFloat(points[i].getElementsByTagName('ele')[0].textContent);
    if (lastValidElevation - elev > ELEVATION_THRESHOLD_METERS) {
      metersLost += lastValidElevation - elev;
      lastValidElevation = elev;
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
