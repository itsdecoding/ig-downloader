/* Droplabs /tools/video-to-text */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var tabUrl = $('tabUrl');
  var tabFile = $('tabFile');
  var urlForm = $('urlForm');
  var txUrlInput = $('txUrlInput');
  var txPasteBtn = $('txPasteBtn');
  var txSubmitUrl = $('txSubmitUrl');
  var txDrop = $('txDrop');
  var txFileInput = $('txFileInput');
  var txFileLabel = $('txFileLabel');
  var txLang = $('txLang');
  var txStatus = $('txStatus');
  var txResultCard = $('txResultCard');
  var txTitle = $('txTitle');
  var txMeta = $('txMeta');
  var txSegments = $('txSegments');
  var copyAllBtn = $('copyAllBtn');
  var copyPlainBtn = $('copyPlainBtn');
  var downloadSrtBtn = $('downloadSrtBtn');
  var downloadTxtBtn = $('downloadTxtBtn');
  var analyzeHookBtn = $('analyzeHookBtn');
  var hookBox = $('hookBox');
  var saveTxWsBtn = $('saveTxWsBtn');

  var currentTx = null;
  var currentHook = null;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setMode(mode) {
    var isUrl = mode === 'url';
    tabUrl.classList.toggle('is-active', isUrl);
    tabUrl.setAttribute('aria-selected', String(isUrl));
    tabFile.classList.toggle('is-active', !isUrl);
    tabFile.setAttribute('aria-selected', String(!isUrl));
    urlForm.hidden = !isUrl;
    txDrop.hidden = isUrl;
  }

  tabUrl.addEventListener('click', function () { setMode('url'); });
  tabFile.addEventListener('click', function () { setMode('file'); });

  function showLoading(msg) {
    txStatus.className = 'status-box is-loading';
    txStatus.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>' + escapeHtml(msg) + '</span>';
    txStatus.hidden = false;
  }

  function showError(msg) {
    txStatus.className = 'status-box is-error';
    txStatus.textContent = msg;
    txStatus.hidden = false;
  }

  function clearStatus() {
    txStatus.hidden = true;
    txStatus.innerHTML = '';
  }

  function formatSrtTime(sec) {
    var ms = Math.max(0, Math.round((Number(sec) || 0) * 1000));
    var h = Math.floor(ms / 3600000); ms %= 3600000;
    var m = Math.floor(ms / 60000); ms %= 60000;
    var s = Math.floor(ms / 1000); ms %= 1000;
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var pad3 = function (n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n); };
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + ',' + pad3(ms);
  }

  function buildTimestampedText(data) {
    if (!data || !Array.isArray(data.segments) || !data.segments.length) {
      return (data && data.text) || '';
    }
    return data.segments.map(function (seg) {
      return '[' + seg.start_str + '] ' + seg.text;
    }).join('\n');
  }

  function renderTranscript(data) {
    currentTx = data;
    txResultCard.hidden = false;
    txTitle.textContent = data.source_title || 'Transcript';
    var metaBits = [];
    if (data.language && data.language !== 'auto') metaBits.push('Language: ' + data.language.toUpperCase());
    if (data.duration_str && data.duration_str !== '00:00') metaBits.push('Duration: ' + data.duration_str);
    if (Array.isArray(data.segments)) metaBits.push(data.segments.length + ' segments');
    txMeta.textContent = metaBits.join(' · ');

    if (Array.isArray(data.segments) && data.segments.length) {
      var html = '';
      data.segments.forEach(function (seg) {
        html += '<div class="tx-row">' +
          '<span class="tx-time">' + escapeHtml(seg.start_str) + '</span>' +
          '<span class="tx-text">' + escapeHtml(seg.text) + '</span>' +
          '</div>';
      });
      txSegments.innerHTML = html;
    } else {
      txSegments.innerHTML = '<div class="tx-row"><span class="tx-time">00:00</span><span class="tx-text">' +
        escapeHtml(data.text || 'No speech detected.') + '</span></div>';
    }

    copyAllBtn.textContent = 'Copy All';
    copyPlainBtn.textContent = 'Copy Plain';
    saveTxWsBtn.textContent = 'Save to Workspace';
    saveTxWsBtn.disabled = false;
    currentHook = null;
    if (hookBox) {
      hookBox.hidden = true;
      hookBox.innerHTML = '';
    }
    if (analyzeHookBtn) {
      analyzeHookBtn.textContent = 'Analyze Hook';
      analyzeHookBtn.disabled = false;
    }
  }

  async function runTranscribe(formData, loadingLabel) {
    txResultCard.hidden = true;
    txSubmitUrl.disabled = true;
    showLoading(loadingLabel);

    try {
      var resp = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        showError(data.detail || 'Transcription failed. Please try again.');
        return;
      }
      clearStatus();
      renderTranscript(data);
    } catch (err) {
      showError('Network error while transcribing. Please try again.');
    } finally {
      txSubmitUrl.disabled = false;
    }
  }

  urlForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var url = (txUrlInput.value || '').trim();
    if (!url) {
      showError('Paste an Instagram Reel, TikTok, or YouTube Shorts link first.');
      txUrlInput.focus();
      return;
    }
    var fd = new FormData();
    fd.append('url', url);
    fd.append('language', txLang.value);
    runTranscribe(fd, 'Fetching video, stripping audio with FFmpeg, transcribing via Whisper…');
  });

  txPasteBtn.addEventListener('click', async function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      txUrlInput.focus();
      return;
    }
    try {
      var txt = await navigator.clipboard.readText();
      if (txt) txUrlInput.value = txt.trim();
    } catch (err) {
      txUrlInput.focus();
    }
  });

  function handleFile(file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      showError('File is over 50 MB. Please trim or upload a shorter clip.');
      return;
    }
    txFileLabel.textContent = file.name;
    var fd = new FormData();
    fd.append('file', file);
    fd.append('language', txLang.value);
    runTranscribe(fd, 'Stripping audio with FFmpeg and transcribing via Whisper…');
  }

  txDrop.addEventListener('click', function () { txFileInput.click(); });
  txDrop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      txFileInput.click();
    }
  });
  txFileInput.addEventListener('change', function () {
    if (txFileInput.files && txFileInput.files[0]) {
      handleFile(txFileInput.files[0]);
      txFileInput.value = '';
    }
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    txDrop.addEventListener(ev, function (e) { e.preventDefault(); txDrop.classList.add('is-over'); });
  });
  ['dragleave', 'dragend'].forEach(function (ev) {
    txDrop.addEventListener(ev, function () { txDrop.classList.remove('is-over'); });
  });
  txDrop.addEventListener('drop', function (e) {
    e.preventDefault();
    txDrop.classList.remove('is-over');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  async function copyText(str, btn, resetLabel) {
    if (!str) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
      } else {
        throw new Error('no-clipboard-api');
      }
      btn.textContent = 'Copied ✓';
      setTimeout(function () { btn.textContent = resetLabel; }, 1800);
    } catch (err) {
      // Fallback for non-HTTPS or browsers blocking async clipboard API
      try {
        var ta = document.createElement('textarea');
        ta.value = str;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        ta.remove();
        if (!ok) throw new Error('execCommand-failed');
        btn.textContent = 'Copied ✓';
        setTimeout(function () { btn.textContent = resetLabel; }, 1800);
      } catch (e2) {
        showError('Clipboard permission blocked. Select and copy manually.');
      }
    }
  }

  copyAllBtn.addEventListener('click', function () {
    copyText(buildTimestampedText(currentTx), copyAllBtn, 'Copy All');
  });

  copyPlainBtn.addEventListener('click', function () {
    copyText((currentTx && currentTx.text) || '', copyPlainBtn, 'Copy Plain');
  });

  function downloadTextFile(content, ext) {
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = ((currentTx.source_title || 'transcript').replace(/[^\w\-]+/g, '_') || 'transcript') + '.' + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  downloadSrtBtn.addEventListener('click', function () {
    if (!currentTx) return;
    var segs = (currentTx.segments && currentTx.segments.length)
      ? currentTx.segments
      : [{ start: 0, end: currentTx.duration || 5, text: currentTx.text || '' }];
    var srt = segs.map(function (seg, idx) {
      return (idx + 1) + '\n' +
        formatSrtTime(seg.start) + ' --> ' + formatSrtTime(seg.end) + '\n' +
        seg.text + '\n';
    }).join('\n');
    downloadTextFile(srt, 'srt');
  });

  if (downloadTxtBtn) {
    downloadTxtBtn.addEventListener('click', function () {
      if (!currentTx) return;
      var header = (currentTx.source_title || 'Transcript') + '\n' +
        (currentTx.source_url ? currentTx.source_url + '\n' : '') + '\n';
      downloadTextFile(header + buildTimestampedText(currentTx) + '\n', 'txt');
    });
  }

  function renderHookAnalysis(data) {
    if (!hookBox) return;
    var outlineHtml = (data.outline || []).map(function (item) {
      return '<li>' + escapeHtml(item) + '</li>';
    }).join('');
    var remixHtml = (data.remix_hooks || []).map(function (item) {
      return '<li>' + escapeHtml(item) + '</li>';
    }).join('');
    hookBox.innerHTML =
      '<span class="meta-badge is-accent">' + escapeHtml(data.hook_pattern || 'Hook Breakdown') + '</span>' +
      '<h3>Why the opening works</h3>' +
      '<p>' + escapeHtml(data.why_it_works || '') + '</p>' +
      '<div class="hook-cols">' +
      '  <div><div class="hook-list-title">Script structure</div><ul class="hook-list">' + outlineHtml + '</ul></div>' +
      '  <div><div class="hook-list-title">Remix hook ideas</div><ul class="hook-list">' + remixHtml + '</ul></div>' +
      '</div>';
    hookBox.hidden = false;
  }

  if (analyzeHookBtn) {
    analyzeHookBtn.addEventListener('click', async function () {
      if (!currentTx || !currentTx.text) return;
      analyzeHookBtn.disabled = true;
      analyzeHookBtn.textContent = 'Analyzing…';
      try {
        var resp = await fetch('/api/analyze-transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: currentTx.text,
            title: currentTx.source_title || ''
          })
        });
        var data = await resp.json().catch(function () { return {}; });
        if (!resp.ok) {
          showError(data.detail || 'Could not analyze hook right now.');
          analyzeHookBtn.disabled = false;
          analyzeHookBtn.textContent = 'Analyze Hook';
          return;
        }
        currentHook = data;
        renderHookAnalysis(data);
        analyzeHookBtn.textContent = 'Hook Analyzed ✓';
        saveTxWsBtn.textContent = 'Save to Workspace';
        saveTxWsBtn.disabled = false;
      } catch (err) {
        showError('Network error while analyzing hook.');
        analyzeHookBtn.disabled = false;
        analyzeHookBtn.textContent = 'Analyze Hook';
      }
    });
  }

  saveTxWsBtn.addEventListener('click', function () {
    if (!currentTx || !window.DroplabsWorkspace) return;
    window.DroplabsWorkspace.save({
      type: 'transcript',
      sourceKey: 'tx:' + (currentTx.source_url || currentTx.source_title) + ':' + (currentTx.text || '').slice(0, 40),
      title: currentTx.source_title || 'Video Transcript',
      language: currentTx.language || 'auto',
      duration: currentTx.duration_str || '',
      sourceUrl: currentTx.source_url || '',
      timestampedText: buildTimestampedText(currentTx),
      plainText: currentTx.text || '',
      hookAnalysis: currentHook || null
    });
    saveTxWsBtn.textContent = 'Saved ✓';
    saveTxWsBtn.disabled = true;
  });

  // Pre-fill URL if passed via ?url=
  var params = new URLSearchParams(location.search);
  var qUrl = params.get('url');
  if (qUrl) {
    txUrlInput.value = qUrl;
  }

  if (window.DroplabsWorkspace) window.DroplabsWorkspace.loadAd();
})();
