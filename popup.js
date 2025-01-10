/* global GPXTrack */
let userId = null;

document.addEventListener("DOMContentLoaded", () => {
  checkLoginStatus();
  document.getElementById("login-button").addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://www.peakbagger.com/Climber/Login.aspx",
    });
  });

  // Add event listener for the unified file selection button
  document
    .getElementById("select-file-button")
    .addEventListener("click", () => {
      const selectedMode = document.querySelector(
        "input[name=\"mode\"]:checked"
      ).value;

      if (selectedMode === "autodetect") {
        document.getElementById("peak-selection").classList.remove("hidden");
        // Trigger click on the hidden file input
        //document.getElementById("gpx-files").click();
        autoDetectPeaks();
      } else {
        document.getElementById("peak-selection").classList.add("hidden");
        processManualPeakSelection();
      }
    });
});

// function showAutodetectSection() {
//   document.getElementById("autodetect-section").classList.remove("hidden");
//   document.getElementById("mode-selection").classList.add("hidden");
//   document.getElementById("navigation-message").classList.add("hidden");
//   document.getElementById("navigation-message").innerHTML = "";
// }

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

function selectGPXFile(tab) {
  const fileInput = document.getElementById("gpx-file-input");
  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const gpxContent = e.target.result;
      await chrome.tabs.sendMessage(tab.id, {
        action: "processGPXContent",
        gpxContent: gpxContent,
      });
      window.close();
    };

    reader.readAsText(file);
  };

  fileInput.click();
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
    selectGPXFile(tab);
  } catch (error) {
    console.error("Error checking page:", error);
    const navigationMessage = document.getElementById("navigation-message");
    navigationMessage.innerHTML =
      "Error accessing page content. Please make sure you're on the correct page.";
    navigationMessage.classList.remove("hidden");
  }
}

async function autoDetectPeaks() {
  console.log("Autodetecting peaks");
  const fileInput = document.getElementById("gpx-file-input");
  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const gpxContent = e.target.result;
      const parser = new DOMParser();
      const gpxDocXml = parser.parseFromString(gpxContent, "text/xml");
      const peaks = await getNearbyPeaksFromGpxDocXml(gpxDocXml);
      console.log("Peaks:", peaks);
    };

    reader.readAsText(file);
  };

  fileInput.click();
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
    console.log("Nearby peaks:", nearbyPeaks);
    // Handle the peaks data here
  } catch (error) {
    console.error("Error in message passing:", error);
  }
}

async function parseNearbyPeaksResponse(text) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");

  // Convert XML to array of peak objects
  const peaks = Array.from(xmlDoc.getElementsByTagName("r")).map((peak) => ({
    id: parseInt(peak.getAttribute("i")),
    name: peak.getAttribute("n"),
    elevation: parseInt(peak.getAttribute("f")),
    latitude: parseFloat(peak.getAttribute("a")),
    longitude: parseFloat(peak.getAttribute("o")),
    prominence: parseInt(peak.getAttribute("t")),
    isolation: parseInt(peak.getAttribute("r")),
    distance: parseFloat(peak.getAttribute("s")),
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
    // First check current tab
    const [currentTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (
      currentTab &&
      currentTab.url.match(/^https?:\/\/(www\.)?peakbagger\.com/)
    ) {
      const cidMatch = currentTab.url.match(/[?&]cid=(\d+)/);
      if (cidMatch && cidMatch[1]) {
        userId = cidMatch[1];
        updateLoginSections(true);
        return;
      }
    }

    // Then check all open tabs
    const allTabs = await chrome.tabs.query({
      url: ["*://www.peakbagger.com/*", "*://peakbagger.com/*"],
    });
    for (const tab of allTabs) {
      const cidMatch = tab.url.match(/[?&]cid=(\d+)/);
      if (cidMatch && cidMatch[1]) {
        userId = cidMatch[1];
        updateLoginSections(true);
        return;
      }
    }

    // Fall back to fetch method
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
