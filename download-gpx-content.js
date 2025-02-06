console.log("GPX Download content script loaded");

function createDialog(fileName, onYes) {
  console.log("Creating dialog");
  const shortName = fileName.split(/[\\/]/).pop();
  const dialog = document.createElement('div');
  dialog.innerHTML = `
    <style>
      #gpx-dialog {
        font-family: sans-serif;
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex; align-items: center; justify-content: center;
      }
      .gpx-dialog-content {
        background: #fff; padding: 20px; border-radius: 4px; text-align: center;
        max-width: 300px; width: 100%; box-sizing: border-box;
      }
      .gpx-dialog-content p {
        font-weight: bold;
        font-size: 1.2em;
        color: #333;
        margin-bottom: 15px;
      }
      .filename-box {
        margin-top: 5px;
        padding: 8px;
        background-color: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 0.9em;
        word-break: break-all;
        width: 100%;
        box-sizing: border-box;
      }
      .gpx-dialog-buttons {
        margin-top: 10px; display: flex; justify-content: space-evenly;
      }
      .gpx-dialog-buttons button {
        background-color: #007bff; color: #fff;
        border: none; border-radius: 4px; padding: 8px 12px;
        cursor: pointer; margin: 0;
      }
      .gpx-dialog-buttons button:hover {
        background-color: #0056b3;
      }
      .gpx-dialog-buttons .secondary {
        background-color: #6c757d;
      }
      .gpx-dialog-buttons .secondary:hover {
        background-color: #545b62;
      }
    </style>
    <div id="gpx-dialog">
      <div class="gpx-dialog-content">
        <p>Open Peakbagger GPX Ascent Logger extension with:</p>
        <div class="filename-box">${shortName}</div>
        <div class="gpx-dialog-buttons">
          <button id="gpx-yes">Yes</button>
          <button id="gpx-no" class="secondary">No</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  document.getElementById('gpx-yes').onclick = () => {
    document.body.removeChild(dialog);
    onYes();
  };
  document.getElementById('gpx-no').onclick = () => {
    document.body.removeChild(dialog);
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'gpxDownload') {
    createDialog(message.filename, () => {
      fetch(message.url)
        .then(response => response.text())
        .then(gpxContent => {
          chrome.runtime.sendMessage({
            action: 'openPopupWithFile',
            fileData: {
              content: gpxContent,
              name: message.filename
            }
          });
        })
        .catch(error => {
          console.error('Error fetching GPX file:', error);
        });
    });
  }
});
