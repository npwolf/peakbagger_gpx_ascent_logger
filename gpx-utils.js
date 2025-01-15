window.gpxUtilsScriptLoaded = true;
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
    if (!this.trackPoints.length) {
      throw new Error("No track points found in GPX file");
    } else if (this.trackPoints.length === 1) {
      throw new Error("Only one track point found in GPX file.");
    }
    this.firstPoint = this.trackPoints[0];
    this.lastPoint = this.trackPoints[this.trackPoints.length - 1];
    // Calculate basic metrics
    this.startDate = this.firstPoint.datetime.split("T")[0];
    this.startElevationFt = metersToFeet(this.firstPoint.elevation);
    this.endElevationFt = metersToFeet(this.lastPoint.elevation);
  }

  static fromGpxDocXml(gpxDocXml) {
    const gpxTrack = new GPXTrack(getPointsFromGpxXml(gpxDocXml));
    return gpxTrack;
  }

  getDistanceMetersFromRoughMidPoint(lat1, lon1) {
    const { lat: lat2, lon: lon2 } = this.roughMidPoint;
    return getDistanceMeters(lat1, lon1, lat2, lon2);
  }

  get roughMidPoint() {
    if (this.trackPoints.length < 2) {
      return this.trackPoints[0];
    }
    const midIndex = Math.floor(this.trackPoints.length / 2);
    return this.trackPoints[midIndex];
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

  calculateGaindAndLoss() {
    let totalLoss = 0;
    let totalGain = 0;
    let lastSignificantElevation = this.trackPoints[0].elevation;

    for (let i = 1; i < this.trackPoints.length; i++) {
      const currentElevation = this.trackPoints[i].elevation;
      const elevationDiff = currentElevation - lastSignificantElevation;

      // Only process elevation changes that exceed the threshold
      if (Math.abs(elevationDiff) >= ELEVATION_THRESHOLD_METERS) {
        if (elevationDiff < 0) {
          // Descent
          totalLoss += Math.abs(elevationDiff);
        } else {
          // Ascent
          totalGain += elevationDiff;
        }
        // Update the last significant elevation point
        lastSignificantElevation = currentElevation;
      }
    }
    this.#gainFt = metersToFeet(totalGain);
    this.#lossFt = metersToFeet(totalLoss);
  }

  get gainFt() {
    if (this.#gainFt === null) {
      this.calculateGaindAndLoss();
    }
    return this.#gainFt;
  }

  get lossFt() {
    if (this.#lossFt === null) {
      this.calculateGaindAndLoss();
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
  id = null;
  name = null;
  elevationFt = null;
  prominence = null;
  location = null;
  #closestDistanceFtToPeak = null;
  #peakIndex = null;
  #toPeakTrack = null;
  #fromPeakTrack = null;
  #closestPoint = null;

  constructor(points, peakCoordinates) {
    console.log("GPXPeakTrack points", points.length);
    super(points);
    this.peakCoordinates = peakCoordinates;
  }

  get peakIndex() {
    if (this.#peakIndex === null) {
      this.findClosestPointToPeak();
    }
    return this.#peakIndex;
  }

  get closestPoint() {
    if (this.#closestPoint === null) {
      this.findClosestPointToPeak();
    }
    return this.#closestPoint;
  }

  get toPeakTrack() {
    if (this.#toPeakTrack === null) {
      if (this.peakIndex === 0) {
        // If peakIndex is at the start, ensure minimum 2 elements
        this.#toPeakTrack = new GPXTrack(this.trackPoints.slice(0, 2));
      } else {
        this.#toPeakTrack = new GPXTrack(
          this.trackPoints.slice(0, this.peakIndex + 1)
        );
      }
    }
    return this.#toPeakTrack;
  }

  get fromPeakTrack() {
    if (this.#fromPeakTrack === null) {
      if (this.peakIndex === this.trackPoints.length - 1) {
        // If peakIndex is at the end, ensure minimum 2 elements
        this.#fromPeakTrack = new GPXTrack(
          this.trackPoints.slice(this.peakIndex - 1)
        );
      } else {
        this.#fromPeakTrack = new GPXTrack(
          this.trackPoints.slice(this.peakIndex)
        );
      }
    }
    return this.#fromPeakTrack;
  }

  get closestDistanceFtToPeak() {
    if (this.#closestDistanceFtToPeak == null) {
      const closestPoint = this.trackPoints[this.peakIndex];
      const distMeters = getDistanceMeters(
        closestPoint.lat,
        closestPoint.lon,
        this.peakCoordinates.lat,
        this.peakCoordinates.lon
      );
      return metersToFeet(distMeters);
    }
    return this.#closestDistanceFtToPeak;
  }

  findClosestPointToPeak() {
    const result = this.findClosestPointToCoordinates(
      this.peakCoordinates.lat,
      this.peakCoordinates.lon
    );
    this.#closestPoint = result.point;
    this.#peakIndex = result.index;
  }

  findClosestPointToCoordinates(targetLat, targetLon) {
    let minDistance = Infinity;
    let closestPoint = null;
    let closestPointIndex = null;
    this.trackPoints.forEach((point, index) => {
      const distance = getDistanceMeters(
        point.lat,
        point.lon,
        targetLat,
        targetLon
      );
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
    this.gpxTrack = GPXTrack.fromGpxDocXml(this.gpxDocXml);
  }

  reduceGPXTrack(targetPointsLen) {
    if (this.gpxTrack.trackPoints.length <= targetPointsLen) {
      console.log(
        `GPX track has ${this.gpxTrack.trackPoints.length} points, which is already less than the target of ${targetPointsLen}.`
      );
      return false;
    }
    // More efficient Ramer-Douglas-Peucker algorithm
    let points = this.rdp(this.gpxTrack.trackPoints, 0.00001); // Epsilon value, adjust as needed

    if (points.length > targetPointsLen) {
      console.log(
        `Still need to reduce more after rdp. Reducing GPX track from ${points.length} to ${targetPointsLen} points.`
      );
      // Added + 1 to ensure we don't go over the target
      const reductionRatio = targetPointsLen / (points.length + 1);
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
    return true;
  }

  update(newPoints) {
    // Change the creator attribute since we're modifying the file
    this.gpxDocXml.documentElement.setAttribute(
      "creator",
      "Add Ascent to Peakbagger Extension"
    );

    // Create new track structure
    const trk = this.gpxDocXml.createElementNS(
      this.gpxDocXml.documentElement.namespaceURI,
      "trk"
    );
    const trkseg = this.gpxDocXml.createElementNS(
      this.gpxDocXml.documentElement.namespaceURI,
      "trkseg"
    );
    trk.appendChild(trkseg);

    // Add new track points
    newPoints.forEach((point) => {
      const trkpt = this.gpxDocXml.createElementNS(
        this.gpxDocXml.documentElement.namespaceURI,
        "trkpt"
      );
      trkpt.setAttribute("lat", point.lat.toString());
      trkpt.setAttribute("lon", point.lon.toString());

      const ele = this.gpxDocXml.createElementNS(
        this.gpxDocXml.documentElement.namespaceURI,
        "ele"
      );
      ele.textContent = point.elevation.toString();
      trkpt.appendChild(ele);

      const time = this.gpxDocXml.createElementNS(
        this.gpxDocXml.documentElement.namespaceURI,
        "time"
      );
      time.textContent = point.datetime;
      trkpt.appendChild(time);

      trkseg.appendChild(trkpt);
    });

    // Replace last track or append if none exist
    const existingTracks = this.gpxDocXml.getElementsByTagName("trk");
    // Remove all but the last track
    while (existingTracks.length > 1) {
      existingTracks[0].parentNode.removeChild(existingTracks[0]);
    }
    // Now replace the last track with ours (or create if it doesn't exist)
    if (existingTracks.length == 1) {
      const lastTrack = existingTracks[0];
      lastTrack.parentNode.replaceChild(trk, lastTrack);
    } else {
      this.gpxDocXml.documentElement.appendChild(trk);
    }

    this.gpxTrack = GPXTrack.fromGpxDocXml(this.gpxDocXml);
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
      return getDistanceMeters(
        point.lat,
        point.lon,
        lineStart.lat,
        lineStart.lon
      );
    }

    const t =
      ((point.lon - lineStart.lon) * dx + (point.lat - lineStart.lat) * dy) /
      (dx * dx + dy * dy);
    const closestX = lineStart.lon + t * dx;
    const closestY = lineStart.lat + t * dy;

    return getDistanceMeters(point.lat, point.lon, closestY, closestX);
  }
}

function metersToFeet(meters) {
  return meters * 3.28084;
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
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
    meters += getDistanceMeters(lat1, lon1, lat2, lon2);
  }
  return meters;
}

function getPointsFromGpxXml(gpxDocXml) {
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
        "Track point missing timestamp data. Add timestamp data to track with https://gotoes.org/strava/Add_Timestamps_To_GPX.php"
      );
    return {
      lat: parseFloat(pt.getAttribute("lat")),
      lon: parseFloat(pt.getAttribute("lon")),
      elevation: parseFloat(elevation),
      datetime: datetime,
    };
  });
  return points;
}

window.GPXTrack = GPXTrack;
window.GPXPeakTrack = GPXPeakTrack;
window.GPXTrackReducer = GPXTrackReducer;
