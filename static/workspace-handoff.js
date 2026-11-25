/* Shared Droplabs Workspace handoff, Adsterra loader, and legal modal. */
(function () {
  'use strict';

  var STORAGE_KEY = 'droplabs_workspace_v1';
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', ''];

  function readItems() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeItems(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      syncBadge(items.length);
      return true;
    } catch (e) {
      // If a large image dataURL exceeded localStorage quota, strip previews and retry.
      try {
        var slim = items.map(function (it) {
          var copy = Object.assign({}, it);
          if (copy.previewDataUrl && copy.previewDataUrl.length > 20000) {
            delete copy.previewDataUrl;
          }
          return copy;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        syncBadge(slim.length);
        return true;
      } catch (err2) {
        return false;
      }
    }
  }

  function syncBadge(count) {
    var badges = document.querySelectorAll('[data-ws-count]');
    var n = typeof count === 'number' ? count : readItems().length;
    Array.prototype.forEach.call(badges, function (el) {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
  }

  function ensureToast() {
    var el = document.getElementById('dlToast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'dlToast';
    el.className = 'dl-toast';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }

  var toastTimer = null;
  function showToast(message, ctaHref, ctaLabel) {
    var el = ensureToast();
    el.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = message;
    el.appendChild(span);
    if (ctaHref) {
      var a = document.createElement('a');
      a.href = ctaHref;
      a.textContent = ctaLabel || 'Open Workspace →';
      el.appendChild(a);
    }
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
    }, 4200);
  }

  function saveItem(item) {
    var items = readItems();
    var id = item.id || ('ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    var record = Object.assign({
      id: id,
      savedAt: new Date().toISOString(),
      note: ''
    }, item);

    // Avoid duplicate saves for the same sourceKey in one session
    if (record.sourceKey) {
      items = items.filter(function (existing) {
        return existing.sourceKey !== record.sourceKey;
      });
    }
    items.unshift(record);
    if (items.length > 100) items = items.slice(0, 100);
    writeItems(items);
    showToast('Saved to Workspace', '/workspace', 'Open Workspace →');
    return record;
  }

  function removeItem(id) {
    var items = readItems().filter(function (it) { return it.id !== id; });
    writeItems(items);
    return items;
  }

  function updateNote(id, note) {
    var items = readItems().map(function (it) {
      if (it.id === id) return Object.assign({}, it, { note: note });
      return it;
    });
    writeItems(items);
  }

  function clearAll() {
    writeItems([]);
  }

  function loadAd() {
    var adSlot = document.getElementById('adSlot');
    var container = document.getElementById('container-18527c484b75598c40e3c7284aae8ee4');
    if (!adSlot || !container) return;
    if (LOCAL_HOSTS.indexOf(location.hostname) !== -1) return;

    adSlot.hidden = false;
    try {
      var s = document.createElement('script');
      s.async = true;
      s.setAttribute('data-cfasync', 'false');
      s.src = 'https://bellnewyork.org/21/18527c484b75598c40e3c7284aae8ee4';
      document.body.appendChild(s);
    } catch (e) {
      return;
    }

    var tries = 0;
    (function poll() {
      tries += 1;
      if (container.childElementCount > 0) return;
      if (tries >= 30) {
        adSlot.hidden = true;
        return;
      }
      setTimeout(poll, tries < 8 ? 250 : 800);
    })();
  }

  var LEGAL_COPY = {
    privacy: {
      title: 'Privacy Policy',
      body: '<p>Droplabs tools run without user accounts or tracking cookies. The Image Compressor processes images 100% locally in your browser tab without uploading files.</p><p>For Video Downloader and Video-to-Text, URLs or temporary audio clips are processed in memory/ephemeral temp folders solely to return your MP4 or transcript and are discarded immediately after the request completes.</p><p>Items you save with "Save to Workspace" are stored locally in your browser (localStorage) until you choose to sync to a cloud account.</p>'
    },
    terms: {
      title: 'Terms of Service',
      body: '<p>Droplabs provides creator utilities for personal reference, accessibility, and content workflows. Only download or transcribe public media that you own or have permission to use, and respect each platform\'s terms and copyright laws.</p>'
    },
    dmca: {
      title: 'DMCA & Copyright',
      body: '<p>Droplabs does not host, index, or archive third-party social media videos. Our downloader resolves publicly accessible media streams on demand, and temporary transcription audio is deleted immediately after processing.</p><p>For copyright inquiries, reach out via the contact details published on droplabs.site.</p>'
    }
  };

  function setupLegalModal() {
    var buttons = document.querySelectorAll('[data-legal]');
    if (!buttons.length) return;

    var backdrop = document.createElement('div');
    backdrop.className = 'legal-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML =
      '<div class="card legal-dialog" role="dialog" aria-modal="true" aria-labelledby="legalTitle">' +
      '  <div class="legal-head">' +
      '    <h3 id="legalTitle"></h3>' +
      '    <button type="button" class="btn btn-ghost btn-sm" id="legalClose">Close</button>' +
      '  </div>' +
      '  <div class="legal-body" id="legalBody"></div>' +
      '</div>';
    document.body.appendChild(backdrop);

    var titleEl = document.getElementById('legalTitle');
    var bodyEl = document.getElementById('legalBody');
    var closeBtn = document.getElementById('legalClose');

    function close() { backdrop.hidden = true; }
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !backdrop.hidden) close();
    });

    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-legal');
        var data = LEGAL_COPY[key];
        if (!data) return;
        titleEl.textContent = data.title;
        bodyEl.innerHTML = data.body;
        backdrop.hidden = false;
      });
    });
  }

  window.DroplabsWorkspace = {
    list: readItems,
    save: saveItem,
    remove: removeItem,
    updateNote: updateNote,
    clear: clearAll,
    syncBadge: syncBadge,
    showToast: showToast,
    loadAd: loadAd
  };

  document.addEventListener('DOMContentLoaded', function () {
    syncBadge();
    setupLegalModal();
  });
})();
