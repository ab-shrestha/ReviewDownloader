// content.js - runs on the target websites and does the scraping
// This will be injected into supported websites
console.log('Review Downloader extension loaded');

// Listen for message from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "downloadReviews") {
    try {
      // Determine which website we're on and use appropriate scraper
      if (window.location.hostname.includes('amazon')) {
        scrapeAmazonReviews(sendResponse);
      } else if (window.location.hostname.includes('yelp')) {
        scrapeYelpReviews(sendResponse);
      } else if (window.location.hostname.includes('etsy')) {
        scrapeEtsyReviews(sendResponse);
      } else {
        sendResponse({success: false, error: 'Unsupported website'});
      }
    } catch (error) {
      sendResponse({success: false, error: error.message});
    }
    
    // Keep the messaging channel open for async response
    return true;
  }else if (request.action === "downloadAsCSV") {
    const downloadResponse = downloadAsCSV(request.reviews, request.siteName);
    sendResponse(downloadResponse);
    return true; // Keep the messaging channel open for async response
  }
});

// Placeholder functions for each site (to be implemented)
function scrapeAmazonReviews(sendResponse) {
  try {
    // Select all review elements on the page
    const reviewElements = document.querySelectorAll('[data-hook="review"]');
    const reviews = [];

    reviewElements.forEach((reviewElement) => {
      // Extract reviewer name
      const reviewerName = reviewElement.querySelector('.a-profile-name')?.innerText.trim() || 'Unknown';

      // Extract review date
      const reviewDateText = reviewElement.querySelector('[data-hook="review-date"]')?.innerText.trim() || 'Unknown';
      const reviewDate = extractDateFromText(reviewDateText);

      // Extract star rating
      const starRatingText = reviewElement.querySelector('[data-hook="review-star-rating"] .a-icon-alt')?.innerText.trim();
      const starRating = starRatingText ? parseFloat(starRatingText.split(' ')[0]) : null;

      // Extract review text
      const reviewText = reviewElement.querySelector('[data-hook="review-body"] span')?.innerText.trim() || 'No review text';

      // Add the extracted data to the reviews array
      reviews.push({
        reviewerName,
        reviewDate,
        starRating,
        reviewText,
      });
    });

    // Send the extracted reviews back to the popup
    sendResponse({ success: true, reviews, siteName: 'amazon' });
  } catch (error) {
    console.error('Error scraping Amazon reviews:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Helper function to extract date from the review date text
function extractDateFromText(dateText) {
  const regex = /on\s+(\w+\s+\d+,\s+\d+)/;
  const match = dateText.match(regex);
  return match ? match[1] : dateText;
}
//end of amazon review scraper

function scrapeYelpReviews(sendResponse) {
  try {
    const reviewElements = document.querySelectorAll('.y-css-mhg9c5');
    const reviews = [];

    reviewElements.forEach((reviewElement) => {
      const reviewerNameElement = reviewElement.querySelector('.user-display-name');
      const reviewerName = reviewerNameElement ? reviewerNameElement.innerText.trim() : 'Unknown';

      const reviewDateElement = reviewElement.querySelector('.y-css-1vi7y4e');
      const reviewDate = reviewDateElement ? reviewDateElement.innerText.trim() : 'Unknown';

      const starRatingElement = reviewElement.querySelector('.y-css-dnttlc');
      const starRating = starRatingElement ? parseFloat(starRatingElement.getAttribute('aria-label').split(' ')[0]) : null;

      const reviewTextElement = reviewElement.querySelector('.raw__09f24__T4Ezm');
      const reviewText = reviewTextElement ? reviewTextElement.innerText.trim() : 'No review text';

      reviews.push({
        reviewerName,
        reviewDate,
        starRating,
        reviewText,
      });
    });

    sendResponse({ success: true, reviews, siteName: 'yelp' });
  } catch (error) {
    console.error('Error scraping Yelp reviews:', error);
    sendResponse({ success: false, error: error.message });
  }
}
//end of yelp review scraper

function scrapeEtsyReviews(sendResponse) {
  try {
    const reviewElements = document.querySelectorAll('.review-card');
    const reviews = [];

    reviewElements.forEach((reviewElement) => {
      const reviewText = reviewElement.querySelector('.wt-content-toggle--truncated-inline-multi .wt-text-truncate--multi-line')?.innerText.trim() || 'No review text';
      const starRatingElement = reviewElement.querySelector('[data-stars-svg-container] input[name="rating"]');
      const starRating = starRatingElement ? parseFloat(starRatingElement.value) : null;

      // Extract reviewer name - specifically looking for the link with the reviewer's name
      const reviewerNameElement = reviewElement.querySelector('.wt-text-caption .wt-text-link[href*="/people/"]');
      const reviewerName = reviewerNameElement ? reviewerNameElement.innerText.trim() : 'Unknown';

      // Extract the review date from the bottom section that contains reviewer name and date
      // This is specifically the section at the bottom after any seller responses
      let reviewDate = 'Unknown';
      
      // Look for the bottom section which has both reviewer name and date
      const bottomSection = reviewElement.querySelector('.wt-display-flex-xs.wt-align-items-center.wt-pt-xs-1');
      
      if (bottomSection) {
        const dateText = bottomSection.textContent.trim();
        // Extract the date format Mar DD, YYYY
        const datePattern = /([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/;
        const match = dateText.match(datePattern);
        if (match) {
          reviewDate = match[0];
        }
      }

      reviews.push({
        reviewerName,
        reviewDate,
        starRating,
        reviewText,
      });
    });

    if (reviews.length === 0) {
      sendResponse({ success: false, error: 'No reviews found' });
    } else {
      sendResponse({ success: true, reviews, siteName: 'etsy' });
    }
  } catch (error) {
    console.error('Error scraping Etsy reviews:', error);
    sendResponse({ success: false, error: error.message });
  }
}
//end of etsy review scraper

// Helper function to convert reviews to CSV and trigger download
function downloadAsCSV(reviews, siteName) {
  if (!reviews || reviews.length === 0) {
    return {success: false, error: 'No reviews found'};
  }
  
  // Create CSV header based on first review's properties
  const headers = Object.keys(reviews[0]);
  let csv = headers.join(',') + '\n';
  
  // Add each review as a row
  reviews.forEach(review => {
    const row = headers.map(header => {
      // Escape quotes and format cell correctly for CSV
      let cell = review[header] === null ? '' : review[header].toString();
      
      // Fix character encoding issues by replacing common problematic characters
      // This handles apostrophes, quotes, and other special characters
      cell = cell
        .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
        .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
        .replace(/\u2026/g, "...") // Ellipsis
        .replace(/\u2013/g, "-") // En dash
        .replace(/\u2014/g, "--") // Em dash
        .replace(/\u00A0/g, " "); // Non-breaking space
      
      return `"${cell.replace(/"/g, '""')}"`;
    });
    csv += row.join(',') + '\n';
  });
  
  // Use UTF-8 BOM to ensure Excel and other applications recognize the encoding
  const BOM = "\uFEFF";
  const csvWithBOM = BOM + csv;
  
  // Create a Blob with UTF-8 encoding specified
  const blob = new Blob([csvWithBOM], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const productName = document.title.replace(/[^\w\s]/gi, '').trim().substring(0, 30);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${siteName}_reviews_${productName}_${timestamp}.csv`;
  
  chrome.runtime.sendMessage({
    action: 'downloadFile',
    url: url,
    filename: filename
  });
  
  return {success: true, count: reviews.length};
}