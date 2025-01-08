console.log("GPX utils loaded");

// Define a constant for the vertical noise threshold
const ELEVATION_THRESHOLD_METERS = 10;

/**
 * Represents a GPX track and provides methods for analyzing hiking/climbing data.
 * This class parses GPX track points, identifies the summit/peak point, and calculates
 * various metrics for both ascent and descent segments of the track.
 */
/* eslint-disable-next-line no-unused-vars */
class GPXTrack {
  constructor(gpxDoc, peakCoordinates, peakElevationFt) {
    this.peakCoordinates = peakCoordinates;
    this.peakElevationFt = peakElevationFt;
    this.trackPoints = Array.from(gpxDoc.getElementsByTagName("trkpt"));

    if (!this.trackPoints.length) {
      throw new Error("No track points found in GPX file");
    }

    this.firstPoint = this.trackPoints[0];
    this.lastPoint = this.trackPoints[this.trackPoints.length - 1];
    this.findClosestPointToPeak();

    // Calculate basic metrics
    this.date = this.firstPoint
      .getElementsByTagName("time")[0]
      .textContent.split("T")[0];
    this.startElevation = this.getElevationInFeet(this.firstPoint);
    this.endElevation = this.getElevationInFeet(this.lastPoint);

    // Split track at peak
    this.upTrack = this.trackPoints.slice(0, this.peakIndex + 1);
    this.downTrack = this.trackPoints.slice(this.peakIndex);
  }

  findClosestPointToCoordinates(targetLat, targetLon) {
    let minDistance = Infinity;
    let closestPoint = null;
    let closestPointIndex = null;
    this.trackPoints.forEach((point, index) => {
      const lat = parseFloat(point.getAttribute("lat"));
      const lon = parseFloat(point.getAttribute("lon"));
      const distance = getDistance(lat, lon, targetLat, targetLon);

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
        closestPointIndex = index;
      }
    });
    return { point: closestPoint, index: closestPointIndex };
  }

  findClosestPointToPeak() {
    const result = this.findClosestPointToCoordinates(
      this.peakCoordinates.lat,
      this.peakCoordinates.lng
    );
    this.closestPoint = result.point;
    this.peakIndex = result.index;
  }

  getElevationInFeet(point) {
    return metersToFeet(
      parseFloat(point.getElementsByTagName("ele")[0].textContent)
    );
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

/**
 * A class that reduces the number of track points in a GPX file while preserving the essential shape of the track.
 * Uses the Ramer-Douglas-Peucker algorithm for line simplification.
 */
/* eslint-disable-next-line no-unused-vars */
class GPXTrackReducer {
  constructor(gpxDoc) {
    this.gpxDoc = gpxDoc;
    this.parser = new DOMParser();
    this.xmlDoc = this.parser.parseFromString(gpxDoc, "text/xml");
    this.trackPoints = this.xmlDoc.querySelectorAll("trkpt");
  }

  origTrackPointCount() {
    return this.trackPoints.length;
  }

  reduceGPX(targetPoints) {
    if (this.trackPoints.length <= targetPoints) return this.gpxDoc;

    let points = Array.from(this.trackPoints).map((pt) => ({
      lat: parseFloat(pt.getAttribute("lat")),
      lon: parseFloat(pt.getAttribute("lon")),
      ele: parseFloat(pt.querySelector("ele")?.textContent),
      time: pt.querySelector("time")?.textContent,
    }));

    // More efficient Ramer-Douglas-Peucker algorithm
    points = this.rdp(points, 0.00001); // Epsilon value, adjust as needed

    if (points.length > targetPoints) {
      const reductionRatio = targetPoints / points.length;
      const newPoints = [];
      for (let i = 0; i < points.length; i += 1 / reductionRatio) {
        newPoints.push(points[Math.floor(i)]);
      }
      points = newPoints;
    }

    let newGPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Add Ascent to Peakbagger Extension">
<trk><trkseg>`;

    points.forEach((point) => {
      newGPX += `<trkpt lat="${point.lat}" lon="${point.lon}">`;
      if (point.ele) newGPX += `<ele>${point.ele}</ele>`;
      if (point.time) newGPX += `<time>${point.time}</time>`;
      newGPX += "</trkpt>";
    });

    newGPX += "</trkseg></trk></gpx>";
    return newGPX;
  }

  rdp(points, epsilon) {
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    if (points.length <= 2) {
      return points;
    }

    let maxDistance = 0;
    let maxIndex = 0;

    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(
        points[i],
        firstPoint,
        lastPoint
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxDistance > epsilon) {
      const left = this.rdp(points.slice(0, maxIndex + 1), epsilon);
      const right = this.rdp(points.slice(maxIndex), epsilon);
      return left.slice(0, left.length - 1).concat(right);
    } else {
      return [firstPoint, lastPoint];
    }
  }

  perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.lon - lineStart.lon;
    const dy = lineEnd.lat - lineStart.lat;

    if (dx === 0 && dy === 0) {
      return getDistance(point.lat, point.lon, lineStart.lat, lineStart.lon);
    }

    const t =
      ((point.lon - lineStart.lon) * dx + (point.lat - lineStart.lat) * dy) /
      (dx * dx + dy * dy);
    const closestX = lineStart.lon + t * dx;
    const closestY = lineStart.lat + t * dy;

    return getDistance(point.lat, point.lon, closestY, closestX);
  }
}

function metersToFeet(meters) {
  return meters * 3.28084;
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c; // in metres
  return d;
}

function trackLengthMeters(points) {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const lat1 = parseFloat(points[i - 1].getAttribute("lat"));
    const lon1 = parseFloat(points[i - 1].getAttribute("lon"));
    const lat2 = parseFloat(points[i].getAttribute("lat"));
    const lon2 = parseFloat(points[i].getAttribute("lon"));
    meters += getDistance(lat1, lon1, lat2, lon2);
  }
  return meters;
}

function elevationGainFt(points) {
  // Calculate total elevation gain, ignoring changes below the threshold to reduce noise
  let gainMeters = 0;
  let lastValidElevation = parseFloat(
    points[0].getElementsByTagName("ele")[0].textContent
  );
  for (let i = 1; i < points.length; i++) {
    const elev = parseFloat(
      points[i].getElementsByTagName("ele")[0].textContent
    );
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
  let lastValidElevation = parseFloat(
    points[0].getElementsByTagName("ele")[0].textContent
  );
  for (let i = 1; i < points.length; i++) {
    const elev = parseFloat(
      points[i].getElementsByTagName("ele")[0].textContent
    );
    if (lastValidElevation - elev > ELEVATION_THRESHOLD_METERS) {
      metersLost += lastValidElevation - elev;
      lastValidElevation = elev;
    }
  }
  return metersToFeet(metersLost);
}

function calculateDuration(points) {
  const startTime = new Date(
    points[0].getElementsByTagName("time")[0].textContent
  );
  const endTime = new Date(
    points[points.length - 1].getElementsByTagName("time")[0].textContent
  );
  const diffMinutes = (endTime - startTime) / (1000 * 60);

  const days = Math.floor(diffMinutes / (24 * 60));
  const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
  const minutes = Math.floor(diffMinutes % 60);

  return { days, hours, minutes };
}

// async function getPeaksNear(lat, lon, userId) {
//   try {
//       const url = `https://peakbagger.com/m/pt.ashx?pn=APIGetNearbyPeaks&p1=${lat}&p2=${lon}&p3=${userId}&p4=1&p5=0&p9=0&p10=0&p6=-32000&p11=32000&p7=0&p8=50&p12='en'&p13=0&p14=0&p15=''&p16=0&p17=0.0`;
//       const response = await fetch(url);
//       const text = await response.text();

//       // Parse XML string
//       const parser = new DOMParser();
//       const xmlDoc = parser.parseFromString(text, "text/xml");

//       // Convert XML to array of peak objects
//       const peaks = Array.from(xmlDoc.getElementsByTagName('r')).map(peak => ({
//           id: parseInt(peak.getAttribute('i')),
//           name: peak.getAttribute('n'),
//           elevation: parseInt(peak.getAttribute('f')),
//           latitude: parseFloat(peak.getAttribute('a')),
//           longitude: parseFloat(peak.getAttribute('o')),
//           prominence: parseInt(peak.getAttribute('t')),
//           isolation: parseInt(peak.getAttribute('r')),
//           distance: parseFloat(peak.getAttribute('s')),
//           location: peak.getAttribute('l'),
//       }));
//       return peaks;
//   } catch (error) {
//       alert(error)
//   }
// }
