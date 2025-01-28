console.log("GPX Download content script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GPX_DOWNLOAD') {
    const userChoice = confirm('Do you want to send this to Peakbagger?');

    if (userChoice) {
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
    }
  }
});
