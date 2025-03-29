// background.js - handles background tasks like downloads
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'downloadFile') {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: true
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        console.error('Error downloading file:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('File downloaded successfully. Download ID:', downloadId);
        sendResponse({ success: true });
      }
    });
    return true; // Keep the messaging channel open for async response
  }
});