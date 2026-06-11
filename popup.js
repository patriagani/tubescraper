document.getElementById('download').addEventListener('click', async () => {
  const downloadBtn = document.getElementById('download');
  const progressSection = document.getElementById('progressSection');
  const statsSection = document.getElementById('statsSection');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercent = document.getElementById('progressPercent');
  const statusText = document.getElementById('statusText');

  // UI Setup
  downloadBtn.disabled = true;
  progressSection.style.display = 'flex';
  statsSection.style.display = 'none';
  progressBarFill.style.width = '0%';
  progressPercent.textContent = '0%';
  statusText.textContent = 'Scanning channel page...';

  const startTime = Date.now();

  // Progress message handler
  const progressListener = (message) => {
    if (message.action === 'progress') {
      const current = message.current;
      const total = message.total;
      const pct = Math.round((current / total) * 100);
      progressBarFill.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
      statusText.textContent = message.status || `Processing: ${current}/${total}`;
    }
  };
  
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      alert('Please use this extension on a YouTube page.');
      resetUI();
      chrome.runtime.onMessage.removeListener(progressListener);
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeYouTubeVideos,
    }, (results) => {
      chrome.runtime.onMessage.removeListener(progressListener);

      if (chrome.runtime.lastError) {
        console.error('Scripting Error:', chrome.runtime.lastError);
        alert('An error occurred during scripting: ' + chrome.runtime.lastError.message);
        resetUI();
        return;
      }

      if (results && results[0] && results[0].result) {
        const videos = results[0].result;
        if (videos.length === 0) {
          alert('No videos found on this page. Make sure you are on a YouTube Channel "Videos", "Shorts", or similar tab.');
          resetUI();
          return;
        }

        const csvContent = convertToCSV(videos);
        downloadCSV(csvContent, 'youtube_videos.csv');

        // Success UI updates
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        document.getElementById('statVideosCount').textContent = videos.length;
        document.getElementById('statTimeElapsed').textContent = `${elapsed}s`;
        
        statsSection.style.display = 'flex';
        progressSection.style.display = 'none';
        downloadBtn.disabled = false;
      } else {
        alert('Failed to scrape page data.');
        resetUI();
      }
    });

  } catch (error) {
    chrome.runtime.onMessage.removeListener(progressListener);
    console.error('Execution Error:', error);
    alert('Error running extension: ' + error.message);
    resetUI();
  }

  function resetUI() {
    downloadBtn.disabled = false;
    progressSection.style.display = 'none';
    statsSection.style.display = 'none';
  }
});

// Content script function (executed inside the webpage context)
async function scrapeYouTubeVideos() {
  const cardSelectors = [
    'yt-lockup-view-model',
    'ytd-rich-grid-media',
    'ytd-grid-video-renderer',
    'ytd-video-renderer'
  ];
  
  const videoElements = Array.from(document.querySelectorAll(cardSelectors.join(', ')));
  if (videoElements.length === 0) {
    return [];
  }

  const rawVideos = [];

  videoElements.forEach((videoElement) => {
    try {
      // Find title and link
      const titleLink = videoElement.querySelector(
        'a.ytLockupMetadataViewModelTitle, a#video-title, a#video-title-link, #video-title'
      );
      if (!titleLink) return;

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

      if (!videoId) return;

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

      rawVideos.push({
        title,
        views,
        uploadTime,
        videoUrl,
        thumbnailUrl,
        videoId,
        relativeTimeElement
      });
    } catch (error) {
      console.error('Error parsing element:', error);
    }
  });

  if (rawVideos.length === 0) {
    return [];
  }

  // Fetch exact dates sequentially or in parallel chunks to preserve order and avoid rate limits
  const concurrencyLimit = 5;
  let index = 0;

  async function worker() {
    while (index < rawVideos.length) {
      const currentIdx = index;
      index++; // Increment global cursor
      
      const video = rawVideos[currentIdx];
      
      try {
        // Report progress to popup
        chrome.runtime.sendMessage({
          action: 'progress',
          current: currentIdx + 1,
          total: rawVideos.length,
          status: `Scraping: "${video.title.substring(0, 20)}..."`
        });

        // Add minor jitter (50ms - 150ms) to stagger requests nicely
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

        const response = await fetch(`https://www.youtube.com/watch?v=${video.videoId}`);
        const html = await response.text();

        // Scan for itemprop tags containing publish or upload date
        const match = html.match(/<meta itemprop="uploadDate" content="([^"]+)"/) || 
                      html.match(/<meta itemprop="datePublished" content="([^"]+)"/);

        if (match && match[1]) {
          const isoDate = match[1];
          const dateObj = new Date(isoDate);
          
          // Formatter for readable local date representation
          const formatted = dateObj.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });

          video.exactUploadTime = formatted;
          video.isoUploadTime = isoDate;

          // Replace text on YouTube UI
          if (video.relativeTimeElement) {
            video.relativeTimeElement.title = `Original: ${video.uploadTime}`;
            video.relativeTimeElement.textContent = formatted;
            video.relativeTimeElement.style.color = '#3ea6ff';
            video.relativeTimeElement.style.fontWeight = '500';
          }
        } else {
          video.exactUploadTime = 'N/A';
          video.isoUploadTime = '';
        }
      } catch (err) {
        console.error(`Error fetching detail for video ${video.videoId}:`, err);
        video.exactUploadTime = 'Error';
        video.isoUploadTime = '';
      }
    }
  }

  // Launch worker cohort
  const workers = [];
  for (let i = 0; i < Math.min(concurrencyLimit, rawVideos.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Return clean, JSON-serializable list (stripping DOM nodes)
  return rawVideos.map(v => ({
    title: v.title,
    views: v.views,
    uploadTime: v.uploadTime,
    exactUploadTime: v.exactUploadTime,
    videoUrl: v.videoUrl,
    thumbnailUrl: v.thumbnailUrl,
    isoUploadTime: v.isoUploadTime
  }));
}

// Convert data list into CSV formatted text
function convertToCSV(data) {
  const headers = ['Title', 'Views', 'Exact Upload Time', 'Relative Upload Time', 'Video URL', 'Thumbnail URL', 'ISO Timestamp'];
  const rows = data.map(video => [
    escapeCSVField(video.title),
    escapeCSVField(video.views),
    escapeCSVField(video.exactUploadTime),
    escapeCSVField(video.uploadTime),
    escapeCSVField(video.videoUrl),
    escapeCSVField(video.thumbnailUrl),
    escapeCSVField(video.isoUploadTime)
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}

// Escapes CSV values to avoid layout breakage due to quotes, commas, or newlines
function escapeCSVField(field) {
  if (field === null || field === undefined) {
    return '""';
  }
  let str = String(field);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Utility to generate a browser-level CSV file download
function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
