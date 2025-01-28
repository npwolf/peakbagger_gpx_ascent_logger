/* global GPXPeakTrack */
/* global GPXTrackReducer */
let userId = null;
let gpxDocText = null;
let gpxTrack = null;
let id2GpxPeakTrack = new Map();
const MAX_PEAKBAGGER_GPX_POINTS = 3000;

document.addEventListener("DOMContentLoaded", () => {
  // Add this new listener for incoming file data
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processDownloadedFile' && message.fileData) {
      handleFileLoad(message.fileData.name, message.fileData.content);
    }
  });

  checkLoginStatus();
  document.getElementById("login-button").addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://peakbagger.com/Climber/Login.aspx",
    });
  });

  // File selection handler
  document
    .getElementById("select-file-button")
    .addEventListener("click", handleFileSelection);

  // Mode selection handlers
  document.getElementById("auto-detect").addEventListener("click", () => {
    document.getElementById("peak-selection").classList.add("hidden");
    document.getElementById("manual-search").classList.add("hidden");
    autoDetectPeaks();
  });

  document.getElementById("manual-select").addEventListener("click", () => {
    document.getElementById("peak-selection").classList.add("hidden");
  });

  document
    .getElementById("draft-ascents")
    .addEventListener("click", openAscentTabs);

  document.getElementById("manual-select").addEventListener("click", () => {
    document.getElementById("peak-selection").classList.add("hidden");
    document.getElementById("manual-search").classList.remove("hidden");
    setupManualSearch();
  });
});

function handleFileSelection() {
  document.getElementById("points-reduction").classList.add("hidden");
  const fileInput = document.getElementById("gpx-file-input");
  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      const fileName = file.name;
      reader.onload = (e) => handleFileLoad(fileName, e.target.result);
      reader.readAsText(file);
    }
  };
  fileInput.click();
}

async function handleFileLoad(fileName, content) {
  try {
    document.getElementById("error-message").classList.add("hidden");
    document.getElementById("mode-selection").classList.add("hidden");
    document.getElementById("peak-selection").classList.add("hidden");
    document.getElementById("manual-search").classList.add("hidden");
    const parser = new DOMParser();
    const gpxTrackReducer = new GPXTrackReducer(
      parser.parseFromString(content, "text/xml")
    );
    const trackPointsBefore = gpxTrackReducer.gpxTrack.trackPoints.length;
    if (gpxTrackReducer.reduceGPXTrack(MAX_PEAKBAGGER_GPX_POINTS)) {
      const reductionMessage = `Smoothed GPX track to reduce points from ${trackPointsBefore} to ${gpxTrackReducer.gpxTrack.trackPoints.length}. Peakbagger does not allow more than that.`;
      document.getElementById("points-reduction").textContent =
        reductionMessage;
      document.getElementById("points-reduction").classList.remove("hidden");
      console.log(reductionMessage);
    }
    const serializer = new XMLSerializer();
    gpxDocText = serializer.serializeToString(gpxTrackReducer.gpxDocXml);
    gpxTrack = gpxTrackReducer.gpxTrack;
    const selectedFile = document.getElementById("selected-file");
    selectedFile.textContent = fileName;
    selectedFile.classList.remove("hidden");
    document.getElementById("mode-selection").classList.remove("hidden");
  } catch (error) {
    console.error("Error parsing GPX file:", error);
    document.getElementById(
      "error-message"
    ).textContent = `Error: ${error.message}`;
    document.getElementById("error-message").classList.remove("hidden");
  }
}

function displayAutoDetectedPeaks(peaks) {
  const peakContainers = document.getElementById("peak-containers");
  peakContainers.innerHTML = ""; // Clear existing content

  const peakList = document.createElement("ul");
  peakList.className = "peak-list";

  // Sort peaks by closest distance - remove the map operation
  const sortedPeaks = peaks.sort(
    (a, b) => a.closestDistanceFtToPeak - b.closestDistanceFtToPeak
  );
  id2GpxPeakTrack.clear();
  sortedPeaks.forEach((peak) => {
    id2GpxPeakTrack.set(peak.id, peak);
    const listItem = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const checkboxId = `auto-${peak.id}`; // Create an ID
    checkbox.id = checkboxId; // Assign ID to checkbox
    checkbox.dataset.peakId = checkboxId;
    checkbox.checked = true;
    const label = document.createElement("label");
    label.htmlFor = checkboxId;
    checkbox.checked = true; // Default to checked
    const miles = (peak.closestDistanceFtToPeak / 5280).toFixed(2);
    label.textContent = `${peak.name}, ${peak.location} (${peak.elevationFt}') - ${miles}mi from track`;

    listItem.appendChild(checkbox);
    listItem.appendChild(label);
    peakList.appendChild(listItem);
  });
  console.log("id2GpxPeakTrack:", id2GpxPeakTrack);
  peakContainers.appendChild(peakList);
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("peak-selection").classList.remove("hidden");
}

async function autoDetectPeaks() {
  try {
    console.log("Autodetecting peaks");
    if (!gpxDocText) return;

    document.getElementById("loading").classList.remove("hidden");
    const nearbyPeaks = await getNearbyPeaks();
    displayAutoDetectedPeaks(nearbyPeaks);
  } catch (error) {
    console.error("Error autodetecting peaks:", error);
    alert("Error autodetecting peaks. Please try again.");
  }
}

async function getNearbyPeaks() {
  const midPoint = gpxTrack.roughMidPoint;
  try {
    const response = await chrome.runtime.sendMessage({
      action: "getNearbyPeaks",
      lat: midPoint.lat,
      lon: midPoint.lon,
      userId: userId,
    });

    if (response.error) {
      console.error("Error fetching nearby peaks:", response.error);
      alert("Failed to fetch nearby peaks from Peakbagger!");
      return [];
    }
    const nearbyPeaks = await parsePBPeaksResponse(response.peaksText);
    // Filter peaks by distance
    const filteredNearbyPeaks = nearbyPeaks.filter(
      (peak) => peak.closestDistanceFtToPeak < 500
    );
    return filteredNearbyPeaks;
  } catch (error) {
    console.error("Error fetching nearby peaks:", error);
    throw new Error("Failed to fetch nearby peaks");
  }
}

async function parsePBPeaksResponse(text) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  const pbElement = xmlDoc.getElementsByTagName("pb")[0];
  if (!pbElement) {
    new Error("Unexpected results from peak search. Try again later.");
  }

  // Convert XML to array of GPXPeakTrack objects
  const peaks = Array.from(xmlDoc.getElementsByTagName("r")).map((pbRow) => {
    const lat = parseFloat(pbRow.getAttribute("a"));
    const lon = parseFloat(pbRow.getAttribute("o"));

    // Create new GPXPeakTrack with track points and peak coordinates
    const peakTrack = new GPXPeakTrack(gpxTrack.trackPoints, { lat, lon });

    // Add peak metadata
    peakTrack.id = parseInt(pbRow.getAttribute("i"));
    peakTrack.name = pbRow.getAttribute("n");
    peakTrack.elevationFt = parseInt(pbRow.getAttribute("f"));
    peakTrack.prominence = parseInt(pbRow.getAttribute("r"));
    peakTrack.location = pbRow.getAttribute("l");

    return peakTrack;
  });
  return peaks;
}

function updateLoginSections(isLoggedIn) {
  document.getElementById("loading-section").classList.add("hidden");
  document
    .getElementById("login-section")
    .classList.toggle("hidden", isLoggedIn);
  document
    .getElementById("main-content")
    .classList.toggle("hidden", !isLoggedIn);
}

async function checkLoginStatus() {
  try {
    const response = await fetch("https://peakbagger.com/Default.aspx");
    const text = await response.text();
    const match = text.match(
      /href="climber\/climber\.aspx\?cid=(\d+)">My Home Page<\/a>/
    );

    if (match && match[1]) {
      userId = match[1];
      updateLoginSections(true);
    } else {
      updateLoginSections(false);
    }
  } catch (error) {
    console.error("Error checking login status:", error);
    updateLoginSections(false);
  }
}

async function openAscentTabs() {
  const checkboxes = document.querySelectorAll(
    ".peak-list input[type=\"checkbox\"]:checked"
  );
  if (!gpxDocText) return;

  let peaksData = [];
  checkboxes.forEach((checkbox) => {
    console.log("Checkbox peakId:", checkbox);
    const peakId = parseInt(checkbox.id.replace("auto-", ""));
    const peak = id2GpxPeakTrack.get(peakId);
    const peakData = {
      id: peakId,
      peakCoordinates: peak.peakCoordinates,
      trackPoints: peak.trackPoints,
      gpxContent: gpxDocText,
    };
    console.log("Adding peak to array:", peak);
    peaksData.push(peakData);
  });

  await chrome.runtime.sendMessage({
    action: "draftMultiplePBAscents",
    gpxContent: gpxDocText,
    peaksData: peaksData,
    userId: userId,
  });
}

function setupManualSearch() {
  document
    .getElementById("search-peaks-button")
    .addEventListener("click", searchPeaksManual);
  document
    .getElementById("draft-manual-ascent")
    .addEventListener("click", draftManualAscent);
  document.getElementById("peak-search").addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      searchPeaksManual();
    }
  });
}

async function searchPeaksManual() {
  document.getElementById("search-results").classList.add("hidden");
  document.getElementById("loading").classList.remove("hidden");
  const searchText = document.getElementById("peak-search").value;
  if (!searchText) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "searchPeaks",
      searchText: searchText,
      userId: userId,
    });

    if (response.error) {
      console.error("Error searching peaks:", response.error);
      return;
    }

    const peaks = await parsePBPeaksResponse(response.peaksText);
    document.getElementById("loading").classList.add("hidden");
    displayManualSearchResults(peaks);
    document.getElementById("search-results").classList.remove("hidden");
  } catch (error) {
    console.error("Error during peak search:", error);
  }
}

function displayManualSearchResults(peaks) {
  const select = document.getElementById("peak-results");
  select.innerHTML = "";

  // Sort peaks by closest distance to track
  peaks.sort((a, b) => a.closestDistanceFtToPeak - b.closestDistanceFtToPeak);

  id2GpxPeakTrack = new Map();
  peaks.forEach((peak) => {
    const option = document.createElement("option");
    id2GpxPeakTrack.set(peak.id, peak);
    option.id = `manual-${peak.id}`;
    const miles = (peak.closestDistanceFtToPeak / 5280).toFixed(2);
    option.textContent = `${peak.name}, ${peak.location} (${peak.elevationFt}') - ${miles}mi from track`;
    select.appendChild(option);
  });
}

async function draftManualAscent() {
  const select = document.getElementById("peak-results");
  const selectedOption = select.options[select.selectedIndex];
  if (!selectedOption || !gpxDocText) return;

  const peakId = parseInt(selectedOption.id.replace("manual-", ""));
  const peak = id2GpxPeakTrack.get(peakId);

  const peakData = {
    id: peakId,
    peakCoordinates: peak.peakCoordinates,
    trackPoints: peak.trackPoints,
    gpxContent: gpxDocText,
  };
  await chrome.runtime.sendMessage({
    action: "draftPBAscent",
    userId: userId,
    peakData: peakData,
  });
}
