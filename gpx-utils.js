console.log("GPX utils loaded");

// Define a constant for the vertical noise threshold
const ELEVATION_THRESHOLD_METERS = 10;

/**
 * Base class for GPX track analysis with basic functionality.
 */
/* eslint-disable-next-line no-unused-vars */
class GPXTrack {
  #miles = null;
  #netGainFt = null;
  #gainFt = null;
  #lossFt = null;
  #duration = null;

  constructor(points) {
    this.trackPoints = points;
    this.firstPoint = this.trackPoints[0];
    this.lastPoint = this.trackPoints[this.trackPoints.length - 1];
    // Calculate basic metrics
    this.startDate = this.firstPoint.datetime.split("T")[0];
    this.startElevationFt = metersToFeet(this.firstPoint.elevation);
    this.endElevationFt = metersToFeet(this.lastPoint.elevation);
  }

  static fromGpxDoc(gpxDocXml) {
    const xmlTrackPoints = Array.from(gpxDocXml.getElementsByTagName("trkpt"));
    if (!xmlTrackPoints.length) {
      throw new Error("No track points found in GPX file");
    }
    const points = Array.from(xmlTrackPoints).map((pt) => {
      const elevation = pt.querySelector("ele")?.textContent;
      const datetime = pt.querySelector("time")?.textContent;
      if (!elevation)
        throw new Error(
          "Track point missing elevation data. Add elevation data to track with https://www.gpsvisualizer.com/elevation"
        );
      if (!datetime)
        throw new Error(
          "Track point missing timestamp data. Add timestamp data to track"
        );
      return {
        lat: parseFloat(pt.getAttribute("lat")),
        lon: parseFloat(pt.getAttribute("lon")),
        elevation: parseFloat(elevation),
        datetime: datetime,
      };
    });
    return new GPXTrack(points);
  }

  get miles() {
    if (this.#miles === null) {
      this.#miles = (trackLengthMeters(this.trackPoints) / 1609.34).toFixed(2);
    }
    return this.#miles;
  }

  get netGainFt() {
    if (this.#netGainFt === null) {
      let highestElevation = this.trackPoints[0].elevation;
      let lowestElevation = this.trackPoints[0].elevation;
      for (let i = 1; i < this.trackPoints.length; i++) {
        const elev = this.trackPoints[i].elevation;
        if (elev > highestElevation) {
          highestElevation = elev;
        } else if (elev < lowestElevation) {
          lowestElevation = elev;
        }
      }
      this.#netGainFt = highestElevation - lowestElevation;
    }
    return this.#netGainFt;
  }

  get gainFt() {
    if (this.#gainFt === null) {
      // Calculate total elevation gain, ignoring changes below the threshold to reduce noise
      let gainMeters = 0;
      let lastValidElevation = this.trackPoints[0].elevation;
      for (let i = 1; i < this.trackPoints.length; i++) {
        const elev = this.trackPoints[i].elevation;
        if (elev - lastValidElevation > ELEVATION_THRESHOLD_METERS) {
          gainMeters += elev - lastValidElevation;
          lastValidElevation = elev;
        }
      }
      this.#gainFt = metersToFeet(gainMeters);
    }
    return this.#gainFt;
  }

  get lossFt() {
    if (this.#lossFt === null) {
      // Calculate total elevation loss, ignoring changes below the threshold to reduce noise
      let metersLost = 0;
      let lastValidElevation = this.trackPoints[0].elevation;
      for (let i = 1; i < this.trackPoints.length; i++) {
        const elev = this.trackPoints[i].elevation;
        if (lastValidElevation - elev > ELEVATION_THRESHOLD_METERS) {
          metersLost += lastValidElevation - elev;
          lastValidElevation = elev;
        }
      }
      this.#lossFt = metersToFeet(metersLost);
    }
    return this.#lossFt;
  }

  get duration() {
    if (this.#duration === null) {
      const startTime = new Date(this.firstPoint.datetime);
      const endTime = new Date(this.lastPoint.datetime);
      const diffMinutes = (endTime - startTime) / (1000 * 60);
      const days = Math.floor(diffMinutes / (24 * 60));
      const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
      const minutes = Math.floor(diffMinutes % 60);
      this.#duration = { days, hours, minutes };
    }
    return this.#duration;
  }
}

/**
 * Extended class for GPX track analysis with peak-specific functionality.
 */
/* eslint-disable-next-line no-unused-vars */
class GPXPeakTrack extends GPXTrack {
  constructor(points, peakCoordinates) {
    super(points);
    this.peakCoordinates = peakCoordinates;
    this.findClosestPointToPeak();

    // Split track at peak
    this.toPeakTrack = new GPXTrack(this.trackPoints.slice(0, this.peakIndex));
    this.fromPeakTrack = new GPXTrack(this.trackPoints.slice(this.peakIndex));
  }

  findClosestPointToPeak() {
    const result = this.findClosestPointToCoordinates(
      this.peakCoordinates.lat,
      this.peakCoordinates.lng
    );
    this.closestPoint = result.point;
    this.peakIndex = result.index;
  }

  findClosestPointToCoordinates(targetLat, targetLon) {
    let minDistance = Infinity;
    let closestPoint = null;
    let closestPointIndex = null;
    this.trackPoints.forEach((point, index) => {
      const distance = getDistance(point.lat, point.lon, targetLat, targetLon);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
        closestPointIndex = index;
      }
    });
    return { point: closestPoint, index: closestPointIndex };
  }
}

/**
 * A class that reduces the number of track points in a GPX file while preserving the essential shape of the track.
 * Uses the Ramer-Douglas-Peucker algorithm for line simplification.
 */
/* eslint-disable-next-line no-unused-vars */
class GPXTrackReducer {
  constructor(gpxDocXml) {
    this.gpxDocXml = gpxDocXml;
    this.gpxTrack = new GPXTrack().fromGpxDoc(this.gpxDocXml);
  }

  reduceGPXTrack(targetPointsLen) {
    if (this.gpxTrack.trackPoints.length <= targetPointsLen) {
      console.log(
        `GPX track has ${this.gpxTrack.trackPoints.length} points, which is already less than the target of ${targetPointsLen}.`
      );
      return;
    }
    // More efficient Ramer-Douglas-Peucker algorithm
    let points = this.rdp(this.gpxTrack.trackPoints, 0.00001); // Epsilon value, adjust as needed

    if (points.length > targetPointsLen) {
      console.log(
        `Still need to reduce more after rdp. Reducing GPX track from ${points.length} to ${targetPointsLen} points.`
      );
      const reductionRatio = targetPointsLen / points.length;
      const newPoints = [];
      for (let i = 0; i < points.length; i += 1 / reductionRatio) {
        newPoints.push(points[Math.floor(i)]);
      }
      points = newPoints;
    }
    console.log(
      `Reduced GPX track from ${this.gpxTrack.trackPoints.length} to ${points.length} points.`
    );
    this.update(points);
  }

  update(newPoints) {
    // Change the creator attribute since we're modifying the file
    this.gpxDocXml.documentElement.setAttribute(
      "creator",
      "Add Ascent to Peakbagger Extension"
    );

    // Find or create trkseg
    const oldTrksegs = this.gpxDocXml.getElementsByTagName("trkseg");
    let trkseg;
    if (oldTrksegs.length > 0) {
      trkseg = oldTrksegs[0];
      // Remove all existing trackpoints
      while (trkseg.firstChild) {
        trkseg.removeChild(trkseg.firstChild);
      }
    } else {
      // Create new track structure if it doesn't exist
      const trk = this.gpxDocXml.createElement("trk");
      trkseg = this.gpxDocXml.createElement("trkseg");
      trk.appendChild(trkseg);
      this.gpxDocXml.documentElement.appendChild(trk);
    }

    // Add new track points
    newPoints.forEach((point) => {
      const trkpt = this.gpxDocXml.createElement("trkpt");
      trkpt.setAttribute("lat", point.lat.toString());
      trkpt.setAttribute("lon", point.lon.toString());

      const ele = this.gpxDocXml.createElement("ele");
      ele.textContent = point.elevation.toString();
      trkpt.appendChild(ele);

      const time = this.gpxDocXml.createElement("time");
      time.textContent = point.datetime;
      trkpt.appendChild(time);

      trkseg.appendChild(trkpt);
    });

    this.gpxTrack = new GPXTrack().fromGpxDoc(this.gpxDocXml);
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
  const Δλ = ((lon1 - lon2) * Math.PI) / 180;

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
    const lat1 = parseFloat(points[i - 1].lat);
    const lon1 = parseFloat(points[i - 1].lon);
    const lat2 = parseFloat(points[i].lat);
    const lon2 = parseFloat(points[i].lon);
    meters += getDistance(lat1, lon1, lat2, lon2);
  }
  return meters;
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
