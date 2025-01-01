// popup.js
let userId = null;

document.addEventListener('DOMContentLoaded', checkLoginStatus);
document.getElementById('login-button').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.peakbagger.com/Default.aspx' });
});

document.getElementById('gpx-files').addEventListener('change', handleFileSelect);
document.getElementById('process-files').addEventListener('click', processFiles);
document.getElementById('submit-ascents').addEventListener('click', submitAscents);

let gpxFiles = [];

function handleFileSelect(event) {
    gpxFiles = event.target.files;
    const fileListDiv = document.getElementById('file-list');
    fileListDiv.innerHTML = ''; // Clear previous list
    for (const file of gpxFiles) {
        const fileDiv = document.createElement('div');
        fileDiv.textContent = file.name;
        fileListDiv.appendChild(fileDiv);
    }
}

async function processFiles() {
    if (gpxFiles.length === 0) {
        alert("Please select GPX files.");
        return;
    }

    document.getElementById('progress').classList.remove('hidden');
    document.getElementById('peak-selection').classList.add('hidden');
    const peakContainers = document.getElementById('peak-containers');
    peakContainers.innerHTML = '';

    for(const file of gpxFiles){
        // Here you would parse the GPX file (using a library like togeojson or similar)
        // and then make requests to peakbagger.com to get peak information.
        // This is a complex part and would require significant additional code.
        // This example uses mock data.
        const mockPeaks = [
            { name: "Mock Peak 1", elevation: 1000, file: file.name },
            { name: "Mock Peak 2", elevation: 1200, file: file.name },
        ];
        createPeakSection(mockPeaks, file.name);
    }
    document.getElementById('progress').classList.add('hidden');
    document.getElementById('peak-selection').classList.remove('hidden');
}

function createPeakSection(peaks, filename) {
    const peakContainers = document.getElementById('peak-containers');
    const peakSection = document.createElement('div');
    peakSection.className = 'peak-section';
    peakSection.innerHTML = `<h3>${filename}</h3><ul class="peak-list"></ul>`;
    const peakList = peakSection.querySelector('.peak-list');

    peaks.forEach(peak => {
        const li = document.createElement('li');
        li.innerHTML = `<input type="checkbox" id="${peak.name}" data-filename="${filename}" data-name="${peak.name}" data-elevation="${peak.elevation}"><label for="${peak.name}">${peak.name} (${peak.elevation} ft)</label>`;
        peakList.appendChild(li);
    });
    peakContainers.appendChild(peakSection);
}

function submitAscents() {
    const checkedPeaks = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));
    checkedPeaks.forEach(peak => {
        const filename = peak.dataset.filename;
        const name = peak.dataset.name;
        const elevation = peak.dataset.elevation;
        // Construct the Peakbagger URL with parameters.
        const url = `https://www.peakbagger.com/`;
        chrome.tabs.create({ url: url });
        // You would also want to pass other data (date, route, etc.)
    });
}

async function checkLoginStatus() {
    try {
        const response = await fetch('https://www.peakbagger.com/Default.aspx');
        const text = await response.text();
        const match = text.match(/href="climber\/climber\.aspx\?cid=(\d+)">My Home Page<\/a>/);

        if (match && match[1]) {
            userId = match[1];
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
        } else {
            document.getElementById('login-section').classList.remove('hidden');
            document.getElementById('main-content').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error checking login status:', error);
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
    }
}
