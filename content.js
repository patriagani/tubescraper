// Cache of video data. Key: videoId. Value: { title, views, uploadTime, exactUploadTime, isoUploadTime, videoUrl, thumbnailUrl }
const videoCache = {};

// Extract metadata from a YouTube video card element
function extractVideoMetadata(videoElement) {
  try {
    const titleLink = videoElement.querySelector(
      'a.ytLockupMetadataViewModelTitle, a#video-title, a#video-title-link, #video-title'
    );
    if (!titleLink) return null;

    const title = titleLink.textContent.trim() || 'Unknown Title';
    const href = titleLink.getAttribute('href') || '';

    // Parse video ID
    let videoId = '';
    const urlMatch = href.match(/[?&]v=([^&#]+)/);
    if (urlMatch) {
      videoId = urlMatch[1];
    } else {
      const shortsMatch = href.match(/\/shorts\/([^?&#]+)/);
      if (shortsMatch) {
        videoId = shortsMatch[1];
      }
    }

    if (!videoId) return null;

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

    // Views and Upload Time
    let views = 'Unknown Views';
    let uploadTime = 'Unknown Upload Time';
    let relativeTimeElement = null;

    // Check new desktop layout metadata model
    const metaSpans = videoElement.querySelectorAll('span.ytContentMetadataViewModelMetadataText');
    if (metaSpans.length > 0) {
      metaSpans.forEach(span => {
        const text = span.textContent.trim();
        if (text.includes('views') || text.includes('ditonton') || text.includes('watching') || text.includes('penonton')) {
          views = text;
        } else if (text.includes('ago') || text.includes('lalu') || text.includes('streamed') || text.includes('disiarkan') || /^\d+ (second|minute|hour|day|week|month|year|detik|menit|jam|hari|minggu|bulan|tahun)s?/.test(text)) {
          uploadTime = text;
          relativeTimeElement = span;
        }
      });
    }

    // Check classic desktop metadata line
    if (views === 'Unknown Views' || uploadTime === 'Unknown Upload Time') {
      const classicSpans = videoElement.querySelectorAll('#metadata-line span');
      if (classicSpans.length >= 2) {
        views = classicSpans[0].textContent.trim();
        uploadTime = classicSpans[1].textContent.trim();
        relativeTimeElement = classicSpans[1];
      } else if (classicSpans.length === 1) {
        const text = classicSpans[0].textContent.trim();
        if (text.includes('views') || text.includes('ditonton')) {
          views = text;
        } else {
          uploadTime = text;
          relativeTimeElement = classicSpans[0];
        }
      }
    }

    return {
      title,
      views,
      uploadTime,
      videoUrl,
      thumbnailUrl,
      videoId,
      relativeTimeElement
    };
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return null;
  }
}

// Fetch the exact upload date for a video ID from YouTube watch page HTML
async function fetchExactDate(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();

    const match = html.match(/<meta itemprop="uploadDate" content="([^"]+)"/) || 
                  html.match(/<meta itemprop="datePublished" content="([^"]+)"/);

    if (match && match[1]) {
      const isoDate = match[1];
      const dateObj = new Date(isoDate);
      
      const formatted = dateObj.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return { exactUploadTime: formatted, isoUploadTime: isoDate };
    }
  } catch (err) {
    console.error(`Error fetching detail for video ${videoId}:`, err);
  }
  return { exactUploadTime: 'N/A', isoUploadTime: '' };
}

// Update the relative time text element on YouTube UI
function updateUiElement(el, exactTime, originalRelative) {
  if (!el || exactTime === 'N/A' || exactTime === 'Error') return;
  
  if (el.getAttribute('data-exact-applied') === 'true') {
    return;
  }
  
  el.title = `Original: ${originalRelative}`;
  el.textContent = exactTime;
  el.style.color = '#3ea6ff';
  el.style.fontWeight = '500';
  el.setAttribute('data-exact-applied', 'true');
}

// Check if an element is currently active and visible in the SPA DOM
function isElementActive(el) {
  try {
    // 1. Must be visible (not display: none / hidden)
    if (el.offsetWidth === 0 && el.offsetHeight === 0) {
      return false;
    }
    // 2. Must not be inside a hidden container (like hidden parent SPA pages)
    if (el.closest('[hidden]')) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

// Scrape all video cards on page (called when popup triggers CSV download)
async function scrapeAllPageVideos(sendResponse) {
  const cardSelectors = [
    'yt-lockup-view-model',
    'ytd-rich-grid-media',
    'ytd-grid-video-renderer',
    'ytd-video-renderer'
  ];

  const videoElements = Array.from(document.querySelectorAll(cardSelectors.join(', '))).filter(isElementActive);
  const results = [];
  const toFetch = [];

  videoElements.forEach(videoElement => {
    const meta = extractVideoMetadata(videoElement);
    if (!meta) return;

    const { videoId, title, views, uploadTime, videoUrl, thumbnailUrl, relativeTimeElement } = meta;

    if (videoCache[videoId]) {
      results.push({
        videoId,
        title,
        views,
        uploadTime,
        exactUploadTime: videoCache[videoId].exactUploadTime,
        isoUploadTime: videoCache[videoId].isoUploadTime,
        videoUrl,
        thumbnailUrl,
        relativeTimeElement
      });
      // Apply UI text replacement if this element was redrawn by YouTube's SPA
      if (relativeTimeElement) {
        updateUiElement(relativeTimeElement, videoCache[videoId].exactUploadTime, uploadTime);
      }
    } else {
      const placeholder = {
        videoId,
        title,
        views,
        uploadTime,
        exactUploadTime: 'N/A',
        isoUploadTime: '',
        videoUrl,
        thumbnailUrl,
        relativeTimeElement
      };
      results.push(placeholder);
      toFetch.push(placeholder);
    }
  });

  if (toFetch.length === 0) {
    sendResponse({ success: true, videos: cleanVideosList(results) });
    return;
  }

  // Fetch remaining exact upload dates in parallel workers
  const concurrencyLimit = 5;
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < toFetch.length) {
      const currentIdx = currentIndex;
      currentIndex++;

      const video = toFetch[currentIdx];
      
      try {
        // Send progress message back to popup
        chrome.runtime.sendMessage({
          action: 'progress',
          current: currentIdx + 1,
          total: toFetch.length,
          status: `Scraping: "${video.title.substring(0, 20)}..."`
        });

        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

        const dateData = await fetchExactDate(video.videoId);
        
        videoCache[video.videoId] = {
          title: video.title,
          views: video.views,
          uploadTime: video.uploadTime,
          exactUploadTime: dateData.exactUploadTime,
          isoUploadTime: dateData.isoUploadTime,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl
        };

        video.exactUploadTime = dateData.exactUploadTime;
        video.isoUploadTime = dateData.isoUploadTime;

        if (video.relativeTimeElement) {
          updateUiElement(video.relativeTimeElement, dateData.exactUploadTime, video.uploadTime);
        }

      } catch (err) {
        console.error('Error fetching exact date during download scrape:', err);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrencyLimit, toFetch.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  sendResponse({ success: true, videos: cleanVideosList(results) });
}

// Check exact upload dates for all active page elements without downloading a CSV
async function checkExactDates(sendResponse) {
  const cardSelectors = [
    'yt-lockup-view-model',
    'ytd-rich-grid-media',
    'ytd-grid-video-renderer',
    'ytd-video-renderer'
  ];

  const videoElements = Array.from(document.querySelectorAll(cardSelectors.join(', '))).filter(isElementActive);
  const toFetch = [];

  videoElements.forEach(videoElement => {
    const meta = extractVideoMetadata(videoElement);
    if (!meta) return;

    const { videoId, title, views, uploadTime, videoUrl, thumbnailUrl, relativeTimeElement } = meta;

    if (!videoCache[videoId]) {
      toFetch.push({
        videoId,
        title,
        views,
        uploadTime,
        videoUrl,
        thumbnailUrl,
        relativeTimeElement
      });
    } else {
      // If cached, make sure the text replacement is applied to the UI element (in case of re-rendering)
      if (relativeTimeElement) {
        updateUiElement(relativeTimeElement, videoCache[videoId].exactUploadTime, uploadTime);
      }
    }
  });

  if (toFetch.length === 0) {
    sendResponse({ success: true, count: videoElements.length });
    return;
  }

  const concurrencyLimit = 5;
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < toFetch.length) {
      const currentIdx = currentIndex;
      currentIndex++;

      const video = toFetch[currentIdx];
      
      try {
        // Send progress message back to popup
        chrome.runtime.sendMessage({
          action: 'progress',
          current: currentIdx + 1,
          total: toFetch.length,
          status: `Checking: "${video.title.substring(0, 20)}..."`
        });

        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

        const dateData = await fetchExactDate(video.videoId);
        
        videoCache[video.videoId] = {
          title: video.title,
          views: video.views,
          uploadTime: video.uploadTime,
          exactUploadTime: dateData.exactUploadTime,
          isoUploadTime: dateData.isoUploadTime,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl
        };

        if (video.relativeTimeElement) {
          updateUiElement(video.relativeTimeElement, dateData.exactUploadTime, video.uploadTime);
        }

      } catch (err) {
        console.error('Error fetching exact date during manual check:', err);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrencyLimit, toFetch.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  sendResponse({ success: true, count: videoElements.length });
}

function cleanVideosList(videos) {
  return videos.map(v => ({
    title: v.title,
    views: v.views,
    uploadTime: v.uploadTime,
    exactUploadTime: v.exactUploadTime,
    videoUrl: v.videoUrl,
    thumbnailUrl: v.thumbnailUrl,
    isoUploadTime: v.isoUploadTime
  }));
}

// Handle messages from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeAndDownload') {
    scrapeAllPageVideos(sendResponse);
    return true; // Keep response channel open for async scrape
  } else if (request.action === 'checkExactDates') {
    checkExactDates(sendResponse);
    return true; // Keep response channel open
  }
});
