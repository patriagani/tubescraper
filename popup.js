document.getElementById('download').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: scrapeYouTubeVideos,
    }, (results) => {
      if (results && results[0].result) {
        const videos = results[0].result;
        const csvContent = convertToCSV(videos);
        downloadCSV(csvContent, 'youtube_videos.csv');
      } else {
        console.error('No data scraped or an error occurred.');
      }
    });
  });
});

// Fungsi scraping untuk dijalankan di content script
function scrapeYouTubeVideos() {
  const videos = [];
  const videoElements = document.querySelectorAll('#content');

  videoElements.forEach((videoElement) => {
    try {
      const titleElement = videoElement.querySelector('#video-title');
      const title = titleElement?.textContent.trim() || 'Unknown Title';

      const metadataLineElement = videoElement.querySelector('#metadata-line');
      const metadataElement = metadataLineElement.querySelectorAll(
        '.inline-metadata-item.style-scope.ytd-video-meta-block'
      );

      const viewsElement = metadataElement[0];
      const views = viewsElement?.textContent.trim() || 'Unknown Views';

      const uploadTimeElement = metadataElement[1];
      const uploadTime = uploadTimeElement?.textContent.trim() || 'Unknown Upload Time';

      const thumbnailElement = videoElement.querySelector('a#thumbnail');
      const videoId = new URLSearchParams(thumbnailElement?.href.split('?')[1]).get('v');
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

      videos.push({ title, views, uploadTime, videoUrl, thumbnailUrl });
    } catch (error) {
      console.error('Error processing video element:', error);
    }
  });

  return videos;
}

// Fungsi untuk mengonversi data ke format CSV
function convertToCSV(data) {
  const headers = ['Title', 'Views', 'Upload Time', 'Video URL', 'Thumbnail URL'];
  const rows = data.map(video =>
    [video.title, video.views, video.uploadTime, video.videoUrl, video.thumbnailUrl].join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

// Fungsi untuk mengunduh file CSV
function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
