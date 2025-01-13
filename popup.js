/* global GPXTrack */
/* global GPXPeakTrack */
let userId = null;

document.addEventListener("DOMContentLoaded", () => {
  checkLoginStatus();
  document.getElementById("login-button").addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://www.peakbagger.com/Climber/Login.aspx",
    });
  });

  // File selection handler
  document
    .getElementById("select-file-button")
    .addEventListener("click", () => {
      const fileInput = document.getElementById("gpx-file-input");
      fileInput.onchange = async (event) => {
        const file = event.target.files[0];
        if (file) {
          const selectedFile = document.getElementById("selected-file");
          selectedFile.textContent = file.name;
          selectedFile.classList.remove("hidden");
          document.getElementById("mode-selection").classList.remove("hidden");
        }
      };
      fileInput.click();
    });

  // Mode selection handlers
  document.getElementById("auto-detect").addEventListener("click", () => {
    document.getElementById("peak-selection").classList.add("hidden");
    autoDetectPeaks();
  });

  document.getElementById("manual-select").addEventListener("click", () => {
    document.getElementById("peak-selection").classList.add("hidden");
    processManualPeakSelection();
  });

  document
    .getElementById("draft-ascents")
    .addEventListener("click", openAscentTabs);
});

async function validatePeakbaggerPage(tab) {
  const ascentEditUrl = `https://www.peakbagger.com/climber/ascentedit.aspx?cid=${userId}`;
  const navigationMessage = document.getElementById("navigation-message");

  if (
    !tab.url.match(
      /^https:\/\/(www\.)?peakbagger\.com\/climber\/ascentedit\.aspx/
    )
  ) {
    navigationMessage.innerHTML =
      "Please navigate to the <a href=\"#\" id=\"ascentedit-link\">Peakbagger ascent edit page</a> and select a peak first.";
    navigationMessage.classList.remove("hidden");
    document.getElementById("ascentedit-link").addEventListener("click", () => {
      chrome.tabs.create({ url: ascentEditUrl });
    });
    return false;
  }
  return true;
}

async function confirmPeakSelected(tab) {
  const navigationMessage = document.getElementById("navigation-message");

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.getElementById("PointFt").value,
  });

  const elevation = parseInt(result[0].result);
  if (!elevation || elevation <= 0) {
    navigationMessage.innerHTML =
      "Please select a peak using the \"Add/Change Peak\" on the edit page.";
    navigationMessage.classList.remove("hidden");
    return false;
  }

  navigationMessage.classList.add("hidden");
  return true;
}

async function injectContentScripts(tab) {
  const isLoaded = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () =>
      Object.prototype.hasOwnProperty.call(window, "contentScriptLoaded"),
  });

  if (!isLoaded[0].result) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["gpx-utils.js"],
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  }
}

function handleGPXFileSelection(callback) {
  const file = document.getElementById("gpx-file-input").files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    const gpxContent = e.target.result;
    await callback(gpxContent);
  };

  reader.readAsText(file);
}

function manualSelectGPXFile(tab) {
  handleGPXFileSelection(async (gpxContent) => {
    await chrome.tabs.sendMessage(tab.id, {
      action: "processGPXContent",
      gpxContent: gpxContent,
    });
    window.close();
  });
}

async function processManualPeakSelection() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    console.log("Checking page:", tab.url);
    console.log("Tab ID:", tab.id);

    if (!(await validatePeakbaggerPage(tab))) {
      return;
    }

    if (!(await confirmPeakSelected(tab))) {
      return;
    }

    await injectContentScripts(tab);
    manualSelectGPXFile(tab);
  } catch (error) {
    console.error("Error checking page:", error);
    const navigationMessage = document.getElementById("navigation-message");
    navigationMessage.innerHTML =
      "Error accessing page content. Please make sure you're on the correct page.";
    navigationMessage.classList.remove("hidden");
  }
}

function displayPeakList(sortedPeaks) {
  const peakContainers = document.getElementById("peak-containers");
  peakContainers.innerHTML = ""; // Clear existing content

  const peakList = document.createElement("ul");
  peakList.className = "peak-list";

  sortedPeaks.forEach((peak) => {
    const listItem = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = peak.peakId; // Use peakId instead of id
    checkbox.checked = true; // Default to checked

    const label = document.createElement("label");
    label.htmlFor = peak.peakId;
    label.textContent = peak.name;

    listItem.appendChild(checkbox);
    listItem.appendChild(label);
    peakList.appendChild(listItem);
  });

  peakContainers.appendChild(peakList);
  document.getElementById("loading-peaks").classList.add("hidden");
  document.getElementById("peak-selection").classList.remove("hidden");
}

async function autoDetectPeaks() {
  try {
    console.log("Autodetecting peaks");
    handleGPXFileSelection(async (gpxContent) => {
      document.getElementById("loading-peaks").classList.remove("hidden");
      const parser = new DOMParser();
      const gpxDocXml = parser.parseFromString(gpxContent, "text/xml");
      const gpxTrack = GPXTrack.fromGpxDocXml(gpxDocXml);
      const peaks = await getNearbyPeaksFromGpxDocXml(gpxDocXml);
      const sortedPeaks = await getPeaksOnTrack(peaks, gpxTrack);
      for (const peak of sortedPeaks) {
        console.log(
          `Peak: ${peak.name}, Distance: ${peak.gpxPeakTrack.closestDistanceFtToPeak}`
        );
      }

      displayPeakList(sortedPeaks);
    });
  } catch (error) {
    console.error("Error autodetecting peaks:", error);
    alert("Error autodetecting peaks. Please try again.");
  }
}

async function getNearbyPeaksFromGpxDocXml(gpxDocXml) {
  const gpxTrack = GPXTrack.fromGpxDocXml(gpxDocXml);
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
      throw new Error("Failed to fetch nearby peaks");
    }
    const nearbyPeaks = await parseNearbyPeaksResponse(response.peaksText);
    return nearbyPeaks;
  } catch (error) {
    console.error("Error fetching nearby peaks:", error);
    throw new Error("Failed to fetch nearby peaks");
  }
}

async function getPeaksOnTrack(peaks, gpxTrack) {
  const startTime = performance.now();
  const peakMap = new Map();
  for (const peak of peaks) {
    const peakCoordinates = { lat: peak.lat, lon: peak.lon };
    console.log("Track Points:", gpxTrack.trackPoints.length);
    const gpxPeakTrack = new GPXPeakTrack(
      gpxTrack.trackPoints,
      peakCoordinates
    );
    if (gpxPeakTrack.closestDistanceFtToPeak < 500) {
      peakMap.set(peak, gpxPeakTrack);
    }
  }
  // Create sorted array of peaks by closest distance
  const sortedPeaks = Array.from(peakMap.entries())
    .sort((a, b) => a[1].closestDistanceFtToPeak - b[1].closestDistanceFtToPeak)
    .map(([peak, gpxPeakTrack]) => ({
      name: `${peak.name}, ${peak.location} (${peak.elevationFt}')`,
      peakId: peak.id,
      gpxPeakTrack: gpxPeakTrack,
    }));

  const endTime = performance.now();
  console.log(
    `getPeaksToTracks took ${((endTime - startTime) / 1000).toFixed(2)} seconds`
  );
  return sortedPeaks;
}

async function parseNearbyPeaksResponse(text) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");

  // Convert XML to array of peak objects
  // Example row:
  // 	<r i="21582" n="Lone Mountain" f="3342" a="36.238156" o="-115.315186" t="410" r="542" s="2.24" l="USA-NV" lkvp="1*48349|2*154811|6*W7N/CK-227|9*841766"/>
  const peaks = Array.from(xmlDoc.getElementsByTagName("r")).map((peak) => ({
    id: parseInt(peak.getAttribute("i")),
    name: peak.getAttribute("n"),
    elevationFt: parseInt(peak.getAttribute("f")),
    lat: parseFloat(peak.getAttribute("a")),
    lon: parseFloat(peak.getAttribute("o")),
    //unknown: parseInt(peak.getAttribute("t")),
    prominence: parseInt(peak.getAttribute("r")),
    // unknown: parseFloat(peak.getAttribute("s")),
    location: peak.getAttribute("l"),
  }));
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
    const response = await fetch("https://www.peakbagger.com/Default.aspx");
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

function openAscentTabs() {
  const checkboxes = document.querySelectorAll(
    ".peak-list input[type=\"checkbox\"]:checked"
  );
  checkboxes.forEach((checkbox) => {
    const url = `https://peakbagger.com/climber/ascentedit.aspx?pid=${checkbox.id}&cid=${userId}`;
    chrome.tabs.create({ url });
  });
}
