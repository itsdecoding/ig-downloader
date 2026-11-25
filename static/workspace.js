/* Droplabs /workspace */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var grid = $('wsGrid');
  var empty = $('wsEmpty');
  var filters = $('wsFilters');
  var search = $('wsSearch');
  var clearBtn = $('wsClearBtn');
  var proBtn = $('proBtn');

  var currentFilter = 'all';
  var currentQuery = '';

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function badgeFor(item) {
    if (item.type === 'video') return item.platform || 'Video';
    if (item.type === 'transcript') return 'Transcript';
    if (item.type === 'image') return 'Image';
    return 'Asset';
  }

  function render() {
    if (!window.DroplabsWorkspace) return;
    var items = window.DroplabsWorkspace.list();
    var filtered = items.filter(function (it) {
      if (currentFilter !== 'all' && it.type !== currentFilter) return false;
      if (currentQuery) {
        var hay = [it.title, it.platform, it.author, it.plainText, it.caption, it.note].join(' ').toLowerCase();
        if (hay.indexOf(currentQuery) === -1) return false;
      }
      return true;
    });

    if (!filtered.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    var html = '';
    filtered.forEach(function (it) {
      html += '<article class="card ws-item" data-id="' + escapeHtml(it.id) + '">';
      html += '<div class="ws-item-head">' +
        '<span class="meta-badge is-accent">' + escapeHtml(badgeFor(it)) + '</span>' +
        '<button type="button" class="legal-btn" data-remove="' + escapeHtml(it.id) + '" style="font-size:12px;color:var(--text-3)">Remove</button>' +
        '</div>';

      if (it.previewDataUrl || it.thumbnail) {
        var imgSrc = it.previewDataUrl || it.thumbnail;
        html += '<img src="' + escapeHtml(imgSrc) + '" alt="" style="width:100%;height:130px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.1)" />';
      }

      html += '<h3 class="ws-item-title">' + escapeHtml(it.title || 'Saved item') + '</h3>';

      if (it.type === 'video') {
        var info = [it.author ? '@' + String(it.author).replace(/^@/, '') : '', it.quality, it.duration].filter(Boolean).join(' · ');
        if (info) html += '<div style="font-size:12px;color:var(--text-3)">' + escapeHtml(info) + '</div>';
        if (it.caption) html += '<div class="ws-item-body">' + escapeHtml(it.caption) + '</div>';
      } else if (it.type === 'transcript') {
        var tInfo = [it.language ? it.language.toUpperCase() : '', it.duration].filter(Boolean).join(' · ');
        if (tInfo) html += '<div style="font-size:12px;color:var(--text-3)">' + escapeHtml(tInfo) + '</div>';
        html += '<div class="ws-item-body">' + escapeHtml(it.timestampedText || it.plainText || '') + '</div>';
      } else if (it.type === 'image') {
        html += '<div style="font-size:12px;color:var(--text-2)">' +
          escapeHtml((it.dims || '') + ' · ' + (it.format || '') + ' · ' + (it.originalSize || '') + ' → ' + (it.compressedSize || '')) +
          '</div>';
      }

      html += '<textarea class="ws-note" data-note="' + escapeHtml(it.id) + '" placeholder="Add creator notes, hook ideas, or tags...">' +
        escapeHtml(it.note || '') + '</textarea>';

      html += '<div class="actions-row">';
      if (it.type === 'transcript') {
        html += '<button type="button" class="btn btn-ghost btn-sm" data-copy-tx="' + escapeHtml(it.id) + '">Copy Script</button>';
      }
      if (it.type === 'image' && it.previewDataUrl) {
        html += '<a class="btn btn-ghost btn-sm" href="' + escapeHtml(it.previewDataUrl) + '" download="' + escapeHtml(it.title || 'image') + '">Download</a>';
      }
      if (it.sourceUrl) {
        html += '<a class="btn btn-ghost btn-sm" href="' + escapeHtml(it.sourceUrl) + '" target="_blank" rel="noopener">Source ↗</a>';
        if (it.type === 'video') {
          html += '<a class="btn btn-ghost btn-sm" href="/tools/video-to-text?url=' + encodeURIComponent(it.sourceUrl) + '">Transcribe</a>';
        }
      }
      html += '</div></article>';
    });
    grid.innerHTML = html;
  }

  filters.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    currentFilter = btn.getAttribute('data-filter');
    Array.prototype.forEach.call(filters.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', b === btn);
    });
    render();
  });

  search.addEventListener('input', function () {
    currentQuery = (search.value || '').trim().toLowerCase();
    render();
  });

  clearBtn.addEventListener('click', function () {
    if (!window.DroplabsWorkspace) return;
    window.DroplabsWorkspace.clear();
    render();
  });

  grid.addEventListener('click', async function (e) {
    var rem = e.target.closest('[data-remove]');
    if (rem) {
      window.DroplabsWorkspace.remove(rem.getAttribute('data-remove'));
      render();
      return;
    }
    var copyBtn = e.target.closest('[data-copy-tx]');
    if (copyBtn) {
      var id = copyBtn.getAttribute('data-copy-tx');
      var found = window.DroplabsWorkspace.list().filter(function (x) { return x.id === id; })[0];
      if (found && navigator.clipboard) {
        await navigator.clipboard.writeText(found.timestampedText || found.plainText || '');
        copyBtn.textContent = 'Copied ✓';
        setTimeout(function () { copyBtn.textContent = 'Copy Script'; }, 1600);
      }
    }
  });

  grid.addEventListener('input', function (e) {
    var ta = e.target.closest('textarea[data-note]');
    if (!ta || !window.DroplabsWorkspace) return;
    window.DroplabsWorkspace.updateNote(ta.getAttribute('data-note'), ta.value);
  });

  proBtn.addEventListener('click', function () {
    if (window.DroplabsWorkspace) {
      window.DroplabsWorkspace.showToast('Pro cloud sync & unlimited Whisper ($20/mo) launching soon.', '', '');
    }
  });

  document.addEventListener('DOMContentLoaded', render);
})();
