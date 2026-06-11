function toggleButtons(disabled) {
  document.getElementById('download').disabled = disabled;
  document.getElementById('checkExact').disabled = disabled;
}

// ------------------------------------------------------------------
// SCARPE & DOWNLOAD CSV BUTTON
// ------------------------------------------------------------------
document.getElementById('download').addEventListener('click', async () => {
  const progressSection = document.getElementById('progressSection');
  const statsSection = document.getElementById('statsSection');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercent = document.getElementById('progressPercent');
  const statusText = document.getElementById('statusText');

  // UI Setup
  toggleButtons(true);
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

  function resetUI() {
    toggleButtons(false);
    progressSection.style.display = 'none';
    statsSection.style.display = 'none';
  }

  function handleScrapeResponse(response) {
    chrome.runtime.onMessage.removeListener(progressListener);

    if (response && response.success && response.videos) {
      const videos = response.videos;
      if (videos.length === 0) {
        alert('No videos found on this page. Make sure you are on a YouTube Channel "Videos", "Shorts", or similar tab.');
        resetUI();
        return;
      }

      const csvContent = convertToCSV(videos);
      downloadCSV(csvContent, 'youtube_videos.csv');

      // Success UI updates
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      const label = document.querySelector('.stat-card:first-child .stat-label');
      if (label) label.textContent = 'Videos Scraped';
      
      document.getElementById('statVideosCount').textContent = videos.length;
      document.getElementById('statTimeElapsed').textContent = `${elapsed}s`;
      
      statsSection.style.display = 'flex';
      progressSection.style.display = 'none';
      toggleButtons(false);
    } else {
      alert('Failed to scrape page data. Please check the page or refresh and try again.');
      resetUI();
    }
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      alert('Please use this extension on a YouTube page.');
      resetUI();
      chrome.runtime.onMessage.removeListener(progressListener);
      return;
    }

    // Try sending message to the tab's content script
    chrome.tabs.sendMessage(tab.id, { action: 'scrapeAndDownload' }, async (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script not detected. Injecting content.js dynamically...');
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          
          chrome.tabs.sendMessage(tab.id, { action: 'scrapeAndDownload' }, (res) => {
            if (chrome.runtime.lastError) {
              console.error('Failed to communicate even after injecting content.js:', chrome.runtime.lastError);
              alert('Please reload the YouTube page and try again.');
              resetUI();
              chrome.runtime.onMessage.removeListener(progressListener);
            } else {
              handleScrapeResponse(res);
            }
          });
        } catch (injectError) {
          console.error('Failed to inject content.js:', injectError);
          alert('Failed to initialize content script. Please reload the page.');
          resetUI();
          chrome.runtime.onMessage.removeListener(progressListener);
        }
      } else {
        handleScrapeResponse(response);
      }
    });

  } catch (error) {
    chrome.runtime.onMessage.removeListener(progressListener);
    console.error('Execution Error:', error);
    alert('Error running extension: ' + error.message);
    resetUI();
  }
});


// ------------------------------------------------------------------
// CHECK EXACT DATE BUTTON
// ------------------------------------------------------------------
document.getElementById('checkExact').addEventListener('click', async () => {
  const progressSection = document.getElementById('progressSection');
  const statsSection = document.getElementById('statsSection');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercent = document.getElementById('progressPercent');
  const statusText = document.getElementById('statusText');

  // UI Setup
  toggleButtons(true);
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

  function resetUI() {
    toggleButtons(false);
    progressSection.style.display = 'none';
    statsSection.style.display = 'none';
  }

  function handleCheckResponse(response) {
    chrome.runtime.onMessage.removeListener(progressListener);
    toggleButtons(false);

    if (response && response.success) {
      // Success UI updates
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      const label = document.querySelector('.stat-card:first-child .stat-label');
      if (label) label.textContent = 'Videos Checked';
      
      document.getElementById('statVideosCount').textContent = response.count || 0;
      document.getElementById('statTimeElapsed').textContent = `${elapsed}s`;
      
      statsSection.style.display = 'flex';
      progressSection.style.display = 'none';
    } else {
      alert('Failed to check exact dates. Please reload the page and try again.');
      resetUI();
    }
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      alert('Please use this extension on a YouTube page.');
      resetUI();
      chrome.runtime.onMessage.removeListener(progressListener);
      return;
    }

    // Try sending message to the tab's content script
    chrome.tabs.sendMessage(tab.id, { action: 'checkExactDates' }, async (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script not detected. Injecting content.js dynamically...');
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          
          chrome.tabs.sendMessage(tab.id, { action: 'checkExactDates' }, (res) => {
            if (chrome.runtime.lastError) {
              alert('Please reload the YouTube page and try again.');
              resetUI();
              chrome.runtime.onMessage.removeListener(progressListener);
            } else {
              handleCheckResponse(res);
            }
          });
        } catch (injectError) {
          alert('Failed to initialize content script. Please reload the page.');
          resetUI();
          chrome.runtime.onMessage.removeListener(progressListener);
        }
      } else {
        handleCheckResponse(response);
      }
    });

  } catch (error) {
    chrome.runtime.onMessage.removeListener(progressListener);
    alert('Error: ' + error.message);
    resetUI();
  }
});


// ------------------------------------------------------------------
// CSV GENERATOR UTILITIES
// ------------------------------------------------------------------

// Convert data list into CSV formatted text (excluding Relative Upload Time)
function convertToCSV(data) {
  const headers = ['Title', 'Views', 'Exact Upload Time', 'Video URL', 'Thumbnail URL', 'ISO Timestamp'];
  const rows = data.map(video => [
    escapeCSVField(video.title),
    escapeCSVField(video.views),
    escapeCSVField(video.exactUploadTime),
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
