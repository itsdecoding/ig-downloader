/* Droplabs /tools/video-downloader */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var form = $('extractForm');
  var input = $('urlInput');
  var pasteBtn = $('pasteBtn');
  var extractBtn = $('extractBtn');
  var statusBox = $('statusBox');
  var resultCard = $('resultCard');
  var thumbBox = $('thumbBox');
  var metaBadges = $('metaBadges');
  var videoTitle = $('videoTitle');
  var videoAuthor = $('videoAuthor');
  var videoCaption = $('videoCaption');
  var downloadBtn = $('downloadBtn');
  var saveWsBtn = $('saveWsBtn');
  var transcribeLink = $('transcribeLink');
  var carouselStrip = $('carouselStrip');

  var currentData = null;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showLoading(msg) {
    statusBox.className = 'status-box is-loading';
    statusBox.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>' + escapeHtml(msg) + '</span>';
    statusBox.hidden = false;
  }

  function showError(msg) {
    statusBox.className = 'status-box is-error';
    statusBox.textContent = msg;
    statusBox.hidden = false;
  }

  function clearStatus() {
    statusBox.hidden = true;
    statusBox.innerHTML = '';
  }

  function platformLabel(p) {
    if (p === 'instagram') return 'Instagram';
    if (p === 'tiktok') return 'TikTok';
    if (p === 'youtube') return 'YouTube Shorts';
    return 'Video';
  }

  function renderResult(data) {
    currentData = data;
    resultCard.hidden = false;

    // Thumbnail preview
    var thumbSrc = data.thumbnail_proxy || data.thumbnail || '';
    if (thumbSrc) {
      thumbBox.innerHTML = '<img src="' + escapeHtml(thumbSrc) + '" alt="Video thumbnail" />';
    } else {
      thumbBox.innerHTML = '<div class="thumb-fallback">No preview</div>';
    }

    // Metadata badges
    var badges = [
      '<span class="meta-badge is-accent">' + escapeHtml(platformLabel(data.platform)) + '</span>',
      '<span class="meta-badge">' + escapeHtml(data.quality || 'HD') + '</span>'
    ];
    if (data.duration_str && data.duration_str !== '0:00') {
      badges.push('<span class="meta-badge">' + escapeHtml(data.duration_str) + '</span>');
    }
    if (data.needs_mux) {
      badges.push('<span class="meta-badge">HD Muxed MP4</span>');
    }
    metaBadges.innerHTML = badges.join('');

    videoTitle.textContent = data.title || 'Creator Video';
    videoAuthor.textContent = data.author ? '@' + String(data.author).replace(/^@/, '') : '';

    if (data.caption && data.caption !== data.title) {
      videoCaption.textContent = data.caption;
      videoCaption.hidden = false;
    } else {
      videoCaption.hidden = true;
    }

    downloadBtn.href = data.download_url;
    var safeFile = (data.title || 'droplabs_video').replace(/[^\w\-. ]+/g, '').trim().slice(0, 60) || 'droplabs_video';
    downloadBtn.setAttribute('download', safeFile + '.mp4');

    transcribeLink.href = '/tools/video-to-text?url=' + encodeURIComponent(data.source_url || input.value.trim());

    saveWsBtn.textContent = 'Save to Workspace';
    saveWsBtn.disabled = false;

    // Carousel slides if present
    if (data.is_carousel && Array.isArray(data.items) && data.items.length > 1) {
      var slidesHtml = '';
      data.items.forEach(function (item) {
        var dl = '/api/video/download?url=' + encodeURIComponent(item.video_url) +
          '&filename=' + encodeURIComponent(safeFile + '_slide_' + item.index + '.mp4');
        var img = item.thumbnail_proxy || item.thumbnail || thumbSrc;
        slidesHtml += '<div class="slide-card">';
        if (img) slidesHtml += '<img src="' + escapeHtml(img) + '" alt="Slide ' + item.index + '" loading="lazy" />';
        slidesHtml += '<a class="btn btn-ghost btn-sm" href="' + dl + '" download>Slide ' + item.index + ' MP4</a>';
        slidesHtml += '</div>';
      });
      carouselStrip.innerHTML = slidesHtml;
      carouselStrip.hidden = false;
    } else {
      carouselStrip.hidden = true;
      carouselStrip.innerHTML = '';
    }
  }

  async function extract(rawUrl) {
    var url = (rawUrl || '').trim();
    if (!url) {
      showError('Paste an Instagram Reel, TikTok, or YouTube Shorts link first.');
      input.focus();
      return;
    }

    resultCard.hidden = true;
    extractBtn.disabled = true;
    showLoading('Resolving video stream and thumbnail…');

    try {
      var resp = await fetch('/api/video/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        showError(data.detail || 'Could not extract that video. Make sure the link is public.');
        return;
      }
      clearStatus();
      renderResult(data);
    } catch (err) {
      showError('Network error while contacting the server. Please try again.');
    } finally {
      extractBtn.disabled = false;
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    extract(input.value);
  });

  pasteBtn.addEventListener('click', async function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      input.focus();
      return;
    }
    try {
      var txt = await navigator.clipboard.readText();
      if (txt) {
        input.value = txt.trim();
        extract(input.value);
      }
    } catch (err) {
      input.focus();
    }
  });

  saveWsBtn.addEventListener('click', function () {
    if (!currentData || !window.DroplabsWorkspace) return;
    window.DroplabsWorkspace.save({
      type: 'video',
      sourceKey: 'video:' + (currentData.source_url || currentData.id),
      platform: platformLabel(currentData.platform),
      title: currentData.title || 'Saved Video',
      author: currentData.author || '',
      quality: currentData.quality || 'HD',
      duration: currentData.duration_str || '',
      sourceUrl: currentData.source_url || input.value.trim(),
      thumbnail: currentData.thumbnail_proxy || currentData.thumbnail || '',
      caption: currentData.caption || ''
    });
    saveWsBtn.textContent = 'Saved ✓';
    saveWsBtn.disabled = true;
  });

  // Auto-extract if ?url= query param is provided
  var params = new URLSearchParams(location.search);
  var qUrl = params.get('url');
  if (qUrl) {
    input.value = qUrl;
    extract(qUrl);
  }

  if (window.DroplabsWorkspace) window.DroplabsWorkspace.loadAd();
})();
