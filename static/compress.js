/* Droplabs Image Compressor
 *
 * Everything happens in the tab: decode -> draw to canvas -> re-encode with
 * canvas.toBlob(). No network request carries a user's image, which is both
 * the privacy claim and the reason there is no server bill.
 */
(function () {
  'use strict';

  var MAX_FILES = 20;
  var MAX_DIM = 12000; // canvas ceiling, protects low-memory phones
  var state = {
    format: 'keep',
    quality: 0.8,
    maxWidth: 0,
    targetKb: 0,
    items: [],
    running: false,
    token: 0
  };

  var $ = function (id) { return document.getElementById(id); };
  var drop = $('drop');
  var input = $('fileInput');
  var controls = $('controls');
  var results = $('results');
  var list = $('resultList');
  var summary = $('summary');
  var summarySub = $('summarySub');
  var quality = $('quality');
  var qualityOut = $('qualityOut');
  var qualityHint = $('qualityHint');
  var maxWidth = $('maxWidth');
  var target = $('target');
  var seg = $('formatSeg');
  var downloadAll = $('downloadAll');
  var clearBtn = $('clearBtn');
  var adSlot = $('adSlot');
  var presetGroup = $('presetGroup');
  var runTimer = null;

  /* ------------------------------------------------------------ helpers */
  function bytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  function extFor(type) {
    if (type === 'image/webp') return 'webp';
    if (type === 'image/png') return 'png';
    return 'jpg';
  }

  function baseName(name) {
    return name.replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '').trim() || 'image';
  }

  function outTypeFor(item) {
    if (state.format !== 'keep') return state.format;
    var t = (item.file.type || '').toLowerCase();
    if (t === 'image/jpeg' || t === 'image/png' || t === 'image/webp') return t;
    return 'image/jpeg';
  }

  function outNameFor(item, type) {
    return baseName(item.file.name) + '-compressed.' + extFor(type);
  }

  function decode(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return createImageBitmap(file, { imageOrientation: 'from-image' })
          .catch(function () { return decodeViaImg(file); });
      } catch (err) {
        return decodeViaImg(file);
      }
    }
    return decodeViaImg(file);
  }

  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('unreadable'));
      };
      img.src = url;
    });
  }

  function fit(w, h) {
    var cap = state.maxWidth;
    if (!cap || w <= cap) return [w, h];
    var r = cap / w;
    return [Math.round(w * r), Math.round(h * r)];
  }

  function encode(source, w, h, type, q) {
    w = Math.max(1, Math.min(MAX_DIM, Math.round(w)));
    h = Math.max(1, Math.min(MAX_DIM, Math.round(h)));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // JPEG has no alpha: paint white instead of letting it go black.
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(source, 0, 0, w, h);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, type, q);
    });
  }

  // Binary search for the highest quality that still fits the target size.
  //
  // Quality alone cannot always reach the target: a 2400x1600 photo of pure
  // noise is still ~1 MB at the lowest quality. So when even the floor misses,
  // the image is scaled down (area roughly in proportion to how far off we are)
  // and the search runs again at the smaller size. Without this step "target
  // 60 KB" would hand back a 1 MB file, which is worse than useless.
  function encodeToTarget(source, w, h, type, targetBytes) {
    var MIN_SIDE = 64;
    var MAX_ROUNDS = 4;

    function search(cw, ch) {
      var lo = 0.2, hi = 0.95, best = null, smallest = null;
      function step(n) {
        if (n >= 7) return Promise.resolve(best || smallest);
        var q = (lo + hi) / 2;
        return encode(source, cw, ch, type, q).then(function (b) {
          if (!b) return best || smallest;
          var rec = { blob: b, quality: q, w: cw, h: ch };
          if (b.size <= targetBytes) {
            best = rec;
            lo = q;
          } else {
            smallest = rec;
            hi = q;
          }
          return step(n + 1);
        });
      }
      return step(0);
    }

    // One cheap probe at the quality floor tells us whether resizing is needed
    // at all, so a normal photo never pays for the extra rounds.
    return encode(source, w, h, type, 0.2).then(function (probe) {
      if (probe && probe.size <= targetBytes) return search(w, h);

      var ratio = probe ? Math.sqrt(targetBytes / probe.size) * 0.92 : 0.6;
      var cw = Math.max(MIN_SIDE, Math.round(w * Math.min(1, ratio)));
      var ch = Math.max(MIN_SIDE, Math.round(h * Math.min(1, ratio)));

      function round(n) {
        return search(cw, ch).then(function (res) {
          if (!res) return null;
          if (res.blob.size <= targetBytes || n >= MAX_ROUNDS) return res;
          cw = Math.max(MIN_SIDE, Math.round(cw * 0.75));
          ch = Math.max(MIN_SIDE, Math.round(ch * 0.75));
          return round(n + 1);
        });
      }
      return round(1);
    });
  }

  /* -------------------------------------------------------------- files */
  function addFiles(fileList) {
    var incoming = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f && /^image\//.test(f.type || '');
    });
    if (!incoming.length) return;

    var room = MAX_FILES - state.items.length;
    incoming = incoming.slice(0, Math.max(0, room));

    incoming.forEach(function (file) {
      state.items.push({
        file: file,
        thumb: URL.createObjectURL(file),
        out: null,
        outUrl: null,
        outName: '',
        w: 0, h: 0, ow: 0, oh: 0,
        error: '',
        note: '',
        busy: true
      });
    });

    controls.hidden = false;
    results.hidden = false;
    render();
    scheduleRun();
  }

  function scheduleRun() {
    if (runTimer) clearTimeout(runTimer);
    runTimer = setTimeout(run, 200);
  }

  function run() {
    if (!state.items.length) return;
    var token = ++state.token;
    state.running = true;
    state.items.forEach(function (item) { item.busy = true; item.error = ''; item.note = ''; });
    render();

    var i = 0;
    function next() {
      if (token !== state.token) return;         // superseded by a newer run
      if (i >= state.items.length) {
        state.running = false;
        render();
        return;
      }
      var item = state.items[i++];
      return process(item, token).then(function () {
        if (token === state.token) render();
        return next();
      });
    }
    next();
  }

  function process(item, token) {
    var type = outTypeFor(item);
    var targetBytes = state.targetKb > 0 ? state.targetKb * 1024 : 0;
    // PNG is lossless, so a target size can only be reached by resizing.
    if (type === 'image/png') targetBytes = 0;

    return decode(item.file).then(function (source) {
      if (token !== state.token) {
        if (source && source.close) source.close();
        return;
      }
      var ow = source.width || source.naturalWidth;
      var oh = source.height || source.naturalHeight;
      item.ow = ow;
      item.oh = oh;
      var size = fit(ow, oh);
      item.w = size[0];
      item.h = size[1];

      var q = type === 'image/png' ? undefined : state.quality;
      var work = targetBytes
        ? encodeToTarget(source, item.w, item.h, type, targetBytes)
        : encode(source, item.w, item.h, type, q).then(function (b) {
            return b ? { blob: b, quality: q } : null;
          });

      return work.then(function (res) {
        if (source && source.close) source.close();
        if (token !== state.token) return;
        if (!res || !res.blob) {
          item.error = 'Your browser could not re-encode this file.';
          item.busy = false;
          return;
        }
        if (item.outUrl) URL.revokeObjectURL(item.outUrl);
        // Target mode may have shrunk the image to reach the size.
        if (res.w) item.w = res.w;
        if (res.h) item.h = res.h;
        item.note = (targetBytes && res.blob.size > targetBytes)
          ? 'Could not reach ' + state.targetKb + ' KB — this is the smallest this image goes.'
          : '';
        item.out = res.blob;
        item.outUrl = URL.createObjectURL(res.blob);
        item.outName = outNameFor(item, type);
        item.outType = type;
        item.quality = res.quality;
        item.busy = false;
      });
    }).catch(function () {
      item.busy = false;
      item.error = 'This format cannot be opened by your browser (HEIC needs converting first).';
    });
  }

  /* ------------------------------------------------------------ render */
  function render() {
    var html = '';
    var inTotal = 0, outTotal = 0, done = 0, failed = 0;

    state.items.forEach(function (item, index) {
      var saving = 0;
      var bigger = false;
      if (item.out) {
        saving = 1 - item.out.size / item.file.size;
        bigger = item.out.size > item.file.size;
        inTotal += item.file.size;
        outTotal += item.out.size;
        done += 1;
      }
      if (item.error) failed += 1;

      html += '<div class="result' + (bigger ? ' is-bigger' : '') + '">';
      html += '<img class="thumb" src="' + item.thumb + '" alt="" loading="lazy" />';
      html += '<div class="meta">';
      html += '<div class="name" title="' + escapeHtml(item.file.name) + '">' + escapeHtml(item.file.name) + '</div>';

      if (item.error) {
        html += '<div class="err">' + escapeHtml(item.error) + '</div>';
      } else if (item.busy || !item.out) {
        html += '<div class="dims">Compressing…</div>';
      } else {
        var dims = item.ow + '×' + item.oh;
        if (item.w !== item.ow) dims += ' → ' + item.w + '×' + item.h;
        html += '<div class="dims">' + dims + ' · ' + extFor(item.outType).toUpperCase() + '</div>';
        html += '<div class="sizes">';
        html += '<span class="was">' + bytes(item.file.size) + '</span>';
        html += '<span>→</span>';
        html += '<span class="now">' + bytes(item.out.size) + '</span>';
        html += '<span class="pct">' + (bigger ? '+' : '−') + Math.abs(Math.round(saving * 100)) + '%</span>';
        html += '</div>';
        if (item.note) html += '<div class="note">' + escapeHtml(item.note) + '</div>';
      }
      html += '</div>';

      if (item.error) {
        html += '<span></span>';
      } else if (item.busy || !item.out) {
        html += '<span class="spinner" aria-label="Working"></span>';
      } else {
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-save-ws="' + index + '">Save to Workspace</button>' +
          '<a class="btn btn-ghost btn-sm" href="' + item.outUrl + '" download="' +
          escapeHtml(item.outName) + '">Download</a></div>';
      }
      html += '</div>';
    });

    list.innerHTML = html;

    if (state.running) {
      summary.textContent = 'Compressing ' + state.items.length + ' image' +
        (state.items.length === 1 ? '' : 's') + '…';
      summarySub.textContent = 'Nothing is being uploaded.';
    } else if (!state.items.length) {
      summary.textContent = 'No images yet';
      summarySub.textContent = '';
    } else if (failed === state.items.length) {
      summary.textContent = 'Nothing could be processed';
      summarySub.textContent = 'Try a JPG, PNG or WebP file.';
    } else {
      var pct = inTotal ? Math.round((1 - outTotal / inTotal) * 100) : 0;
      summary.textContent = done + ' image' + (done === 1 ? '' : 's') + ' · ' +
        bytes(inTotal) + ' → ' + bytes(outTotal);
      if (outTotal > inTotal) {
        summarySub.textContent = 'Output is larger than the original — PNG is lossless. Try WebP or JPEG.';
      } else if (pct > 0) {
        summarySub.textContent = pct + '% smaller — ' + bytes(inTotal - outTotal) + ' saved';
      } else {
        summarySub.textContent = 'Already close to optimal. Try WebP or a lower quality.';
      }
    }

    downloadAll.disabled = !state.items.some(function (i) { return i.out && !i.busy; });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------- input */
  drop.addEventListener('click', function () { input.click(); });
  drop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', function () {
    addFiles(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (type) {
    drop.addEventListener(type, function (e) {
      e.preventDefault();
      drop.classList.add('is-over');
    });
  });
  ['dragleave', 'dragend'].forEach(function (type) {
    drop.addEventListener(type, function () { drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('is-over');
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // A screenshot on the clipboard is the most common way people use this.
  document.addEventListener('paste', function (e) {
    if (!e.clipboardData || !e.clipboardData.files || !e.clipboardData.files.length) return;
    addFiles(e.clipboardData.files);
  });

  /* ---------------------------------------------------------- settings */
  seg.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-format]');
    if (!btn) return;
    state.format = btn.getAttribute('data-format');
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', b === btn);
    });
    syncQuality();
    scheduleRun();
  });

  function syncQuality() {
    var lossless = state.format === 'image/png';
    quality.disabled = lossless;
    qualityHint.textContent = lossless
      ? 'PNG is lossless — quality does nothing here. Use WebP or JPEG to shrink it.'
      : '70–80% is usually invisible on a screen.';
  }

  function clearPresetHighlight() {
    if (!presetGroup) return;
    Array.prototype.forEach.call(presetGroup.querySelectorAll('button'), function (b) {
      b.classList.remove('is-active');
    });
  }

  if (presetGroup) {
    presetGroup.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-preset]');
      if (!btn) return;
      Array.prototype.forEach.call(presetGroup.querySelectorAll('button'), function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      var tKb = Number(btn.getAttribute('data-target')) || 0;
      var mW = Number(btn.getAttribute('data-width')) || 0;
      var fmt = btn.getAttribute('data-format') || 'keep';

      state.targetKb = tKb;
      state.maxWidth = mW;
      state.format = fmt;
      target.value = tKb > 0 ? String(tKb) : '';
      maxWidth.value = mW > 0 ? String(mW) : '';

      Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-format') === fmt);
      });
      syncQuality();
      if (state.items.length) scheduleRun();
    });
  }

  list.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-save-ws]');
    if (!btn || !window.DroplabsWorkspace) return;
    var idx = Number(btn.getAttribute('data-save-ws'));
    var item = state.items[idx];
    if (!item || !item.out) return;

    var pct = item.file.size ? Math.round((1 - item.out.size / item.file.size) * 100) : 0;
    // Generate tiny thumbnail dataURL so Workspace shows a persistent preview
    var reader = new FileReader();
    reader.onloadend = function () {
      window.DroplabsWorkspace.save({
        type: 'image',
        sourceKey: 'img:' + item.outName + ':' + item.out.size,
        title: item.outName,
        dims: item.w + '×' + item.h,
        format: extFor(item.outType).toUpperCase(),
        originalSize: bytes(item.file.size),
        compressedSize: bytes(item.out.size),
        savedPct: pct,
        previewDataUrl: typeof reader.result === 'string' && reader.result.length < 300000 ? reader.result : ''
      });
      btn.textContent = 'Saved ✓';
      btn.disabled = true;
    };
    reader.readAsDataURL(item.out);
  });

  quality.addEventListener('input', function () {
    state.quality = Number(quality.value) / 100;
    qualityOut.textContent = quality.value + '%';
    clearPresetHighlight();
    scheduleRun();
  });

  maxWidth.addEventListener('input', function () {
    state.maxWidth = Math.max(0, Number(maxWidth.value) || 0);
    clearPresetHighlight();
    scheduleRun();
  });

  target.addEventListener('input', function () {
    state.targetKb = Math.max(0, Number(target.value) || 0);
    clearPresetHighlight();
    scheduleRun();
  });

  /* ----------------------------------------------------------- actions */
  downloadAll.addEventListener('click', function () {
    var ready = state.items.filter(function (i) { return i.out && !i.busy; });
    ready.forEach(function (item, index) {
      setTimeout(function () {
        var a = document.createElement('a');
        a.href = item.outUrl;
        a.download = item.outName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, index * 220);
    });
  });

  clearBtn.addEventListener('click', function () {
    state.token += 1;
    state.items.forEach(function (item) {
      URL.revokeObjectURL(item.thumb);
      if (item.outUrl) URL.revokeObjectURL(item.outUrl);
    });
    state.items = [];
    state.running = false;
    list.innerHTML = '';
    results.hidden = true;
    controls.hidden = true;
    summary.textContent = 'Working…';
    summarySub.textContent = '';
    downloadAll.disabled = true;
  });

  /* --------------------------------------------------------------- ads */
  // Same guard as the main page: never fire a real impression from localhost.
  var LOCAL = ['localhost', '127.0.0.1', ''];
  (function loadAd() {
    if (LOCAL.indexOf(location.hostname) !== -1) return;
    adSlot.hidden = false;
    try {
      var s = document.createElement('script');
      s.async = true;
      s.setAttribute('data-cfasync', 'false');
      s.src = 'https://bellnewyork.org/21/18527c484b75598c40e3c7284aae8ee4';
      document.body.appendChild(s);
    } catch (err) { return; }

    // Collapse the slot if Adsterra has no fill, so nobody sees an empty box.
    var tries = 0;
    var container = document.getElementById('container-18527c484b75598c40e3c7284aae8ee4');
    (function poll() {
      tries += 1;
      if (container && container.childElementCount > 0) return;
      if (tries >= 30) { adSlot.hidden = true; return; }
      setTimeout(poll, tries < 8 ? 250 : 800);
    })();
  })();
})();
