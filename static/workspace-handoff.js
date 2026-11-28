/* Shared Droplabs Workspace handoff (localStorage + IndexedDB), Adsterra loader, and legal modal. */
(function () {
  'use strict';

  var STORAGE_KEY = 'droplabs_workspace_v1';
  var CARDS_KEY = 'droplabs_cards_v1';
  var THEME_KEY = 'droplabs_ws_theme';
  var DB_NAME = 'droplabs_os_db';
  var DB_VERSION = 1;
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', ''];

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB === 'undefined') {
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve) {
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (ev) {
          var db = ev.target.result;
          if (!db.objectStoreNames.contains('blobs')) {
            db.createObjectStore('blobs', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('state')) {
            db.createObjectStore('state', { keyPath: 'key' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
      } catch (err) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  function idbGet(storeName, key) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, 'readonly');
          var req = tx.objectStore(storeName).get(key);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        } catch (err) {
          resolve(null);
        }
      });
    });
  }

  function idbPut(storeName, value) {
    return openDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).put(value);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (err) {
          resolve(false);
        }
      });
    });
  }

  function idbDelete(storeName, key) {
    return openDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).delete(key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (err) {
          resolve(false);
        }
      });
    });
  }

  function idbClearStore(storeName) {
    return openDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).clear();
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (err) {
          resolve(false);
        }
      });
    });
  }

  function putBlob(id, dataUrl) {
    if (!id || !dataUrl) return Promise.resolve(false);
    return idbPut('blobs', { id: id, dataUrl: dataUrl, updatedAt: Date.now() });
  }

  function getBlob(id) {
    if (!id) return Promise.resolve('');
    return idbGet('blobs', id).then(function (row) {
      return row && row.dataUrl ? row.dataUrl : '';
    });
  }

  function deleteBlob(id) {
    if (!id) return Promise.resolve(false);
    return idbDelete('blobs', id);
  }

  function readItems() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function readCardsSync() {
    try {
      var raw = localStorage.getItem(CARDS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function slimItemForLocalStorage(item) {
    var copy = Object.assign({}, item);
    if (copy.previewDataUrl && copy.previewDataUrl.length > 6000) {
      copy.hasBlob = true;
      delete copy.previewDataUrl;
    }
    return copy;
  }

  function writeItems(items) {
    var slim = items.map(slimItemForLocalStorage);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      syncBadge();
      idbPut('state', { key: 'vault', value: slim });
      return true;
    } catch (e) {
      try {
        var ultraSlim = slim.map(function (it) {
          var c = Object.assign({}, it);
          if (c.previewDataUrl) {
            c.hasBlob = true;
            delete c.previewDataUrl;
          }
          return c;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ultraSlim));
        syncBadge();
        idbPut('state', { key: 'vault', value: ultraSlim });
        return true;
      } catch (err2) {
        return false;
      }
    }
  }

  function saveCardsSync(cards) {
    var list = Array.isArray(cards) ? cards : [];
    idbPut('state', { key: 'cards', value: list });
    try {
      // Strip heavy snapshot payloads only if localStorage quota is tight
      localStorage.setItem(CARDS_KEY, JSON.stringify(list));
    } catch (e) {
      try {
        var compact = list.map(function (c) {
          var copy = Object.assign({}, c);
          if (Array.isArray(copy.snapshots) && copy.snapshots.length > 3) {
            copy.snapshots = copy.snapshots.slice(0, 3);
          }
          return copy;
        });
        localStorage.setItem(CARDS_KEY, JSON.stringify(compact));
      } catch (e2) {
        /* IndexedDB still persists full state */
      }
    }
    syncBadge();
    return list;
  }

  function syncBadge(explicitCount) {
    var badges = document.querySelectorAll('[data-ws-count]');
    var n = typeof explicitCount === 'number'
      ? explicitCount
      : (readItems().length + readCardsSync().length);
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
    }, 2600);
  }

  function saveItem(item, opts) {
    var items = readItems();
    var id = item.id || ('ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    var record = Object.assign({
      id: id,
      savedAt: new Date().toISOString(),
      note: ''
    }, item);

    if (record.sourceKey) {
      items = items.filter(function (existing) {
        if (existing.sourceKey === record.sourceKey) {
          if (existing.id && existing.id !== record.id) deleteBlob(existing.id);
          return false;
        }
        return true;
      });
    }

    if (record.previewDataUrl) {
      record.hasBlob = true;
      putBlob(record.id, record.previewDataUrl);
    }

    items.unshift(record);
    if (items.length > 150) {
      var dropped = items.slice(150);
      dropped.forEach(function (d) { if (d.id) deleteBlob(d.id); });
      items = items.slice(0, 150);
    }
    writeItems(items);
    var silent = opts && opts.silent;
    if (!silent && location.pathname !== '/workspace') {
      showToast('Saved to Workspace', '/workspace', 'Open Workspace →');
    }
    return record;
  }

  function removeItem(id) {
    var items = readItems().filter(function (it) { return it.id !== id; });
    deleteBlob(id);
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
    idbClearStore('blobs');
  }

  function clearEverything() {
    writeItems([]);
    saveCardsSync([]);
    idbClearStore('blobs');
    idbClearStore('state');
  }

  function loadWorkspaceState() {
    var lsVault = readItems();
    var lsCards = readCardsSync();

    return Promise.all([
      idbGet('state', 'vault'),
      idbGet('state', 'cards')
    ]).then(function (res) {
      var idbVault = res[0] && Array.isArray(res[0].value) ? res[0].value : [];
      var idbCards = res[1] && Array.isArray(res[1].value) ? res[1].value : [];

      // Merge localStorage vault items (e.g. saved from index.html) with IndexedDB vault
      var byId = {};
      var mergedVault = [];
      lsVault.concat(idbVault).forEach(function (it) {
        if (!it || !it.id) return;
        if (!byId[it.id]) {
          byId[it.id] = it;
          mergedVault.push(it);
        }
      });

      // Offload any legacy inline previewDataUrl > 6000 bytes into IndexedDB blobs
      var migrated = false;
      mergedVault = mergedVault.map(function (it) {
        if (it.previewDataUrl && it.previewDataUrl.length > 6000) {
          putBlob(it.id, it.previewDataUrl);
          migrated = true;
          return slimItemForLocalStorage(it);
        }
        return it;
      });
      if (migrated || (lsVault.length !== mergedVault.length && mergedVault.length > 0)) {
        writeItems(mergedVault);
      }

      var finalCards = idbCards.length >= lsCards.length ? idbCards : lsCards;

      // Hydrate vault items with their IndexedDB preview blobs
      return Promise.all(
        mergedVault.map(function (it) {
          if (it.previewDataUrl) return Promise.resolve(it);
          if (it.hasBlob || it.type === 'image') {
            return getBlob(it.id).then(function (dataUrl) {
              return dataUrl ? Object.assign({}, it, { previewDataUrl: dataUrl }) : it;
            });
          }
          return Promise.resolve(it);
        })
      ).then(function (hydratedVault) {
        return {
          vault: hydratedVault,
          cards: finalCards
        };
      });
    });
  }

  function getTheme() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      return t === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function setTheme(theme) {
    var next = theme === 'light' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* ignore */
    }
    return next;
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
      body: '<p>Droplabs does not require an account and does not use tracking cookies. We use Cloudflare Web Analytics, which is cookieless and reports only aggregate page views and performance data. The Image Compressor runs entirely in your browser, so your images never leave your device.</p><p>The Video Downloader resolves public media URLs and streams the file through our server so your browser can save it. Video-to-Text temporarily downloads the clip, strips the audio with FFmpeg, and sends that audio to Groq\'s Whisper API for transcription. Groq processes it under its own privacy policy. Temporary files are deleted when the request finishes.</p><p>We show ads through Adsterra. Adsterra and its partners may set cookies or similar technologies to measure and personalize ads.</p><p>Items saved to Workspace stay in your browser\'s localStorage and IndexedDB on this device. There is no cloud account or sync.</p>'
    },
    terms: {
      title: 'Terms of Service',
      body: '<p>Droplabs provides creator utilities for personal reference, accessibility, and content workflows. Only download or transcribe public media that you own or have permission to use, and respect each platform\'s terms and copyright laws.</p>'
    },
    dmca: {
      title: 'DMCA & Copyright',
      body: '<p>Droplabs does not host, index, or archive third-party media. The downloader resolves publicly accessible streams on demand, and temporary transcription audio is deleted immediately after processing.</p><p>For copyright or takedown requests, open an issue at <a href="https://github.com/itsdecoding/ig-downloader/issues" target="_blank" rel="noopener">github.com/itsdecoding/ig-downloader</a> with the URL and a description of your rights. We respond to valid notices.</p>'
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
    clearEverything: clearEverything,
    listCards: readCardsSync,
    saveCards: saveCardsSync,
    loadState: loadWorkspaceState,
    putBlob: putBlob,
    getBlob: getBlob,
    deleteBlob: deleteBlob,
    getTheme: getTheme,
    setTheme: setTheme,
    syncBadge: syncBadge,
    showToast: showToast,
    loadAd: loadAd
  };

  document.addEventListener('DOMContentLoaded', function () {
    syncBadge();
    setupLegalModal();
  });
})();
