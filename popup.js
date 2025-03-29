// popup.js - the code that runs in the popup
document.addEventListener('DOMContentLoaded', function() {
  const downloadBtn = document.getElementById('downloadBtn');
  const statusDiv = document.getElementById('status');

  // Check if we're on a supported site
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentUrl = tabs[0].url;
    const supportedSites = ['amazon.com', 'yelp.com', 'etsy.com'];
    const isSupportedSite = supportedSites.some(site => currentUrl.includes(site));

    if (!isSupportedSite) {
      downloadBtn.disabled = true;
      statusDiv.textContent = 'Please navigate to Amazon, Yelp, or Etsy to use this extension.';
      statusDiv.className = 'status error';
    }
  });

  downloadBtn.addEventListener('click', function() {
    downloadBtn.disabled = true;
    statusDiv.textContent = 'Downloading reviews...';
    statusDiv.className = 'status';

    // Send message to content script to start scraping
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "downloadReviews" }, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
          statusDiv.className = 'status error';
          downloadBtn.disabled = false;
        } else if (response && response.success) {
          // Call downloadAsCSV function from content.js
          const { reviews, siteName } = response;
          chrome.tabs.sendMessage(tabs[0].id, { action: "downloadAsCSV", reviews: response.reviews, siteName }, function(downloadResponse) {
            if (downloadResponse && downloadResponse.success) {
              statusDiv.textContent = 'Success! ' + downloadResponse.count + ' reviews downloaded.';
              statusDiv.className = 'status success';
              downloadBtn.disabled = false;
            } else {
              statusDiv.textContent = 'Error: ' + (downloadResponse ? downloadResponse.error : 'Unknown error');
              statusDiv.className = 'status error';
              downloadBtn.disabled = false;
            }
          });
        } else {
          statusDiv.textContent = 'Error: ' + (response ? response.error : 'Unknown error');
          statusDiv.className = 'status error';
          downloadBtn.disabled = false;
        }
      });
    });
  });
});