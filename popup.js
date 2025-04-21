// popup.js - the code that runs in the popup
document.addEventListener('DOMContentLoaded', function() {
  const downloadBtn = document.getElementById('downloadBtn');
  const statusDiv = document.getElementById('status');

  // Check if we're on a supported site
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentUrl = tabs[0].url;

    // Basic sites
    const basicSites = ['amazon.com', 'yelp.com', 'etsy.com'];

    // Google domains
    const googleDomains = [
      'google.com',
      'google.co.uk',
      'google.co.in',
      'google.ca',
      'google.com.au',
      'google.de',
      'google.fr',
      'google.co.jp',
      'google.es',
      'google.it',
      'google.nl',
      'google.com.br',
      'google.com.mx',
      'google.ru'
    ];

    // Check if we're on a supported site
    const isBasicSite = basicSites.some(site => currentUrl.includes(site));
    const isGoogleSite = googleDomains.some(domain => currentUrl.includes(domain));
    const isSupportedSite = isBasicSite || isGoogleSite;

    if (!isSupportedSite) {
      downloadBtn.disabled = true;
      statusDiv.textContent = 'Please navigate to Amazon, Yelp, Etsy, or Google Maps/Business to use this extension.';
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
    // Add pagination controls to the UI
    const container = document.querySelector('.container');
    const paginationControls = document.createElement('div');
    paginationControls.className = 'pagination-controls';
    paginationControls.style.cssText = 'display: flex; justify-content: space-between; margin-top: 15px;';
    paginationControls.innerHTML = `
      <button id="prevPage" disabled>Previous Page</button>
      <span id="pageInfo">Page 1</span>
      <button id="nextPage">Next Page</button>
    `;
    container.appendChild(paginationControls);
  
    // Add pagination button handlers
    document.getElementById('prevPage').addEventListener('click', function() {
      // Code for previous page navigation
    });
    document.getElementById('nextPage').addEventListener('click', function() {
      // Code for next page navigation
    });
});