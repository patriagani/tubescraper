(function scrapeYouTubeVideos() {
  console.log("Hello World")
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

  console.log('Scraped Videos:', videos);
})();
