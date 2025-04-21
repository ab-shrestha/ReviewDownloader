/**
 * content.js - Review Downloader Extension
 *
 * This script runs on supported websites and handles review scraping.
 * It is injected into web pages via the Chrome extension system.
 */

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
      } else if (window.location.hostname.includes('google')) {
        scrapeGoogleReviews(sendResponse);
      } else {
        sendResponse({success: false, error: 'Unsupported website'});
      }
    } catch (error) {
      console.error("Error in message listener:", error);
      sendResponse({success: false, error: error.message || "An unknown error occurred"});
    }
    
    // Keep the messaging channel open for async response
    return true;
  } else if (request.action === "downloadAsCSV") {
    try {
      const downloadResponse = downloadAsCSV(request.reviews, request.siteName);
      sendResponse(downloadResponse);
    } catch (error) {
      console.error("Error in downloadAsCSV:", error);
      sendResponse({success: false, error: error.message || "Error creating CSV"});
    }
    return true; // Keep the messaging channel open for async response
  }
});

/**
 * Scrapes Amazon reviews from the current page
 * @param {function} sendResponse - Callback function to send results back to popup
 */
function scrapeAmazonReviews(sendResponse) {
  try {
    // Select all review elements on the page
    const reviewElements = document.querySelectorAll('[data-hook="review"]');
    const reviews = [];

    if (reviewElements.length === 0) {
      console.warn('No Amazon review elements found on this page');
      sendResponse({
        success: false,
        error: 'No reviews found on this page. Make sure you are on an Amazon product reviews page.'
      });
      return;
    }

    reviewElements.forEach((reviewElement) => {
      try {
        // Extract reviewer name with null checks
        let reviewerName = 'Unknown';
        const nameElement = reviewElement.querySelector('.a-profile-name');
        if (nameElement && nameElement.innerText) {
          reviewerName = nameElement.innerText.trim();
        }

        // Extract review title/heading with null checks
        let reviewTitle = 'No title';
        const titleElement = reviewElement.querySelector('[data-hook="review-title"] span');
        if (titleElement && titleElement.innerText) {
          reviewTitle = titleElement.innerText.trim();
        }

        // Extract review date with null checks
        let reviewDate = 'Unknown';
        const reviewDateElement = reviewElement.querySelector('[data-hook="review-date"]');
        if (reviewDateElement && reviewDateElement.innerText) {
          const reviewDateText = reviewDateElement.innerText.trim();
          reviewDate = extractDateFromText(reviewDateText);
        }

        // Extract star rating with null checks
        let starRating = null;
        const starRatingElement = reviewElement.querySelector('[data-hook="review-star-rating"] .a-icon-alt');
        if (starRatingElement && starRatingElement.innerText) {
          const starRatingText = starRatingElement.innerText.trim();
          if (starRatingText) {
            const ratingMatch = starRatingText.match(/^([\d.]+)/);
            starRating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
          }
        }

        // Extract review text with null checks
        let reviewText = 'No review text';
        const reviewTextElement = reviewElement.querySelector('[data-hook="review-body"] span');
        if (reviewTextElement && reviewTextElement.innerText) {
          reviewText = reviewTextElement.innerText.trim();
        }

        // Extract verified purchase with multiple approaches
        let isVerified = false;
        
        // Approach 1: Traditional data-hook attribute (original method)
        const verifiedElement = reviewElement.querySelector('[data-hook="avp-badge"]');
        if (verifiedElement) {
          isVerified = true;
        }
        
        // Approach 2: Look for text containing "Verified Purchase"
        if (!isVerified) {
          const verifiedTextElements = reviewElement.querySelectorAll('span, div, a');
          for (const element of verifiedTextElements) {
            if (element && element.innerText && element.innerText.trim().includes('Verified Purchase')) {
              isVerified = true;
              break;
            }
          }
        }
        
        // Approach 3: Check for verified purchase icon/badge classes
        if (!isVerified) {
          const verifiedBadge = reviewElement.querySelector('.a-size-mini.a-color-state');
          if (verifiedBadge && verifiedBadge.innerText.trim().includes('Verified')) {
            isVerified = true;
          }
        }
        
        // Approach 4: Check for the newer data-hook attributes Amazon might use
        if (!isVerified) {
          const newVerifiedElements = [
            reviewElement.querySelector('[data-hook="purchase-verified-badge"]'),
            reviewElement.querySelector('[data-hook="verified-purchase-badge"]')
          ];
          
          if (newVerifiedElements.some(el => el !== null)) {
            isVerified = true;
          }
        }

        // Validate all fields before adding to reviews array
        // Only add reviews that have at least a rating or review text
        if (starRating !== null || reviewText !== 'No review text') {
          reviews.push({
            reviewerName: reviewerName || 'Unknown',
            reviewTitle: reviewTitle || 'No title',
            reviewDate: reviewDate || 'Unknown',
            starRating: starRating,
            reviewText: reviewText || 'No review text',
            isVerified: isVerified
          });
        }
      } catch (reviewError) {
        console.warn('Error processing individual review:', reviewError);
        // Continue with other reviews even if one fails
      }
    });

    // Get pagination info for user feedback
    const paginationElement = document.querySelector('.a-pagination');
    let paginationInfo = null;

    if (paginationElement) {
      const currentPage = paginationElement.querySelector('.a-selected')?.innerText.trim() || '1';
      paginationInfo = {
        currentPage: parseInt(currentPage, 10),
        hasMorePages: !!paginationElement.querySelector('.a-last:not(.a-disabled)')
      };
    }

    // Check if we found any valid reviews
    if (reviews.length === 0) {
      sendResponse({
        success: false,
        error: 'Could not extract any valid reviews. Please try a different page.'
      });
      return;
    }

    // Send the extracted reviews back to the popup
    sendResponse({
      success: true,
      reviews,
      siteName: 'amazon',
      pagination: paginationInfo,
      pageUrl: window.location.href
    });
  } catch (error) {
    console.error('Error scraping Amazon reviews:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Extracts a standardized date from various date text formats
 * @param {string} dateText - The text containing a date
 * @returns {string} - Extracted date in a standardized format or original text if no date found
 */
function extractDateFromText(dateText) {
  if (!dateText) return 'Unknown';

  // Common patterns for dates in review sites
  const patterns = [
    /on\s+(\w+\s+\d{1,2},\s+\d{4})/, // "on January 1, 2023"
    /(\w+\s+\d{1,2},\s+\d{4})/, // "January 1, 2023"
    /(\d{1,2}\s+\w+\s+\d{4})/, // "1 January 2023"
    /(\d{2}\/\d{2}\/\d{4})/, // "01/01/2023"
    /(\d{4}-\d{2}-\d{2})/ // "2023-01-01"
  ];

  // Try each pattern until we find a match
  for (const pattern of patterns) {
    const match = dateText.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // If no pattern matches, return the original text
  return dateText;
}
// End of date extraction helper


function scrapeYelpReviews(sendResponse) {
  try {
    console.log('Starting Yelp review scraping...');
    const reviews = [];

    // Target the actual review container elements
    // The provided HTML shows reviews are in li.y-css-1sqelp2 elements within ul.list__09f24__ynIEd
    const reviewElements = document.querySelectorAll('ul.list__09f24__ynIEd > li.y-css-1sqelp2');
    console.log(`Found ${reviewElements.length} review elements`);

    if (reviewElements.length === 0) {
      // Fallback to more general selectors if specific ones fail
      const fallbackElements = document.querySelectorAll('[class*="review"] > [class*="comment"], [class*="review-content"]');
      console.log(`Found ${fallbackElements.length} fallback elements`);
      
      if (fallbackElements.length === 0) {
        sendResponse({
          success: false,
          error: 'Could not find any reviews on this page. Please make sure you are on a Yelp business page with reviews.'
        });
        return;
      }
    }

    // Find business name
    const businessName = extractBusinessName();
    console.log(`Detected business name: ${businessName}`);

    // Process each review element
    reviewElements.forEach((element, index) => {
      try {
        // Reviewer name - look for the bold name link in the user passport area
        let reviewerName = 'Unknown';
        const nameElement = element.querySelector('[data-font-weight="bold"] > a.y-css-1x1e1r2');
        if (nameElement) {
          reviewerName = nameElement.innerText.trim();
        }

        // Star rating - look for the rating div with aria-label containing "star rating"
        let starRating = null;
        const ratingElement = element.querySelector('div[aria-label*="star rating"]');
        if (ratingElement) {
          const ariaLabel = ratingElement.getAttribute('aria-label');
          const ratingMatch = ariaLabel.match(/(\d+)\s*star/i);
          if (ratingMatch) {
            starRating = parseInt(ratingMatch[1], 10);
          }
        }

        // Review date
        let reviewDate = 'Unknown';
        const dateElement = element.querySelector('.y-css-1vi7y4e');
        if (dateElement) {
          reviewDate = dateElement.innerText.trim();
        }

        // Review text
        let reviewText = 'No review text';
        const textElement = element.querySelector('.comment__09f24__D0cxf, p.y-css-1541nhh');
        if (textElement) {
          reviewText = textElement.innerText.trim();
        }

        // Only add if we have valid data
        if (reviewerName !== 'Unknown' || starRating !== null || reviewText !== 'No review text') {
          reviews.push({
            reviewerName,
            reviewDate,
            starRating,
            reviewText
          });
          console.log(`Successfully processed review ${index} by ${reviewerName}`);
        }
      } catch (reviewError) {
        console.warn(`Error processing Yelp review ${index}:`, reviewError);
      }
    });

    if (reviews.length === 0) {
      sendResponse({
        success: false,
        error: 'Could not extract any reviews. Please try on a different Yelp page.'
      });
      return;
    }

    console.log(`Successfully extracted ${reviews.length} reviews for ${businessName}`);
    sendResponse({
      success: true,
      reviews,
      siteName: 'yelp',
      businessName: businessName,
      pageUrl: window.location.href
    });
  } catch (error) {
    console.error('Error scraping Yelp reviews:', error);
    sendResponse({ success: false, error: error.message });
  }

  // Helper function to extract business name
  function extractBusinessName() {
    // Try multiple approaches to find the business name
    const businessElement = document.querySelector('h1[class*="businessName"], .biz-page-title, [data-testid="business-title"]');
    if (businessElement) {
      return businessElement.innerText.trim();
    }
    
    // If all else fails, use the page title
    const titleMatch = document.title.match(/^([^-|]+)/);
    return titleMatch ? titleMatch[1].trim() : 'Yelp Business';
  }
}
// End of Yelp review scraper

/**
 * Scrapes Google reviews from the current page (Google Maps or Google Business)
 * @param {function} sendResponse - Callback function to send results back to popup
 */
function scrapeGoogleReviews(sendResponse) {
  try {
    console.log('Starting Google review scraping...');

    // Debug the page structure
    console.log('Page title:', document.title);
    console.log('URL:', window.location.href);

    // Create a container for reviews
    const reviews = [];

    // Find the business name
    const businessName = findBusinessName();
    console.log(`Detected business name: ${businessName}`);

    // Find review elements - Google uses different structures for Maps vs Business listings
    let reviewElements = [];

    // Try multiple selectors to find review containers
    const selectors = [
      // Google Local Services selectors (new format)
      'div.bwb7ce', // Local services review container
      'div[jsname="ShBeI"]', // Reviews with jsname attribute
      'div[data-id^="ChZ"]', // Reviews with data-id starting with ChZ

      // Google Maps selectors
      'div.jftiEf', // Main review container in Google Maps
      'div[data-review-id]', // Reviews with ID attributes
      'div[class*="section-review"]', // Review sections

      // Google Business selectors
      '.review-full', // Full review containers
      '.gws-localreviews__google-review', // Google review containers

      // General selectors that might work across different Google properties
      '[data-hveid]', // Elements with data-hveid attribute
      'div[jscontroller][jsdata]', // Elements with jscontroller and jsdata attributes
      'div[jscontroller] > div[jsaction]' // Elements with JS controllers
    ];

    // Try each selector
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} potential review elements using selector: ${selector}`);
        reviewElements = Array.from(elements);
        break;
      }
    }

    // If we still don't have any reviews, try a more general approach
    if (reviewElements.length === 0) {
      // Look for elements with star ratings
      const starContainers = document.querySelectorAll('[aria-label*="stars"], [aria-label*="star rating"]');
      console.log(`Found ${starContainers.length} elements with star ratings`);

      // For each star element, walk up to find potential review containers
      starContainers.forEach(starEl => {
        let parent = starEl.parentElement;
        for (let i = 0; i < 5; i++) { // Walk up to 5 levels
          if (!parent) break;

          // If this element has substantial text, it might be a review
          if (parent.innerText && parent.innerText.length > 100) {
            reviewElements.push(parent);
            break;
          }
          parent = parent.parentElement;
        }
      });

      console.log(`Found ${reviewElements.length} potential review containers by walking up from star elements`);
    }

    // Process each review element
    reviewElements.forEach((element, index) => {
      try {
        // Extract the review data
        const reviewData = extractReviewData(element, index);

        // Only add if we got valid data
        if (reviewData && reviewData.starRating !== null) {
          reviews.push(reviewData);
          console.log(`Successfully processed review ${index} by ${reviewData.reviewerName}`);
        }
      } catch (reviewError) {
        console.warn(`Error processing Google review ${index}:`, reviewError);
      }
    });

    // If we couldn't find any reviews, try an emergency approach
    if (reviews.length === 0) {
      console.log('No reviews found with standard methods, trying emergency approach...');

      // Look for any elements that might contain reviews
      const potentialElements = document.querySelectorAll('div, span');

      // Filter to elements that have star mentions and substantial text
      potentialElements.forEach((element, index) => {
        const text = element.innerText;
        if (text && text.length > 100 && (text.includes('star') || text.includes('★'))) {
          try {
            // Create an emergency review
            const reviewText = text.substring(0, 500); // Limit length

            // Try to extract a star rating
            let starRating = null;
            const ratingMatch = text.match(/(\d+(\.\d+)?)\s*stars?/i) || text.match(/(\d+(\.\d+)?)\s*★/);
            if (ratingMatch) {
              starRating = parseFloat(ratingMatch[1]);
            } else {
              starRating = 4; // Default if we can't find one
            }

            // Add the emergency review
            reviews.push({
              reviewerName: `Google User ${index + 1}`,
              reviewDate: 'Recent',
              starRating: starRating,
              reviewText: reviewText,
              isEmergencyExtraction: true
            });

            console.log(`Created emergency review ${index} with rating ${starRating}`);
          } catch (error) {
            console.warn(`Error creating emergency review ${index}:`, error);
          }
        }
      });
    }

    // If we still don't have any reviews, return an error
    if (reviews.length === 0) {
      console.warn('No Google reviews could be extracted');
      sendResponse({
        success: false,
        error: 'Could not extract any Google reviews. Please make sure you are on a Google Maps or Google Business page with reviews.'
      });
      return;
    }

    console.log(`Successfully extracted ${reviews.length} Google reviews for ${businessName}`);

    sendResponse({
      success: true,
      reviews,
      siteName: 'google',
      businessName: businessName,
      pageUrl: window.location.href
    });
  } catch (error) {
    console.error('Error scraping Google reviews:', error);
    sendResponse({ success: false, error: error.message });
  }

  // Helper function to find the business name
  function findBusinessName() {
    // Try multiple approaches to find the business name
    const selectors = [
      'h1.fontHeadlineLarge', // Google Maps main heading
      'h1[class*="header"]', // Header classes
      'div[role="main"] h1', // Main content heading
      'h1', // Any h1 as a fallback
      'title' // Page title as a last resort
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.innerText.trim()) {
        return element.innerText.trim();
      }
    }

    // If all else fails, use the page title
    return document.title.replace(' - Google Maps', '').replace(' - Google Search', '').trim();
  }

  // Helper function to extract review data from an element
  function extractReviewData(element, index) {
    // Extract reviewer name
    let reviewerName = 'Unknown';

    // Try to find the reviewer name in various elements
    const nameSelectors = [
      // Google Local Services selectors
      '.Vpc5Fe', // Local services reviewer name class
      '.yC3ZMb div div', // Name inside profile link

      // Google Maps selectors
      '.d4r55', // Google Maps reviewer name class

      // General selectors
      '[class*="author"]', // Author classes
      'a[href*="contrib"]', // Contributor links
      'a[href*="reviews"]', // Review links
      'span[class*="profile"]', // Profile elements
      'div[class*="name"]', // Name elements
      'span[class*="name"]' // Name spans
    ];

    for (const selector of nameSelectors) {
      const nameElement = element.querySelector(selector);
      if (nameElement && nameElement.innerText.trim()) {
        reviewerName = nameElement.innerText.trim();
        break;
      }
    }

    // If we still don't have a name, generate one
    if (reviewerName === 'Unknown') {
      reviewerName = `Google User ${index + 1}`;
    }

    // Extract star rating
    let starRating = null;

    // Try to find the star rating in aria-labels
    const ratingElements = element.querySelectorAll('[aria-label*="stars"], [aria-label*="star rating"], [aria-label*="Rated"]');
    for (const ratingEl of ratingElements) {
      const ariaLabel = ratingEl.getAttribute('aria-label');
      // Match patterns like "Rated 5.0 out of 5" or "4 stars" or "3.5 star rating"
      const ratingMatch = ariaLabel.match(/Rated\s+(\d+(\.\d+)?)\s*out\s*of\s*\d+/i) ||
                          ariaLabel.match(/(\d+(\.\d+)?)\s*stars?/i);
      if (ratingMatch) {
        starRating = parseFloat(ratingMatch[1]);
        break;
      }
    }

    // Special case for Google Local Services which uses SVG stars
    if (starRating === null) {
      // Count the number of filled star SVGs
      const starSVGs = element.querySelectorAll('.dHX2k svg, .ePMStd');
      if (starSVGs.length > 0 && starSVGs.length <= 5) {
        starRating = starSVGs.length;
      }
    }

    // If we couldn't find a rating in aria-labels, try other methods
    if (starRating === null) {
      // Look for star images and count them
      const starImages = element.querySelectorAll('img[src*="star"], img[alt*="star"]');
      if (starImages.length > 0 && starImages.length <= 5) {
        starRating = starImages.length;
      }

      // Look for star symbols (★) in the text
      if (starRating === null) {
        const text = element.innerText;
        const starMatch = text.match(/(\d+(\.\d+)?)\s*★/);
        if (starMatch) {
          starRating = parseFloat(starMatch[1]);
        }
      }

      // Look for "X stars" in the text
      if (starRating === null) {
        const text = element.innerText;
        const starTextMatch = text.match(/(\d+(\.\d+)?)\s*stars?/i);
        if (starTextMatch) {
          starRating = parseFloat(starTextMatch[1]);
        }
      }
    }

    // Extract review date
    let reviewDate = 'Unknown';

    // Try to find date elements
    const dateSelectors = [
      '.y3Ibjb', // Google Local Services date class
      '.rsqaWe', // Google Maps date class
      '[class*="date"]', // Date classes
      'span.dehysf', // Another Google date class
      'span[class*="time"]' // Time-related spans
    ];

    for (const selector of dateSelectors) {
      const dateElement = element.querySelector(selector);
      if (dateElement && dateElement.innerText.trim()) {
        reviewDate = dateElement.innerText.trim();
        break;
      }
    }

    // If we still don't have a date, try to extract it from the text
    if (reviewDate === 'Unknown') {
      const text = element.innerText;
      const datePatterns = [
        /(\d{1,2}\/\d{1,2}\/\d{2,4})/,                     // MM/DD/YYYY
        /(\w+\s+\d{1,2},\s+\d{4})/,                        // Month DD, YYYY
        /(\d{1,2}\s+\w+\s+\d{4})/,                         // DD Month YYYY
        /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,               // DD-MM-YYYY or DD/MM/YYYY
        /(\d+\s+days?\s+ago)/,                             // X days ago
        /(\d+\s+weeks?\s+ago)/,                            // X weeks ago
        /(\d+\s+months?\s+ago)/,                           // X months ago
        /(\w+\s+ago)/                                       // time ago
      ];

      for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
          reviewDate = match[1];
          break;
        }
      }
    }

    // Extract review text
    let reviewText = 'No review text';

    // Try to find the review text in various elements
    const textSelectors = [
      '.OA1nbd', // Google Local Services review text class
      '.wiI7pd', // Google Maps review text class
      '[class*="review-text"]', // Review text classes
      '[class*="content"]', // Content classes
      '.review-full-text', // Full review text
      'div[jscontroller="lgNNHf"]' // Another review text container
    ];

    for (const selector of textSelectors) {
      const textElement = element.querySelector(selector);
      if (textElement && textElement.innerText.trim()) {
        reviewText = textElement.innerText.trim();
        break;
      }
    }

    // If we still don't have review text, use the element's text
    if (reviewText === 'No review text') {
      // Filter out the reviewer name and date to get just the review text
      let fullText = element.innerText;
      if (reviewerName !== 'Unknown') {
        fullText = fullText.replace(reviewerName, '');
      }
      if (reviewDate !== 'Unknown') {
        fullText = fullText.replace(reviewDate, '');
      }

      // Clean up the text
      reviewText = fullText.trim();

      // Limit the length
      if (reviewText.length > 1000) {
        reviewText = reviewText.substring(0, 1000) + '...';
      }
    }

    // Check for additional features
    const hasPhotos = !!element.querySelector('img:not([alt*="star"]):not([alt*="profile"])');
    const isLocalGuide = element.innerText.includes('Local Guide') ||
                     Array.from(element.querySelectorAll('.GSM50')).some(el => el.innerText.includes('Local Guide'));

    return {
      reviewerName,
      reviewDate,
      starRating,
      reviewText,
      hasPhotos,
      isLocalGuide
    };
  }
}
// End of Google review scraper

/**
 * Scrapes Etsy reviews from the current page
 * @param {function} sendResponse - Callback function to send results back to popup
 */
function scrapeEtsyReviews(sendResponse) {
  try {
    const reviewElements = document.querySelectorAll('.review-card, .wt-grid__item-xs-12');
    const reviews = [];

    if (reviewElements.length === 0) {
      console.warn('No Etsy review elements found on this page');
      sendResponse({
        success: false,
        error: 'No reviews found on this page. Make sure you are on an Etsy product reviews page.'
      });
      return;
    }

    reviewElements.forEach((reviewElement) => {
      try {
        // Skip elements that don't look like review cards
        if (!reviewElement.querySelector('[data-stars-svg-container], .stars-svg')) {
          return;
        }

        // Extract review text - try multiple possible selectors
        const reviewText =
          reviewElement.querySelector('.wt-content-toggle--truncated-inline-multi .wt-text-truncate--multi-line')?.innerText.trim() ||
          reviewElement.querySelector('.review-text')?.innerText.trim() ||
          'No review text';

        // Extract star rating
        const starRatingElement =
          reviewElement.querySelector('[data-stars-svg-container] input[name="rating"]') ||
          reviewElement.querySelector('.stars-svg');

        let starRating = null;
        if (starRatingElement) {
          if (starRatingElement.hasAttribute('value')) {
            starRating = parseFloat(starRatingElement.getAttribute('value'));
          } else if (starRatingElement.hasAttribute('data-rating')) {
            starRating = parseFloat(starRatingElement.getAttribute('data-rating'));
          }
        }

        // Extract reviewer name - specifically looking for the link with the reviewer's name
        const reviewerNameElement =
          reviewElement.querySelector('.wt-text-caption .wt-text-link[href*="/people/"]') ||
          reviewElement.querySelector('.shop2-review-attribution a');
        const reviewerName = reviewerNameElement ? reviewerNameElement.innerText.trim() : 'Unknown';

        // Extract the review date
        let reviewDate = 'Unknown';

        // Try multiple approaches to find the date
        const bottomSection =
          reviewElement.querySelector('.wt-display-flex-xs.wt-align-items-center.wt-pt-xs-1') ||
          reviewElement.querySelector('.shop2-review-details-date');

        if (bottomSection) {
          const dateText = bottomSection.textContent.trim();
          // Extract the date format Mar DD, YYYY or similar patterns
          const datePattern = /([A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/;
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
      } catch (reviewError) {
        console.warn('Error processing individual Etsy review:', reviewError);
        // Continue with other reviews even if one fails
      }
    });

    if (reviews.length === 0) {
      sendResponse({ success: false, error: 'No valid reviews found on this page' });
    } else {
      // Get product name for better CSV naming
      const productName = document.querySelector('h1')?.innerText.trim() || 'EtsyProduct';

      sendResponse({
        success: true,
        reviews,
        siteName: 'etsy',
        productName: productName,
        pageUrl: window.location.href
      });
    }
  } catch (error) {
    console.error('Error scraping Etsy reviews:', error);
    sendResponse({ success: false, error: error.message });
  }
}
// End of Etsy review scraper

/**
 * Converts reviews to CSV format and triggers download
 * @param {Array} reviews - Array of review objects to convert
 * @param {string} siteName - Name of the site (amazon, yelp, etsy)
 * @returns {Object} Success status and count of reviews
 */

function downloadAsCSV(reviews, siteName) {
  if (!reviews || reviews.length === 0) {
    return {success: false, error: 'No reviews found'};
  }

  try {
    // Create CSV header based on first review's properties
    const headers = Object.keys(reviews[0]);
    let csv = headers.join(',') + '\n';

    // Send initial progress message
    chrome.runtime.sendMessage({ action: 'updateProgress', progress: 0 });

    // Calculate update frequency based on review count
    const progressUpdate = Math.max(1, Math.floor(reviews.length / 10));

    // Add each review as a row
    reviews.forEach((review, index) => {
      // Update progress periodically
      if (index % progressUpdate === 0) {
        chrome.runtime.sendMessage({ 
          action: 'updateProgress', 
          progress: Math.floor((index / reviews.length) * 100) 
        });
      }
      
      const row = headers.map(header => {
        // Escape quotes and format cell correctly for CSV
        let cell = review[header] === null ? '' : review[header].toString();

        // Fix character encoding issues by replacing common problematic characters
        cell = cell
          .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
          .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
          .replace(/\u2026/g, "...") // Ellipsis
          .replace(/\u2013/g, "-") // En dash
          .replace(/\u2014/g, "--") // Em dash
          .replace(/\u00A0/g, " ") // Non-breaking space
          .replace(/[\r\n]+/g, " "); // Replace line breaks with spaces

        // Properly escape for CSV format
        return `"${cell.replace(/"/g, '""')}"`;
      });
      csv += row.join(',') + '\n';
    });

    // Send complete progress
    chrome.runtime.sendMessage({ action: 'updateProgress', progress: 100 });

    // Use UTF-8 BOM to ensure Excel and other applications recognize the encoding
    const BOM = "\uFEFF";
    const csvWithBOM = BOM + csv;

    // Create a Blob with UTF-8 encoding specified
    const blob = new Blob([csvWithBOM], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);

    // Create a more descriptive filename
    let productName = '';

    // Try to get a meaningful product/business name
    if (siteName === 'amazon') {
      productName = document.querySelector('#productTitle')?.innerText.trim() ||
                   document.title.replace(/Amazon.com\s*:\s*/, '').trim();
    } else if (siteName === 'yelp') {
      productName = document.querySelector('h1')?.innerText.trim() || 'YelpBusiness';
    } else if (siteName === 'etsy') {
      productName = document.querySelector('h1')?.innerText.trim() || 'EtsyProduct';
    } else if (siteName === 'google') {
      productName = document.querySelector('h1.fontHeadlineLarge')?.innerText.trim() ||
                   document.title.replace(/ - Google Maps| - Google Search/g, '').trim() || 'GoogleBusiness';
    } else {
      productName = document.title;
    }

    // Clean up the product name for use in a filename
    productName = productName.replace(/[^\w\s]/gi, '').trim().substring(0, 30);

    // Add timestamp for uniqueness
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reviewCount = reviews.length.toString().padStart(2, '0');
    const filename = `${siteName}_${reviewCount}reviews_${productName}_${timestamp}.csv`;

    // Send message to background script to handle the download
    chrome.runtime.sendMessage({
      action: 'downloadFile',
      url: url,
      filename: filename
    }, function(response) {
      // Clean up the blob URL after download is initiated
      if (response && response.success) {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });

    return {
      success: true,
      count: reviews.length,
      message: `Successfully prepared ${reviews.length} reviews for download`
    };
  } catch (error) {
    console.error('Error creating CSV file:', error);
    return {
      success: false,
      error: `Failed to create CSV: ${error.message}`
    };
  }
}