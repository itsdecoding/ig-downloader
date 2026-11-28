/* Droplabs Creator Workspace OS */
(function () {
  'use strict';

  var STAGES = [
    { id: 'Swipe', label: 'Swipe', dot: '#9ca3af' },
    { id: 'Scripting', label: 'Scripting', dot: '#f59e0b' },
    { id: 'Filming', label: 'Filming', dot: '#38bdf8' },
    { id: 'Editing', label: 'Editing', dot: '#ff7b47' },
    { id: 'Ready', label: 'Ready', dot: '#10b981' },
    { id: 'Posted', label: 'Posted', dot: '#059669' }
  ];

  var FORMATS = [
    'IG Reel',
    'IG Carousel',
    'TikTok',
    'YT Shorts',
    'X Thread',
    'LinkedIn',
    'YouTube Long'
  ];

  var DEFAULT_CHECKLIST = [
    { id: 'c1', text: 'Lock opening hook', done: false },
    { id: 'c2', text: 'Draft script / slides', done: false },
    { id: 'c3', text: 'Prep media & cover', done: false },
    { id: 'c4', text: 'Caption & publish check', done: false }
  ];

  var state = {
    view: 'overview',
    boardMode: 'kanban',
    boardFormat: 'All',
    boardQuery: '',
    mobileStage: 'All',
    vaultFilter: 'all',
    vaultQuery: '',
    calDate: new Date(),
    cards: [],
    vault: [],
    activeCardId: null,
    activeStudioTab: 'script',
    scriptViewMode: 'beats',
    groqActive: true,
    dragCardId: null
  };

  var $ = function (id) { return document.getElementById(id); };

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(u) {
    var s = String(u || '').trim();
    if (!s) return '';
    if (/^(https?:\/\/|\/api\/|data:image\/)/i.test(s)) return s;
    return '';
  }

  function nowIso() { return new Date().toISOString(); }

  function shortTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function formatDateYmd(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function wordCount(text) {
    var t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function readSeconds(text) {
    var w = wordCount(text);
    if (!w) return 0;
    return Math.max(2, Math.round((w / 135) * 60));
  }

  function stageDot(stageId) {
    var found = STAGES.filter(function (s) { return s.id === stageId; })[0];
    return found ? found.dot : '#9ca3af';
  }

  function toast(msg, href, cta) {
    if (window.DroplabsWorkspace) window.DroplabsWorkspace.showToast(msg, href, cta);
  }

  function autoSizeTitle() {
    var el = $('stTitle');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(26, el.scrollHeight) + 'px';
  }

  /* --------------------------------------------------------------- Theme */
  var SUN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var MOON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function applyTheme(theme) {
    var next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    var mc = $('metaThemeColor');
    if (mc) mc.setAttribute('content', next === 'light' ? '#F8F7F4' : '#08070b');
    var icon = $('themeIcon');
    var label = $('themeLabel');
    if (icon) icon.innerHTML = next === 'dark' ? SUN_SVG : MOON_SVG;
    if (label) label.textContent = next === 'dark' ? 'Light' : 'Dark';
    if (window.DroplabsWorkspace) window.DroplabsWorkspace.setTheme(next);
  }

  /* --------------------------------------------------------- Data & Sync */
  function persistCards() {
    if (window.DroplabsWorkspace) {
      window.DroplabsWorkspace.saveCards(state.cards);
    }
    syncHeaderCounts();
  }

  function syncHeaderCounts() {
    var bc = $('tabCountBoard');
    var vc = $('tabCountVault');
    if (bc) bc.textContent = String(state.cards.length);
    if (vc) vc.textContent = String(state.vault.length);
    if (window.DroplabsWorkspace) {
      window.DroplabsWorkspace.syncBadge(state.cards.length + state.vault.length);
    }
  }

  function normalizeCard(raw) {
    var slides = Array.isArray(raw.slides) ? raw.slides.slice() : [];
    var checklist = Array.isArray(raw.checklist) && raw.checklist.length
      ? raw.checklist.map(function (c, i) { return { id: c.id || ('chk_' + i), text: c.text || '', done: !!c.done }; })
      : DEFAULT_CHECKLIST.map(function (c) { return Object.assign({}, c); });
    return {
      id: raw.id || ('card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
      title: raw.title || 'Untitled',
      format: FORMATS.indexOf(raw.format) !== -1 ? raw.format : 'IG Reel',
      stage: STAGES.some(function (s) { return s.id === raw.stage; }) ? raw.stage : 'Swipe',
      priority: raw.priority || 'Medium',
      topic: raw.topic || '',
      dueDate: raw.dueDate || '',
      hook: raw.hook || '',
      body: raw.body || '',
      cta: raw.cta || '',
      slides: slides,
      caption: raw.caption || '',
      hashtags: raw.hashtags || '',
      notes: raw.notes || '',
      sourceUrl: raw.sourceUrl || '',
      thumbnail: raw.thumbnail || '',
      transcript: raw.transcript || '',
      hookAnalysis: raw.hookAnalysis || null,
      assetIds: Array.isArray(raw.assetIds) ? raw.assetIds.slice() : [],
      briefUrl: raw.briefUrl || '',
      finalUrl: raw.finalUrl || '',
      postedUrl: raw.postedUrl || '',
      linkedVaultId: raw.linkedVaultId || '',
      checklist: checklist,
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots.slice() : [],
      activities: Array.isArray(raw.activities) ? raw.activities.slice() : [{ text: 'Created', at: nowIso() }],
      createdAt: raw.createdAt || nowIso(),
      updatedAt: raw.updatedAt || nowIso()
    };
  }

  function getCard(id) {
    return state.cards.filter(function (c) { return c.id === id; })[0] || null;
  }

  function addActivity(card, text) {
    if (!card.activities) card.activities = [];
    card.activities.unshift({ text: text, at: nowIso() });
    if (card.activities.length > 25) card.activities = card.activities.slice(0, 25);
  }

  function saveSnapshot(card, label) {
    if (!card.snapshots) card.snapshots = [];
    card.snapshots.unshift({
      id: 'snap_' + Date.now(),
      label: label || 'Snapshot',
      at: nowIso(),
      title: card.title,
      hook: card.hook,
      body: card.body,
      cta: card.cta,
      slides: card.slides.slice(),
      caption: card.caption
    });
    if (card.snapshots.length > 12) card.snapshots = card.snapshots.slice(0, 12);
  }

  function createCard(data, openStudioAfter) {
    var card = normalizeCard(data || {});
    state.cards.unshift(card);
    persistCards();
    renderAll();
    if (openStudioAfter) openStudio(card.id);
    return card;
  }

  function cardThumbnail(card) {
    if (card.thumbnail) return safeUrl(card.thumbnail);
    if (card.assetIds && card.assetIds.length) {
      for (var i = 0; i < card.assetIds.length; i += 1) {
        var v = state.vault.filter(function (x) { return x.id === card.assetIds[i]; })[0];
        if (v && (v.previewDataUrl || v.thumbnail)) return safeUrl(v.previewDataUrl || v.thumbnail);
      }
    }
    return '';
  }

  /* -------------------------------------------------------- Render: Views */
  function setView(viewName) {
    state.view = viewName;
    var shell = document.querySelector('.ws-shell');
    if (shell) shell.setAttribute('data-active-view', viewName);

    var tabs = document.querySelectorAll('#wsViewTabs .ws-tab');
    Array.prototype.forEach.call(tabs, function (t) {
      var active = t.getAttribute('data-view') === viewName;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    var btabs = document.querySelectorAll('#mobileBottomNav .ws-bnav-btn[data-view]');
    Array.prototype.forEach.call(btabs, function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-view') === viewName);
    });

    $('viewOverview').hidden = viewName !== 'overview';
    $('viewBoard').hidden = viewName !== 'board';
    $('viewVault').hidden = viewName !== 'vault';
    $('viewCalendar').hidden = viewName !== 'calendar';
    renderActiveView();
  }

  function renderAll() {
    syncHeaderCounts();
    renderActiveView();
    if (state.activeCardId && !$('studioOverlay').hidden) {
      renderStudioRail();
    }
  }

  function renderActiveView() {
    if (state.view === 'overview') renderOverview();
    else if (state.view === 'board') renderBoard();
    else if (state.view === 'vault') renderVault();
    else if (state.view === 'calendar') renderCalendar();
  }

  function renderOverview() {
    var hasAny = state.cards.length > 0 || state.vault.length > 0;
    $('overviewPopulated').hidden = !hasAny;
    $('overviewEmpty').hidden = hasAny;
    if (!hasAny) return;

    var activeCount = state.cards.filter(function (c) {
      return c.stage === 'Scripting' || c.stage === 'Filming' || c.stage === 'Editing';
    }).length;
    var readyCount = state.cards.filter(function (c) { return c.stage === 'Ready'; }).length;
    var postedCount = state.cards.filter(function (c) { return c.stage === 'Posted'; }).length;

    var kpis = [
      { label: 'Pipeline', val: activeCount, view: 'board' },
      { label: 'Ready', val: readyCount, view: 'board' },
      { label: 'Posted', val: postedCount, view: 'board' },
      { label: 'Vault', val: state.vault.length, view: 'vault' }
    ];
    $('kpiGrid').innerHTML = kpis.map(function (k) {
      return '<button type="button" class="ws-kpi" data-jump-view="' + k.view + '">' +
        '<div class="ws-kpi-val">' + k.val + '</div>' +
        '<div class="ws-kpi-lbl">' + escapeHtml(k.label) + '</div>' +
        '</button>';
    }).join('');

    var inProg = state.cards.filter(function (c) {
      return c.stage === 'Scripting' || c.stage === 'Filming' || c.stage === 'Editing';
    });
    var queue = inProg.length ? inProg.slice(0, 4) : state.cards.slice(0, 4);
    $('continueList').innerHTML = queue.length
      ? queue.map(function (c) {
          return '<button type="button" class="ws-queue-row" data-open-card="' + escapeHtml(c.id) + '">' +
            '<div style="min-width:0">' +
            '  <div class="ws-queue-title">' + escapeHtml(c.title) + '</div>' +
            '  <div class="ws-queue-meta">' +
            '    <span class="ws-tag">' + escapeHtml(c.format) + '</span>' +
            '    <span class="ws-tag"><span class="ws-dot" style="background:' + stageDot(c.stage) + '"></span>' + escapeHtml(c.stage) + '</span>' +
            '  </div>' +
            '</div>' +
            '<span style="color:var(--ws-text-3);font-size:14px">→</span>' +
            '</button>';
        }).join('')
      : '<div class="ws-empty-mini">No active drafts</div>';

    $('readySummaryMeta').textContent = state.cards.length + ' total';
    var counts = FORMATS.map(function (f) {
      return { format: f, count: state.cards.filter(function (c) { return c.format === f; }).length };
    }).filter(function (r) { return r.count > 0; });
    if (!counts.length) counts = FORMATS.slice(0, 4).map(function (f) { return { format: f, count: 0 }; });
    var maxFmt = Math.max.apply(null, counts.map(function (x) { return x.count; }).concat([1]));
    $('formatBars').innerHTML = counts.map(function (r) {
      var pct = r.count ? Math.max(8, Math.round((r.count / maxFmt) * 100)) : 2;
      return '<div>' +
        '<div class="ws-bar-row-top"><span>' + escapeHtml(r.format) + '</span><span>' + r.count + '</span></div>' +
        '<div class="ws-bar-track"><div class="ws-bar-fill" style="width:' + pct + '%"></div></div>' +
        '</div>';
    }).join('');

    var recentVault = state.vault.slice(0, 4);
    $('recentVaultList').innerHTML = recentVault.length
      ? recentVault.map(function (v) {
          var thumb = safeUrl(v.previewDataUrl || v.thumbnail);
          var badge = v.type === 'transcript' ? 'Transcript' : v.type === 'image' ? 'Image' : (v.platform || 'Video');
          return '<div class="ws-mini-vault-row">' +
            (thumb
              ? '<img class="ws-mini-thumb" src="' + escapeHtml(thumb) + '" alt="" />'
              : '<div class="ws-mini-thumb" style="display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--ws-text-3)">' + escapeHtml(badge.slice(0, 3).toUpperCase()) + '</div>') +
            '<div class="ws-mini-info">' +
            '  <strong>' + escapeHtml(v.title || 'Saved asset') + '</strong>' +
            '  <span>' + escapeHtml(badge + (v.duration ? ' · ' + v.duration : '')) + '</span>' +
            '</div>' +
            '<button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-promote-vault="' + escapeHtml(v.id) + '">To Board</button>' +
            '</div>';
        }).join('')
      : '<div class="ws-empty-mini">No assets yet</div>';

    var dated = state.cards
      .filter(function (c) { return !!c.dueDate && c.stage !== 'Posted'; })
      .sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); })
      .slice(0, 4);
    $('upcomingDatesList').innerHTML = dated.length
      ? dated.map(function (c) {
          return '<button type="button" class="ws-queue-row" data-open-card="' + escapeHtml(c.id) + '">' +
            '<div style="min-width:0">' +
            '  <div class="ws-queue-title">' + escapeHtml(c.title) + '</div>' +
            '  <div class="ws-queue-meta"><span class="ws-tag">' + escapeHtml(c.format) + '</span></div>' +
            '</div>' +
            '<span class="ws-tag is-accent">' + escapeHtml(c.dueDate) + '</span>' +
            '</button>';
        }).join('')
      : '<div class="ws-empty-mini">No scheduled dates</div>';
  }

  function filteredBoardCards() {
    var q = state.boardQuery.trim().toLowerCase();
    return state.cards.filter(function (c) {
      if (state.boardFormat !== 'All' && c.format !== state.boardFormat) return false;
      if (q) {
        var hay = [c.title, c.topic, c.hook, c.body, c.caption, c.hashtags].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderBoard() {
    // Desktop format chips
    $('boardFormatChips').innerHTML = ['All'].concat(FORMATS).map(function (f) {
      var active = state.boardFormat === f;
      return '<button type="button" class="ws-chip' + (active ? ' is-active' : '') + '" data-board-fmt="' + escapeHtml(f) + '">' + escapeHtml(f) + '</button>';
    }).join('');

    // Mobile format select + stage pills
    var mFmtSel = $('mobileFormatSelect');
    if (mFmtSel) {
      mFmtSel.innerHTML = ['All'].concat(FORMATS).map(function (f) {
        var label = f === 'All' ? 'All Formats' : f;
        return '<option value="' + escapeHtml(f) + '"' + (state.boardFormat === f ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
      }).join('');
    }

    var cards = filteredBoardCards();

    var stageStrip = $('mobileStageStrip');
    if (stageStrip) {
      var stripItems = [{ id: 'All', label: 'All', dot: '', count: cards.length }].concat(
        STAGES.map(function (s) {
          return { id: s.id, label: s.label, dot: s.dot, count: cards.filter(function (c) { return c.stage === s.id; }).length };
        })
      );
      stageStrip.innerHTML = stripItems.map(function (st) {
        var act = state.mobileStage === st.id;
        return '<button type="button" class="ws-stage-pill' + (act ? ' is-active' : '') + '" data-mobile-stage="' + escapeHtml(st.id) + '">' +
          (st.dot ? '<span class="ws-dot" style="background:' + st.dot + '"></span>' : '') +
          '<span>' + escapeHtml(st.label) + '</span>' +
          '<span style="opacity:.6">' + st.count + '</span>' +
          '</button>';
      }).join('');
    }

    // Mobile clean vertical cards list
    var mCardsWrap = $('mobileBoardCards');
    if (mCardsWrap) {
      var mCards = state.mobileStage === 'All'
        ? cards
        : cards.filter(function (c) { return c.stage === state.mobileStage; });
      mCardsWrap.innerHTML = mCards.length
        ? '<div class="ws-panel" style="padding:4px 12px">' +
          mCards.map(function (c) {
            var thumb = cardThumbnail(c);
            var sub = [c.format, c.priority, c.dueDate ? c.dueDate.slice(5) : ''].filter(Boolean).join(' · ');
            var stageOpts = STAGES.map(function (s) {
              return '<option value="' + escapeHtml(s.id) + '"' + (s.id === c.stage ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>';
            }).join('');
            return '<div class="ws-mcard" data-card-id="' + escapeHtml(c.id) + '">' +
              (thumb ? '<img class="ws-mcard-thumb" src="' + escapeHtml(thumb) + '" alt="" loading="lazy" />' : '') +
              '<div class="ws-mcard-main">' +
              '  <div class="ws-mcard-title">' + escapeHtml(c.title) + '</div>' +
              '  <div class="ws-mcard-sub"><span>' + escapeHtml(sub) + '</span></div>' +
              '</div>' +
              '<select class="ws-stage-select" data-move-stage="' + escapeHtml(c.id) + '" aria-label="Move stage">' + stageOpts + '</select>' +
              '</div>';
          }).join('') +
          '</div>'
        : '<div class="ws-empty ws-empty-compact"><h2>No cards here</h2><p>Tap + to add one.</p></div>';
    }

    // Desktop Kanban / List
    var isKanban = state.boardMode === 'kanban';
    $('kanbanBoard').hidden = !isKanban;
    $('boardListView').hidden = isKanban;

    if (isKanban) {
      $('kanbanBoard').innerHTML = STAGES.map(function (col) {
        var colCards = cards.filter(function (c) { return c.stage === col.id; });
        var cardsHtml = colCards.map(function (c) {
          var thumb = cardThumbnail(c);
          var prioCls = 'ws-prio-' + String(c.priority || 'Medium').toLowerCase();
          var metaChips = [];
          if (c.slides && c.slides.length) metaChips.push(c.slides.length + ' slides');
          else if (c.body || c.hook) metaChips.push(readSeconds(c.hook + ' ' + c.body) + 's');
          if (c.hookAnalysis && c.hookAnalysis.hook_pattern) metaChips.push('Hook ✓');
          if (c.dueDate) metaChips.push(c.dueDate.slice(5));

          var stageOpts = STAGES.map(function (s) {
            return '<option value="' + escapeHtml(s.id) + '"' + (s.id === c.stage ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>';
          }).join('');

          return '<article class="ws-kcard" draggable="true" data-card-id="' + escapeHtml(c.id) + '">' +
            (thumb ? '<img class="ws-kcard-thumb" src="' + escapeHtml(thumb) + '" alt="" loading="lazy" />' : '') +
            '<div class="ws-kcard-top">' +
            '  <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
            '    <span class="ws-tag">' + escapeHtml(c.format) + '</span>' +
            '    <span class="ws-tag ' + prioCls + '">' + escapeHtml(c.priority || 'Medium') + '</span>' +
            '  </div>' +
            '  <button type="button" class="ws-kcard-del" data-del-card="' + escapeHtml(c.id) + '" title="Delete card" aria-label="Delete card">✕</button>' +
            '</div>' +
            '<h3 class="ws-kcard-title">' + escapeHtml(c.title) + '</h3>' +
            '<div class="ws-kcard-foot">' +
            '  <div class="ws-kcard-chips">' +
            metaChips.slice(0, 2).map(function (m) { return '<span class="ws-tag">' + escapeHtml(m) + '</span>'; }).join('') +
            '  </div>' +
            '  <select class="ws-stage-select" data-move-stage="' + escapeHtml(c.id) + '" aria-label="Move stage">' + stageOpts + '</select>' +
            '</div>' +
            '</article>';
        }).join('');

        return '<div class="ws-col" data-stage-col="' + escapeHtml(col.id) + '">' +
          '<div class="ws-col-head">' +
          '  <div class="ws-col-title">' +
          '    <span class="ws-dot" style="background:' + col.dot + '"></span>' +
          '    <span>' + escapeHtml(col.label) + '</span>' +
          '    <span class="ws-col-count">' + colCards.length + '</span>' +
          '  </div>' +
          '  <button type="button" class="ws-col-add" data-add-stage="' + escapeHtml(col.id) + '" title="Add to ' + escapeHtml(col.label) + '">+</button>' +
          '</div>' +
          cardsHtml +
          '</div>';
      }).join('');
    } else {
      $('boardListView').innerHTML = cards.length
        ? cards.map(function (c) {
            return '<div class="ws-list-row" data-card-id="' + escapeHtml(c.id) + '">' +
              '<div class="ws-list-title">' + escapeHtml(c.title) + '</div>' +
              '<span class="ws-tag ws-list-hide-sm">' + escapeHtml(c.format) + '</span>' +
              '<span class="ws-tag"><span class="ws-dot" style="background:' + stageDot(c.stage) + '"></span>' + escapeHtml(c.stage) + '</span>' +
              '<span class="ws-tag ws-list-hide-sm">' + escapeHtml(c.priority || 'Medium') + '</span>' +
              '<span class="ws-muted-meta ws-list-hide-sm">' + escapeHtml(c.dueDate || 'No date') + '</span>' +
              '</div>';
          }).join('')
        : '<div class="ws-empty ws-empty-compact"><h2>No matching cards</h2><p>Adjust filters or add a card.</p></div>';
    }
  }

  function renderVault() {
    var q = state.vaultQuery.trim().toLowerCase();
    var filtered = state.vault.filter(function (v) {
      if (state.vaultFilter !== 'all' && v.type !== state.vaultFilter) return false;
      if (q) {
        var hay = [v.title, v.platform, v.author, v.plainText, v.caption, v.note].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    $('vaultEmpty').hidden = filtered.length > 0;
    $('vaultGrid').innerHTML = filtered.map(function (v) {
      var thumb = safeUrl(v.previewDataUrl || v.thumbnail);
      var badge = v.type === 'video' ? (v.platform || 'Video') : v.type === 'transcript' ? 'Transcript' : 'Image';
      var meta = '';
      var snippet = '';
      if (v.type === 'video') {
        meta = [v.author ? '@' + String(v.author).replace(/^@/, '') : '', v.quality, v.duration].filter(Boolean).join(' · ');
        snippet = v.caption || '';
      } else if (v.type === 'transcript') {
        meta = [v.language ? v.language.toUpperCase() : '', v.duration].filter(Boolean).join(' · ');
        snippet = v.timestampedText || v.plainText || '';
      } else if (v.type === 'image') {
        meta = [v.dims, v.format, (v.originalSize && v.compressedSize) ? (v.originalSize + ' → ' + v.compressedSize) : ''].filter(Boolean).join(' · ');
      }

      var actions = '<button type="button" class="ws-btn ws-btn-accent-soft ws-btn-sm" data-promote-vault="' + escapeHtml(v.id) + '">To Board</button>';
      if (v.type === 'transcript') {
        actions += '<button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-copy-vault="' + escapeHtml(v.id) + '">Copy</button>';
      }
      if (v.type === 'image' && thumb) {
        actions += '<a class="ws-btn ws-btn-ghost ws-btn-sm" href="' + escapeHtml(thumb) + '" download="' + escapeHtml(v.title || 'image') + '">Save</a>';
      }
      if (v.sourceUrl) {
        if (v.type === 'video') {
          actions += '<a class="ws-btn ws-btn-ghost ws-btn-sm" href="/api/video/audio?url=' + encodeURIComponent(v.sourceUrl) + '">MP3</a>';
          actions += '<a class="ws-btn ws-btn-ghost ws-btn-sm" href="/tools/video-to-text?url=' + encodeURIComponent(v.sourceUrl) + '">Transcribe</a>';
        }
        actions += '<a class="ws-btn ws-btn-ghost ws-btn-sm" href="' + escapeHtml(safeUrl(v.sourceUrl)) + '" target="_blank" rel="noopener">↗</a>';
      }

      return '<article class="ws-vcard">' +
        '<div class="ws-kcard-top">' +
        '  <span class="ws-tag is-accent">' + escapeHtml(badge) + '</span>' +
        '  <button type="button" class="ws-kcard-del" data-del-vault="' + escapeHtml(v.id) + '" aria-label="Remove item">✕</button>' +
        '</div>' +
        (thumb ? '<img class="ws-vcard-thumb" src="' + escapeHtml(thumb) + '" alt="" loading="lazy" />' : '') +
        '<h3 class="ws-vcard-title">' + escapeHtml(v.title || 'Saved asset') + '</h3>' +
        (meta ? '<div class="ws-vcard-meta">' + escapeHtml(meta) + '</div>' : '') +
        (v.hookAnalysis && v.hookAnalysis.hook_pattern
          ? '<span class="ws-tag is-accent" style="align-self:flex-start">' + escapeHtml(v.hookAnalysis.hook_pattern) + '</span>'
          : '') +
        (snippet ? '<div class="ws-vcard-snippet">' + escapeHtml(snippet) + '</div>' : '') +
        '<div class="ws-vcard-actions">' + actions + '</div>' +
        '</article>';
    }).join('');
  }

  function renderCalendar() {
    var d = state.calDate;
    var year = d.getFullYear();
    var month = d.getMonth();
    $('calMonthLabel').textContent = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    var firstDay = new Date(year, month, 1);
    var startOffset = firstDay.getDay();
    var gridStart = new Date(year, month, 1 - startOffset);
    var todayYmd = formatDateYmd(new Date());

    var cellsHtml = '';
    var agendaItems = [];

    for (var i = 0; i < 42; i += 1) {
      var cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      var ymd = formatDateYmd(cellDate);
      var isMuted = cellDate.getMonth() !== month;
      var isToday = ymd === todayYmd;
      var dayCards = state.cards.filter(function (c) { return c.dueDate === ymd; });

      if (!isMuted && dayCards.length) {
        agendaItems.push({ ymd: ymd, label: cellDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), cards: dayCards });
      }

      cellsHtml += '<div class="ws-cal-cell' + (isMuted ? ' is-muted' : '') + (isToday ? ' is-today' : '') + '" data-cal-day="' + ymd + '">' +
        '<span class="ws-cal-day">' + cellDate.getDate() + '</span>' +
        dayCards.slice(0, 3).map(function (c) {
          return '<button type="button" class="ws-cal-pill" data-open-card="' + escapeHtml(c.id) + '">' + escapeHtml(c.title) + '</button>';
        }).join('') +
        (dayCards.length > 3 ? '<span class="ws-muted-meta">+' + (dayCards.length - 3) + '</span>' : '') +
        '</div>';
    }
    $('calGrid').innerHTML = cellsHtml;

    $('calAgenda').innerHTML = agendaItems.length
      ? agendaItems.map(function (grp) {
          return '<div>' +
            '<div class="ws-muted-meta" style="margin:6px 0 4px">' + escapeHtml(grp.label) + '</div>' +
            '<div class="ws-queue">' +
            grp.cards.map(function (c) {
              return '<button type="button" class="ws-queue-row" data-open-card="' + escapeHtml(c.id) + '">' +
                '<span class="ws-queue-title">' + escapeHtml(c.title) + '</span>' +
                '<span class="ws-tag">' + escapeHtml(c.format) + '</span>' +
                '</button>';
            }).join('') +
            '</div></div>';
        }).join('')
      : '<div class="ws-empty-mini">No scheduled cards this month.</div>';

    var unscheduled = state.cards.filter(function (c) { return !c.dueDate && c.stage !== 'Posted'; });
    $('unscheduledCount').textContent = String(unscheduled.length);
    $('unscheduledList').innerHTML = unscheduled.length
      ? unscheduled.map(function (c) {
          return '<div class="ws-unsched-item">' +
            '<strong>' + escapeHtml(c.title) + '</strong>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">' +
            '  <span class="ws-tag">' + escapeHtml(c.format) + '</span>' +
            '  <input type="date" class="ws-unsched-date" data-sched-card="' + escapeHtml(c.id) + '" aria-label="Schedule ' + escapeHtml(c.title) + '" />' +
            '</div></div>';
        }).join('')
      : '<div class="ws-empty-mini">Everything active is scheduled.</div>';
  }

  /* ---------------------------------------------------------- Studio Modal */
  function populateSelectOptions(sel, items, selectedVal) {
    sel.innerHTML = items.map(function (it) {
      var val = typeof it === 'string' ? it : it.id;
      var lbl = typeof it === 'string' ? it : it.label;
      return '<option value="' + escapeHtml(val) + '"' + (val === selectedVal ? ' selected' : '') + '>' + escapeHtml(lbl) + '</option>';
    }).join('');
  }

  function openStudio(cardId) {
    var card = getCard(cardId);
    if (!card) return;
    state.activeCardId = card.id;

    $('stTitle').value = card.title || '';
    populateSelectOptions($('stFormat'), FORMATS, card.format);
    populateSelectOptions($('stStage'), STAGES, card.stage);
    $('stPriority').value = card.priority || 'Medium';
    $('stTopic').value = card.topic || '';
    $('stDueDate').value = card.dueDate || '';

    $('stHook').value = card.hook || '';
    $('stBody').value = card.body || '';
    $('stCta').value = card.cta || '';
    $('stCaption').value = card.caption || '';
    $('stHashtags').value = card.hashtags || '';
    $('stSourceUrl').value = card.sourceUrl || '';
    $('stTranscript').value = card.transcript || '';
    $('stBriefUrl').value = card.briefUrl || '';
    $('stFinalUrl').value = card.finalUrl || '';
    $('stPostedUrl').value = card.postedUrl || '';
    $('stNotes').value = card.notes || '';
    $('studioAiTray').hidden = true;
    $('studioAiTray').innerHTML = '';
    $('studioIntelStatus').hidden = true;
    if ($('studioMoreMenu')) $('studioMoreMenu').hidden = true;

    var preferSlides = (card.format === 'IG Carousel' || card.format === 'X Thread') && card.slides.length > 0;
    setScriptViewMode(preferSlides ? 'slides' : 'beats');
    setStudioTab('script');
    renderSlides(card);
    renderHookIntel(card);
    renderStudioAssets(card);
    renderStudioRail();
    updateScriptStats();

    $('studioOverlay').hidden = false;
    setTimeout(autoSizeTitle, 0);
  }

  function closeStudio() {
    $('studioOverlay').hidden = true;
    state.activeCardId = null;
    renderAll();
  }

  function setStudioTab(tab) {
    state.activeStudioTab = tab;
    Array.prototype.forEach.call(document.querySelectorAll('#studioTabs .ws-stab'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-stab') === tab);
    });
    $('stabScript').hidden = tab !== 'script';
    $('stabIntel').hidden = tab !== 'intel';
    $('stabAssets').hidden = tab !== 'assets';
  }

  function setScriptViewMode(mode) {
    state.scriptViewMode = mode;
    Array.prototype.forEach.call(document.querySelectorAll('#scriptViewMode button'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-smode') === mode);
    });
    $('beatsEditor').hidden = mode !== 'beats';
    $('slidesEditor').hidden = mode !== 'slides';
  }

  function updateScriptStats() {
    var hookW = wordCount($('stHook').value);
    var bodySec = readSeconds($('stHook').value + ' ' + $('stBody').value + ' ' + $('stCta').value);
    var totalW = wordCount($('stHook').value + ' ' + $('stBody').value + ' ' + $('stCta').value);
    $('hookPulseStat').textContent = hookW + ' words' + (hookW > 18 ? ' · trim' : hookW > 0 ? ' · crisp' : '');
    $('bodyReadStat').textContent = '~' + bodySec + 's · ' + totalW + ' words';
  }

  function renderSlides(card) {
    var displaySlides = card.slides && card.slides.length ? card.slides : [''];
    $('slidesList').innerHTML = displaySlides.map(function (txt, idx) {
      return '<div class="ws-slide-card">' +
        '<div class="ws-slide-head">' +
        '  <span>Slide ' + (idx + 1) + (idx === 0 ? ' · Cover' : '') + '</span>' +
        '  <div class="ws-slide-btns">' +
        '    <span class="ws-muted-meta">' + String(txt || '').length + ' ch</span>' +
        (idx > 0 ? '<button type="button" data-slide-up="' + idx + '" title="Move up">↑</button>' : '') +
        (displaySlides.length > 1 ? '<button type="button" data-slide-del="' + idx + '" title="Delete slide">✕</button>' : '') +
        '  </div>' +
        '</div>' +
        '<textarea rows="2" data-slide-idx="' + idx + '" placeholder="' + (idx === 0 ? 'Cover headline...' : 'Slide ' + (idx + 1) + ' copy...') + '">' + escapeHtml(txt) + '</textarea>' +
        '</div>';
    }).join('');
  }

  function renderHookIntel(card) {
    var box = $('studioHookIntel');
    var ha = card.hookAnalysis;
    if (!ha || !ha.hook_pattern) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var remixHtml = (ha.remix_hooks || []).map(function (line) {
      return '<div class="ws-remix-row">' +
        '<span>' + escapeHtml(line) + '</span>' +
        '<button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-use-hook="' + escapeHtml(line) + '">Use</button>' +
        '</div>';
    }).join('');
    var outlineHtml = (ha.outline || []).map(function (o) {
      return '<span class="ws-tag">' + escapeHtml(o) + '</span>';
    }).join('');

    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '  <span class="ws-tag is-accent">' + escapeHtml(ha.hook_pattern) + '</span>' +
      '</div>' +
      (ha.why_it_works ? '<p>' + escapeHtml(ha.why_it_works) + '</p>' : '') +
      (outlineHtml ? '<div style="display:flex;flex-wrap:wrap;gap:5px">' + outlineHtml + '</div>' : '') +
      (remixHtml ? '<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">' + remixHtml + '</div>' : '');
    box.hidden = false;
  }

  function renderStudioAssets(card) {
    var items = [];
    if (card.thumbnail) {
      items.push({ id: '__thumb__', title: 'Reference Cover', src: safeUrl(card.thumbnail), removable: false });
    }
    (card.assetIds || []).forEach(function (aid) {
      var v = state.vault.filter(function (x) { return x.id === aid; })[0];
      if (!v) return;
      var src = safeUrl(v.previewDataUrl || v.thumbnail);
      if (src) items.push({ id: v.id, title: v.title || 'Asset', src: src, removable: true });
    });

    $('attachedAssetsGrid').innerHTML = items.length
      ? items.map(function (it) {
          return '<div class="ws-att-card">' +
            '<img src="' + escapeHtml(it.src) + '" alt="" />' +
            '<div class="ws-att-foot">' +
            '  <span>' + escapeHtml(it.title) + '</span>' +
            (it.removable ? '<button type="button" class="ws-link-btn" data-detach-asset="' + escapeHtml(it.id) + '">✕</button>' : '') +
            '</div></div>';
        }).join('')
      : '<div class="ws-empty-mini" style="grid-column:1/-1">No attached assets</div>';

    var links = $('studioVideoLinks');
    var srcUrl = safeUrl(card.sourceUrl);
    if (srcUrl) {
      links.innerHTML =
        '<a class="ws-btn ws-btn-ghost ws-btn-sm" href="' + escapeHtml(srcUrl) + '" target="_blank" rel="noopener">Source ↗</a>' +
        '<a class="ws-btn ws-btn-ghost ws-btn-sm" href="/api/video/audio?url=' + encodeURIComponent(srcUrl) + '">MP3</a>' +
        (card.thumbnail && card.thumbnail.indexOf('/api/thumbnail') !== -1
          ? '<a class="ws-btn ws-btn-ghost ws-btn-sm" href="' + escapeHtml(safeUrl(card.thumbnail)) + '&download=1">Cover</a>'
          : '');
      links.hidden = false;
    } else {
      links.hidden = true;
      links.innerHTML = '';
    }
  }

  function renderStudioRail() {
    var card = getCard(state.activeCardId);
    if (!card) return;

    $('studioSnapCount').textContent = String((card.snapshots || []).length);
    var mobHist = $('studioMobileHistory');
    if (mobHist) mobHist.textContent = 'Snapshots (' + (card.snapshots || []).length + ')';

    var checks = [
      { label: 'Hook', ok: !!card.hook.trim() || (card.slides && card.slides.length > 0 && !!card.slides[0].trim()) },
      { label: 'Script', ok: !!card.body.trim() || (card.slides && card.slides.length > 1) },
      { label: 'CTA', ok: !!card.cta.trim() },
      { label: 'Caption', ok: !!card.caption.trim() },
      { label: 'Assets', ok: !!(card.thumbnail || card.assetIds.length || card.finalUrl) }
    ];
    var doneCount = checks.filter(function (c) { return c.ok; }).length;
    $('readinessLabel').textContent = doneCount + '/5';
    $('readinessBar').style.width = Math.round((doneCount / 5) * 100) + '%';
    $('readinessPills').innerHTML = checks.map(function (c) {
      return '<span class="ws-ready-pill' + (c.ok ? ' is-done' : '') + '">' + (c.ok ? '✓ ' : '') + escapeHtml(c.label) + '</span>';
    }).join('');

    $('studioChecklist').innerHTML = (card.checklist || []).map(function (item) {
      return '<div class="ws-check-item' + (item.done ? ' is-done' : '') + '">' +
        '<label><input type="checkbox" data-check-id="' + escapeHtml(item.id) + '"' + (item.done ? ' checked' : '') + ' /><span>' + escapeHtml(item.text) + '</span></label>' +
        '<button type="button" class="ws-kcard-del" data-del-check="' + escapeHtml(item.id) + '" aria-label="Remove task">✕</button>' +
        '</div>';
    }).join('');

    $('studioActivity').innerHTML = (card.activities || []).slice(0, 8).map(function (a) {
      return '<div class="ws-act-item"><span>' + escapeHtml(a.text) + '</span><time>' + escapeHtml(shortTime(a.at)) + '</time></div>';
    }).join('');
  }

  function markStudioSaved() {
    var el = $('studioSaveState');
    if (el) el.textContent = 'Saved';
  }

  function updateActiveCardField(field, val, activityLabel) {
    var card = getCard(state.activeCardId);
    if (!card) return;
    card[field] = val;
    card.updatedAt = nowIso();
    if (activityLabel) addActivity(card, activityLabel);
    persistCards();
    markStudioSaved();
    renderStudioRail();
  }

  /* ---------------------------------------------------------- AI Workflows */
  async function callWorkspaceAi(payload) {
    var resp = await fetch('/api/workspace/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) throw new Error(data.detail || 'AI request failed.');
    return data;
  }

  function buildSourceContext(card) {
    var parts = [];
    if (card.hook) parts.push('Hook: ' + card.hook);
    if (card.body) parts.push(card.body);
    if (card.slides && card.slides.length) parts.push(card.slides.join('\n'));
    if (card.transcript) parts.push('Transcript:\n' + card.transcript);
    if (card.notes) parts.push('Notes: ' + card.notes);
    return parts.join('\n\n');
  }

  async function runStudioHooks() {
    var card = getCard(state.activeCardId);
    if (!card) return;
    var btn = $('aiHooksBtn');
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    try {
      var res = await callWorkspaceAi({
        mode: 'hooks',
        title: card.title,
        source_text: buildSourceContext(card),
        target_format: card.format,
        topic: card.topic,
        hook_pattern: card.hookAnalysis ? card.hookAnalysis.hook_pattern : ''
      });
      var tray = $('studioAiTray');
      var hooks = res.hooks || [];
      tray.innerHTML = hooks.map(function (h) {
        return '<div class="ws-ai-hook-item">' +
          '<div><strong>' + escapeHtml(h.angle) + '</strong><span>' + escapeHtml(h.line) + '</span></div>' +
          '<button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-use-hook="' + escapeHtml(h.line) + '">Use</button>' +
          '</div>';
      }).join('');
      tray.hidden = hooks.length === 0;
      addActivity(card, 'Generated 5 AI hooks');
      persistCards();
      renderStudioRail();
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = !state.groqActive;
      btn.textContent = '5 AI Hooks';
    }
  }

  async function runStudioPolishOrFormat(mode, targetFormat) {
    var card = getCard(state.activeCardId);
    if (!card) return;
    var btn = mode === 'polish' ? $('aiPolishBtn') : $('aiBuildSlidesBtn');
    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Working…';
    try {
      saveSnapshot(card, 'Before AI ' + mode);
      var res = await callWorkspaceAi({
        mode: mode,
        title: card.title,
        source_text: buildSourceContext(card),
        target_format: targetFormat || card.format,
        topic: card.topic,
        hook_pattern: card.hookAnalysis ? card.hookAnalysis.hook_pattern : ''
      });
      if (res.title && !card.title) { card.title = res.title; $('stTitle').value = res.title; autoSizeTitle(); }
      if (res.hook) { card.hook = res.hook; $('stHook').value = res.hook; }
      if (res.body) { card.body = res.body; $('stBody').value = res.body; }
      if (res.cta) { card.cta = res.cta; $('stCta').value = res.cta; }
      if (res.caption) { card.caption = res.caption; $('stCaption').value = res.caption; }
      if (res.hashtags) { card.hashtags = res.hashtags; $('stHashtags').value = res.hashtags; }
      if (Array.isArray(res.slides) && res.slides.length) {
        card.slides = res.slides;
        renderSlides(card);
        if (card.format === 'IG Carousel' || card.format === 'X Thread') {
          setScriptViewMode('slides');
        }
      }
      addActivity(card, mode === 'polish' ? 'Polished draft via AI' : 'Formatted with AI');
      card.updatedAt = nowIso();
      persistCards();
      updateScriptStats();
      renderStudioRail();
      toast('Draft updated');
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = !state.groqActive;
      btn.textContent = origText;
    }
  }

  /* --------------------------------------------------- Quick Capture / URL */
  function setCaptureStatus(msg, isError, loading) {
    var el = $('captureStatus');
    if (!msg) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.className = 'ws-capture-status' + (isError ? ' is-error' : '');
    el.innerHTML = (loading ? '<span class="spinner" aria-hidden="true"></span>' : '') + '<span>' + escapeHtml(msg) + '</span>';
    el.hidden = false;
  }

  async function captureUrl(withAiBrief) {
    var url = ($('quickUrlInput').value || '').trim();
    if (!url) {
      setCaptureStatus('Paste an Instagram, TikTok, or YouTube Shorts link first.', true, false);
      $('quickUrlInput').focus();
      return;
    }
    $('captureClipBtn').disabled = true;
    $('captureBriefBtn').disabled = true;
    setCaptureStatus('Extracting clip…', false, true);

    try {
      var extResp = await fetch('/api/video/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      var media = await extResp.json().catch(function () { return {}; });
      if (!extResp.ok) throw new Error(media.detail || 'Could not extract that link.');

      var plat = media.platform === 'youtube' ? 'YT Shorts' : media.platform === 'tiktok' ? 'TikTok' : 'IG Reel';
      var vaultItem = window.DroplabsWorkspace.save({
        type: 'video',
        sourceKey: 'video:' + (media.source_url || media.id),
        platform: media.platform === 'youtube' ? 'YouTube Shorts' : media.platform === 'tiktok' ? 'TikTok' : 'Instagram',
        title: media.title || 'Captured Video',
        author: media.author || '',
        quality: media.quality || 'HD',
        duration: media.duration_str || '',
        sourceUrl: media.source_url || url,
        thumbnail: media.thumbnail_proxy || media.thumbnail || '',
        caption: media.caption || ''
      }, { silent: true });
      state.vault = window.DroplabsWorkspace.list();
      syncHeaderCounts();

      if (!withAiBrief) {
        $('quickUrlInput').value = '';
        setCaptureStatus('', false, false);
        renderAll();
        toast('Clip saved to Vault');
        return;
      }

      var txText = '';
      var hookData = null;
      if (state.groqActive) {
        setCaptureStatus('Transcribing speech…', false, true);
        var fd = new FormData();
        fd.append('url', media.source_url || url);
        fd.append('language', 'auto');
        var txResp = await fetch('/api/transcribe', { method: 'POST', body: fd });
        if (txResp.ok) {
          var tx = await txResp.json().catch(function () { return {}; });
          txText = (tx.segments && tx.segments.length)
            ? tx.segments.map(function (s) { return '[' + s.start_str + '] ' + s.text; }).join('\n')
            : (tx.text || '');

          if (tx.text && tx.text.length >= 12) {
            setCaptureStatus('Analyzing hook…', false, true);
            var hkResp = await fetch('/api/analyze-transcript', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcript: tx.text, title: media.title || '' })
            });
            if (hkResp.ok) hookData = await hkResp.json().catch(function () { return null; });
          }
        }
      }

      $('quickUrlInput').value = '';
      setCaptureStatus('', false, false);
      createCard({
        title: media.title || 'Captured Clip',
        format: plat,
        stage: txText ? 'Scripting' : 'Swipe',
        sourceUrl: media.source_url || url,
        thumbnail: media.thumbnail_proxy || media.thumbnail || '',
        caption: media.caption || '',
        transcript: txText,
        hookAnalysis: hookData,
        hook: (hookData && hookData.remix_hooks && hookData.remix_hooks[0]) || '',
        body: (hookData && Array.isArray(hookData.outline)) ? hookData.outline.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') : '',
        linkedVaultId: vaultItem.id,
        assetIds: [vaultItem.id],
        activities: [{ text: txText ? 'Captured & analyzed via AI' : 'Captured from URL', at: nowIso() }]
      }, true);
    } catch (err) {
      setCaptureStatus(err.message, true, false);
    } finally {
      $('captureClipBtn').disabled = false;
      $('captureBriefBtn').disabled = !state.groqActive;
    }
  }

  /* --------------------------------------------------- Promote Vault Item */
  function promoteVaultToCard(vaultId) {
    var v = state.vault.filter(function (x) { return x.id === vaultId; })[0];
    if (!v) return;
    var existing = state.cards.filter(function (c) { return c.linkedVaultId === v.id; })[0];
    if (existing) {
      openStudio(existing.id);
      return;
    }

    var fmt = 'IG Reel';
    if (v.platform && /tiktok/i.test(v.platform)) fmt = 'TikTok';
    else if (v.platform && /youtube|shorts/i.test(v.platform)) fmt = 'YT Shorts';
    else if (v.type === 'image') fmt = 'IG Carousel';

    var ha = v.hookAnalysis || null;
    createCard({
      title: v.title || 'New Piece',
      format: fmt,
      stage: (v.type === 'transcript' || ha) ? 'Scripting' : 'Swipe',
      sourceUrl: v.sourceUrl || '',
      thumbnail: v.thumbnail || v.previewDataUrl || '',
      caption: v.caption || '',
      transcript: v.timestampedText || v.plainText || '',
      hookAnalysis: ha,
      hook: (ha && ha.remix_hooks && ha.remix_hooks[0]) || '',
      body: (ha && Array.isArray(ha.outline)) ? ha.outline.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') : '',
      linkedVaultId: v.id,
      assetIds: [v.id],
      activities: [{ text: 'Promoted from Vault', at: nowIso() }]
    }, true);
  }

  /* ---------------------------------------------- Sample Board & Export */
  function loadSampleBoard() {
    var today = new Date();
    var d1 = formatDateYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2));
    var d2 = formatDateYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5));
    var samples = [
      {
        title: '3 retention kills in the first 2 seconds',
        format: 'IG Reel',
        stage: 'Scripting',
        priority: 'High',
        topic: 'Growth',
        dueDate: d1,
        hook: 'Stop saying "hey guys" — you already lost 40% of viewers.',
        body: 'Beat 1: Show retention graph drop at 0:02\nBeat 2: Replace intro with visual action + contrast\nBeat 3: Give 2-frame pattern interrupt example',
        cta: 'Comment "HOOKS" for the 10-template swipe file.',
        caption: 'Your hook is a visual promise, not a warm-up.',
        hashtags: '#contentcreation #reelsstrategy #editing'
      },
      {
        title: 'How to turn 1 viral Reel into 5 formats',
        format: 'IG Carousel',
        stage: 'Editing',
        priority: 'Medium',
        topic: 'Tutorial',
        dueDate: d2,
        slides: [
          '1 Viral Reel -> 5 Assets in 15 Minutes',
          'Step 1: Strip the spoken transcript & find the core tension',
          'Step 2: Turn the 3 beats into an 8-slide IG Carousel',
          'Step 3: Compress your cover thumbnail under 500 KB',
          'Step 4: Rewrite the thesis as an X Thread',
          'Save this workflow for your next shoot.'
        ],
        caption: 'Stop filming new ideas when your winners are already sitting in your archive.',
        hashtags: '#contentworkflow #carouseldesign'
      },
      {
        title: 'Why clean audio beats 4K cameras every time',
        format: 'TikTok',
        stage: 'Ready',
        priority: 'Medium',
        topic: 'Opinion',
        hook: 'People scroll past bad audio in 0.4 seconds. Nobody cares about your lens.',
        body: '1. Mic distance demo (arm length vs collar)\n2. Room echo vs blanket baffle\n3. Compression + EQ preset',
        cta: 'Save this before your next batch day.'
      },
      {
        title: 'Editing desk setup tour (under 60s)',
        format: 'YT Shorts',
        stage: 'Swipe',
        priority: 'Low',
        topic: 'Breakdown'
      }
    ];
    samples.reverse().forEach(function (s) {
      state.cards.unshift(normalizeCard(s));
    });
    persistCards();
    renderAll();
    toast('Sample board loaded');
  }

  function exportMarkdownPack() {
    var lines = ['# Droplabs Creator Workspace', '', 'Exported: ' + nowIso(), ''];
    if (state.cards.length) {
      lines.push('## Production Pipeline (' + state.cards.length + ')', '');
      state.cards.forEach(function (c, idx) {
        lines.push('### ' + (idx + 1) + '. ' + c.title + ' [' + c.format + ' · ' + c.stage + ']');
        if (c.dueDate) lines.push('- Due: ' + c.dueDate);
        if (c.sourceUrl) lines.push('- Source: ' + c.sourceUrl);
        if (c.hook) lines.push('', '**Hook:** ' + c.hook);
        if (c.body) lines.push('', '**Script / Beats:**', c.body);
        if (c.slides && c.slides.length) {
          lines.push('', '**Slides:**');
          c.slides.forEach(function (s, si) { lines.push((si + 1) + '. ' + s); });
        }
        if (c.cta) lines.push('', '**CTA:** ' + c.cta);
        if (c.caption) lines.push('', '**Caption:** ' + c.caption + (c.hashtags ? '\n' + c.hashtags : ''));
        lines.push('', '---', '');
      });
    }
    if (state.vault.length) {
      lines.push('## Vault Assets (' + state.vault.length + ')', '');
      state.vault.forEach(function (v, idx) {
        lines.push('### ' + (idx + 1) + '. ' + (v.title || 'Asset') + ' [' + v.type + ']');
        if (v.sourceUrl) lines.push('- URL: ' + v.sourceUrl);
        if (v.plainText || v.timestampedText) lines.push('', v.timestampedText || v.plainText);
        lines.push('');
      });
    }
    downloadFile('droplabs-workspace.md', lines.join('\n'), 'text/markdown;charset=utf-8');
    toast('Exported droplabs-workspace.md');
  }

  function exportJsonBackup() {
    downloadFile('droplabs-workspace-backup.json', JSON.stringify({
      exportedAt: nowIso(),
      cards: state.cards,
      vault: state.vault
    }, null, 2), 'application/json');
    toast('Backup downloaded');
  }

  function resetAllWorkspace() {
    state.cards = [];
    state.vault = [];
    window.DroplabsWorkspace.clearEverything();
    renderAll();
    toast('Workspace cleared');
  }

  function downloadFile(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------------------------------------------------- Teleprompter */
  var tpState = { playing: false, rafId: null, lastTs: 0 };

  function openTeleprompter() {
    var card = getCard(state.activeCardId);
    if (!card) return;
    var lines = [];
    var filledSlides = (card.slides || []).map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    if (state.scriptViewMode === 'slides' && filledSlides.length) {
      lines = filledSlides;
    } else {
      if (card.hook) lines.push(card.hook);
      if (card.body) lines.push(card.body);
      if (card.cta) lines.push(card.cta);
    }
    var scriptText = lines.filter(Boolean).join('\n\n') || card.transcript || card.title || 'Add script text first.';
    $('tpText').textContent = scriptText;
    $('tpStage').scrollTop = 0;
    tpState.playing = false;
    $('tpPlayBtn').textContent = 'Play';
    $('teleprompterOverlay').hidden = false;
  }

  function stopTeleprompter() {
    tpState.playing = false;
    if (tpState.rafId) cancelAnimationFrame(tpState.rafId);
    tpState.rafId = null;
    $('tpPlayBtn').textContent = 'Play';
  }

  function stepTeleprompter(ts) {
    if (!tpState.playing) return;
    if (!tpState.lastTs) tpState.lastTs = ts;
    var dt = Math.min((ts - tpState.lastTs) / 1000, 0.1);
    tpState.lastTs = ts;
    var speed = Number($('tpSpeed').value) || 4;
    $('tpStage').scrollTop += speed * 18 * dt;
    tpState.rafId = requestAnimationFrame(stepTeleprompter);
  }

  /* ----------------------------------------------------- Command Palette */
  function openCommandPalette() {
    $('cmdOverlay').hidden = false;
    $('cmdInput').value = '';
    renderCommandResults('');
    setTimeout(function () { $('cmdInput').focus(); }, 20);
  }

  function renderCommandResults(query) {
    var q = (query || '').trim().toLowerCase();
    var rows = [];
    var commands = [
      { id: 'cmd:new', title: 'New Production Card', sub: 'Action', run: function () { openCreateModal(); } },
      { id: 'cmd:theme', title: 'Toggle Dark / Light Theme', sub: 'Theme', run: function () { applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); } },
      { id: 'cmd:overview', title: 'Go to Overview', sub: 'View', run: function () { setView('overview'); } },
      { id: 'cmd:board', title: 'Go to Pipeline Board', sub: 'View', run: function () { setView('board'); } },
      { id: 'cmd:vault', title: 'Go to Asset Vault', sub: 'View', run: function () { setView('vault'); } },
      { id: 'cmd:cal', title: 'Go to Editorial Calendar', sub: 'View', run: function () { setView('calendar'); } },
      { id: 'cmd:export', title: 'Export Script Pack (.MD)', sub: 'Export', run: exportMarkdownPack }
    ];

    commands.forEach(function (c) {
      if (!q || c.title.toLowerCase().indexOf(q) !== -1) rows.push(c);
    });
    state.cards.forEach(function (c) {
      if (!q || (c.title + ' ' + c.format + ' ' + c.stage).toLowerCase().indexOf(q) !== -1) {
        rows.push({
          id: 'card:' + c.id,
          title: c.title,
          sub: c.format + ' · ' + c.stage,
          run: function () { openStudio(c.id); }
        });
      }
    });
    state.vault.forEach(function (v) {
      if (!q || (v.title || '').toLowerCase().indexOf(q) !== -1) {
        rows.push({
          id: 'vault:' + v.id,
          title: v.title || 'Vault asset',
          sub: 'Vault · ' + v.type,
          run: function () { setView('vault'); }
        });
      }
    });

    window._cmdHandlers = {};
    $('cmdResults').innerHTML = rows.slice(0, 12).map(function (r) {
      window._cmdHandlers[r.id] = r.run;
      return '<button type="button" class="ws-cmd-row" data-cmd-id="' + escapeHtml(r.id) + '">' +
        '<span>' + escapeHtml(r.title) + '</span>' +
        '<span class="ws-cmd-sub">' + escapeHtml(r.sub) + '</span>' +
        '</button>';
    }).join('') || '<div class="ws-empty-mini">No matches found.</div>';
  }

  /* -------------------------------------------------------- Modal Openers */
  function openCreateModal(defaultStage, defaultDate) {
    $('ncTitle').value = '';
    populateSelectOptions($('ncFormat'), FORMATS, 'IG Reel');
    populateSelectOptions($('ncStage'), STAGES, defaultStage || 'Swipe');
    $('ncPriority').value = 'Medium';
    $('ncDueDate').value = defaultDate || '';
    $('createModal').hidden = false;
    setTimeout(function () { $('ncTitle').focus(); }, 20);
  }

  function openRepurposeModal() {
    var card = getCard(state.activeCardId);
    if (!card) return;
    $('repurposeTargets').innerHTML = FORMATS.filter(function (f) { return f !== card.format; }).map(function (f) {
      return '<button type="button" class="ws-repurpose-btn" data-rep-fmt="' + escapeHtml(f) + '">' +
        '<span>' + escapeHtml(f) + '</span><span>→</span></button>';
    }).join('');
    $('repurposeModal').hidden = false;
  }

  function openHistoryModal() {
    var card = getCard(state.activeCardId);
    if (!card) return;
    var snaps = card.snapshots || [];
    $('snapshotsList').innerHTML = snaps.length
      ? snaps.map(function (s, idx) {
          return '<div class="ws-snap-row">' +
            '<div><strong style="font-size:13px">' + escapeHtml(s.label || 'Snapshot') + '</strong>' +
            '<div class="ws-muted-meta">' + escapeHtml(shortTime(s.at)) + ' · ' + escapeHtml((s.hook || s.title || '').slice(0, 42)) + '</div></div>' +
            '<button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-restore-snap="' + idx + '">Restore</button>' +
            '</div>';
        }).join('')
      : '<div class="ws-empty-mini">No snapshots saved yet.</div>';
    $('historyModal').hidden = false;
  }

  function openVaultPicker() {
    var card = getCard(state.activeCardId);
    if (!card) return;
    $('vaultPickerList').innerHTML = state.vault.length
      ? state.vault.map(function (v) {
          var attached = (card.assetIds || []).indexOf(v.id) !== -1;
          return '<div class="ws-picker-row">' +
            '<div style="min-width:0"><strong style="font-size:13px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(v.title || 'Asset') + '</strong>' +
            '<span class="ws-muted-meta">' + escapeHtml(v.type) + '</span></div>' +
            '<button type="button" class="ws-btn ws-btn-ghost ws-btn-sm" data-pick-vault="' + escapeHtml(v.id) + '"' + (attached ? ' disabled' : '') + '>' + (attached ? 'Attached' : 'Attach') + '</button>' +
            '</div>';
        }).join('')
      : '<div class="ws-empty-mini">Vault is empty.</div>';
    $('vaultPickerModal').hidden = false;
  }

  /* --------------------------------------------------- Client Image Upload */
  function handleLocalImageAttach(files) {
    var card = getCard(state.activeCardId);
    if (!card || !files || !files.length) return;
    Array.prototype.slice.call(files, 0, 5).forEach(function (file) {
      if (!/^image\//.test(file.type || '')) return;
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var maxW = 1400;
        var scale = img.width > maxW ? (maxW / img.width) : 1;
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/webp', 0.84);
        var saved = window.DroplabsWorkspace.save({
          type: 'image',
          sourceKey: 'wsimg:' + file.name + ':' + file.size + ':' + Date.now(),
          title: file.name,
          dims: w + '×' + h,
          format: 'WEBP',
          previewDataUrl: dataUrl
        }, { silent: true });
        state.vault = window.DroplabsWorkspace.list();
        saved.previewDataUrl = dataUrl;
        var idx = state.vault.findIndex(function (x) { return x.id === saved.id; });
        if (idx !== -1) state.vault[idx] = saved;
        if (card.assetIds.indexOf(saved.id) === -1) card.assetIds.push(saved.id);
        addActivity(card, 'Attached image ' + file.name);
        persistCards();
        renderStudioAssets(card);
        renderStudioRail();
      };
      img.src = url;
    });
  }

  /* ------------------------------------------------------- Event Bindings */
  function bindEvents() {
    $('themeToggleBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'light' ? 'dark' : 'light');
    });

    $('wsViewTabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.ws-tab[data-view]');
      if (btn) setView(btn.getAttribute('data-view'));
    });

    $('mobileBottomNav').addEventListener('click', function (e) {
      var btn = e.target.closest('.ws-bnav-btn[data-view]');
      if (btn) setView(btn.getAttribute('data-view'));
    });

    // Mobile Topbar Controls
    $('mobileToolsBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = $('mobileToolsMenu');
      menu.hidden = !menu.hidden;
      $('mobileToolsBtn').setAttribute('aria-expanded', String(!menu.hidden));
    });
    $('mobileSearchBtn').addEventListener('click', openCommandPalette);
    $('mobileNewBtn').addEventListener('click', function () { openCreateModal(); });
    $('mobileMenuNavBtn').addEventListener('click', function () { $('mobileSheetOverlay').hidden = false; });
    $('closeMobileSheetBtn').addEventListener('click', function () { $('mobileSheetOverlay').hidden = true; });
    $('mobileSheetOverlay').addEventListener('click', function (e) {
      if (e.target === $('mobileSheetOverlay')) $('mobileSheetOverlay').hidden = true;
    });

    $('sheetExportMd').addEventListener('click', function () { $('mobileSheetOverlay').hidden = true; exportMarkdownPack(); });
    $('sheetBackupJson').addEventListener('click', function () { $('mobileSheetOverlay').hidden = true; exportJsonBackup(); });
    $('sheetImportJson').addEventListener('click', function () { $('mobileSheetOverlay').hidden = true; $('importJsonInput').click(); });
    $('sheetLoadSample').addEventListener('click', function () { $('mobileSheetOverlay').hidden = true; loadSampleBoard(); });
    $('sheetClearAll').addEventListener('click', function () { $('mobileSheetOverlay').hidden = true; resetAllWorkspace(); });

    $('viewOverview').addEventListener('click', function (e) {
      var jump = e.target.closest('[data-jump-view]');
      if (jump) { setView(jump.getAttribute('data-jump-view')); return; }
      var openBtn = e.target.closest('[data-open-card]');
      if (openBtn) { openStudio(openBtn.getAttribute('data-open-card')); return; }
      var prom = e.target.closest('[data-promote-vault]');
      if (prom) { promoteVaultToCard(prom.getAttribute('data-promote-vault')); }
    });

    $('emptyNewCardBtn').addEventListener('click', function () { openCreateModal(); });
    $('emptySampleBtn').addEventListener('click', loadSampleBoard);
    $('newCardBtn').addEventListener('click', function () { openCreateModal(); });

    // More Menu & Popover outside click
    $('moreActionsBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = $('moreActionsMenu');
      menu.hidden = !menu.hidden;
      $('moreActionsBtn').setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', function (e) {
      if (!$('moreActionsWrap').contains(e.target)) {
        $('moreActionsMenu').hidden = true;
        $('moreActionsBtn').setAttribute('aria-expanded', 'false');
      }
      if ($('mobileToolsWrap') && !$('mobileToolsWrap').contains(e.target)) {
        $('mobileToolsMenu').hidden = true;
        $('mobileToolsBtn').setAttribute('aria-expanded', 'false');
      }
      if ($('studioMoreWrap') && !$('studioMoreWrap').contains(e.target)) {
        $('studioMoreMenu').hidden = true;
      }
    });
    $('menuExportMd').addEventListener('click', function () { $('moreActionsMenu').hidden = true; exportMarkdownPack(); });
    $('menuBackupJson').addEventListener('click', function () { $('moreActionsMenu').hidden = true; exportJsonBackup(); });
    $('menuImportJson').addEventListener('click', function () { $('moreActionsMenu').hidden = true; $('importJsonInput').click(); });
    $('importJsonInput').addEventListener('change', function () {
      var file = $('importJsonInput').files && $('importJsonInput').files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result || '{}'));
          if (Array.isArray(parsed.cards)) {
            state.cards = parsed.cards.map(normalizeCard);
            persistCards();
          }
          if (Array.isArray(parsed.vault)) {
            parsed.vault.forEach(function (v) { window.DroplabsWorkspace.save(v, { silent: true }); });
            window.DroplabsWorkspace.loadState().then(function (st) {
              state.vault = st.vault;
              renderAll();
            });
          } else {
            renderAll();
          }
          toast('Workspace restored');
        } catch (err) {
          toast('Invalid JSON backup file');
        }
      };
      reader.readAsText(file);
      $('importJsonInput').value = '';
    });
    $('menuLoadSample').addEventListener('click', function () { $('moreActionsMenu').hidden = true; loadSampleBoard(); });
    $('menuClearAll').addEventListener('click', function () { $('moreActionsMenu').hidden = true; resetAllWorkspace(); });

    // Quick capture
    $('captureClipBtn').addEventListener('click', function () { captureUrl(false); });
    $('quickCaptureForm').addEventListener('submit', function (e) {
      e.preventDefault();
      captureUrl(state.groqActive);
    });

    // Board filters & Drag/Drop
    $('boardFormatChips').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-board-fmt]');
      if (!chip) return;
      state.boardFormat = chip.getAttribute('data-board-fmt');
      renderBoard();
    });
    $('boardSearchInput').addEventListener('input', function () {
      state.boardQuery = $('boardSearchInput').value || '';
      if ($('mobileBoardSearch')) $('mobileBoardSearch').value = state.boardQuery;
      renderBoard();
    });
    $('mobileFormatSelect').addEventListener('change', function () {
      state.boardFormat = $('mobileFormatSelect').value || 'All';
      renderBoard();
    });
    $('mobileBoardSearch').addEventListener('input', function () {
      state.boardQuery = $('mobileBoardSearch').value || '';
      if ($('boardSearchInput')) $('boardSearchInput').value = state.boardQuery;
      renderBoard();
    });
    $('mobileStageStrip').addEventListener('click', function (e) {
      var pill = e.target.closest('[data-mobile-stage]');
      if (!pill) return;
      state.mobileStage = pill.getAttribute('data-mobile-stage');
      renderBoard();
    });
    document.querySelectorAll('[data-board-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.boardMode = b.getAttribute('data-board-mode');
        document.querySelectorAll('[data-board-mode]').forEach(function (x) {
          x.classList.toggle('is-active', x === b);
        });
        renderBoard();
      });
    });

    $('viewBoard').addEventListener('click', function (e) {
      var addStage = e.target.closest('[data-add-stage]');
      if (addStage) { openCreateModal(addStage.getAttribute('data-add-stage')); return; }
      var del = e.target.closest('[data-del-card]');
      if (del) {
        e.stopPropagation();
        var did = del.getAttribute('data-del-card');
        state.cards = state.cards.filter(function (c) { return c.id !== did; });
        persistCards();
        renderAll();
        return;
      }
      if (e.target.closest('select[data-move-stage]')) return;
      var cardEl = e.target.closest('[data-card-id]');
      if (cardEl) openStudio(cardEl.getAttribute('data-card-id'));
    });

    $('viewBoard').addEventListener('change', function (e) {
      var sel = e.target.closest('select[data-move-stage]');
      if (!sel) return;
      var card = getCard(sel.getAttribute('data-move-stage'));
      if (!card) return;
      card.stage = sel.value;
      addActivity(card, 'Moved to ' + sel.value);
      persistCards();
      renderBoard();
    });

    $('kanbanBoard').addEventListener('dragstart', function (e) {
      var cardEl = e.target.closest('.ws-kcard');
      if (!cardEl) return;
      state.dragCardId = cardEl.getAttribute('data-card-id');
      e.dataTransfer.setData('text/plain', state.dragCardId);
      cardEl.classList.add('is-dragging');
    });
    $('kanbanBoard').addEventListener('dragend', function () {
      state.dragCardId = null;
      document.querySelectorAll('.ws-col.is-drag-over').forEach(function (c) { c.classList.remove('is-drag-over'); });
      document.querySelectorAll('.ws-kcard.is-dragging').forEach(function (c) { c.classList.remove('is-dragging'); });
    });
    $('kanbanBoard').addEventListener('dragover', function (e) {
      var col = e.target.closest('.ws-col');
      if (!col) return;
      e.preventDefault();
      col.classList.add('is-drag-over');
    });
    $('kanbanBoard').addEventListener('dragleave', function (e) {
      var col = e.target.closest('.ws-col');
      if (col && !col.contains(e.relatedTarget)) col.classList.remove('is-drag-over');
    });
    $('kanbanBoard').addEventListener('drop', function (e) {
      var col = e.target.closest('.ws-col');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('is-drag-over');
      var cid = e.dataTransfer.getData('text/plain') || state.dragCardId;
      var nextStage = col.getAttribute('data-stage-col');
      var card = getCard(cid);
      if (card && nextStage && card.stage !== nextStage) {
        card.stage = nextStage;
        addActivity(card, 'Moved to ' + nextStage);
        persistCards();
        renderBoard();
      }
    });

    // Vault
    $('vaultFilterChips').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-vault-filter]');
      if (!chip) return;
      state.vaultFilter = chip.getAttribute('data-vault-filter');
      document.querySelectorAll('#vaultFilterChips .ws-chip').forEach(function (c) {
        c.classList.toggle('is-active', c === chip);
      });
      renderVault();
    });
    $('vaultSearchInput').addEventListener('input', function () {
      state.vaultQuery = $('vaultSearchInput').value || '';
      renderVault();
    });
    $('vaultGrid').addEventListener('click', function (e) {
      var prom = e.target.closest('[data-promote-vault]');
      if (prom) { promoteVaultToCard(prom.getAttribute('data-promote-vault')); return; }
      var del = e.target.closest('[data-del-vault]');
      if (del) {
        var id = del.getAttribute('data-del-vault');
        window.DroplabsWorkspace.remove(id);
        state.vault = state.vault.filter(function (x) { return x.id !== id; });
        renderAll();
        return;
      }
      var copyBtn = e.target.closest('[data-copy-vault]');
      if (copyBtn) {
        var v = state.vault.filter(function (x) { return x.id === copyBtn.getAttribute('data-copy-vault'); })[0];
        var txt = v ? (v.timestampedText || v.plainText || '') : '';
        if (txt && navigator.clipboard) {
          navigator.clipboard.writeText(txt);
          copyBtn.textContent = 'Copied ✓';
          setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
        }
      }
    });

    // Calendar
    $('calPrevBtn').addEventListener('click', function () {
      state.calDate = new Date(state.calDate.getFullYear(), state.calDate.getMonth() - 1, 1);
      renderCalendar();
    });
    $('calNextBtn').addEventListener('click', function () {
      state.calDate = new Date(state.calDate.getFullYear(), state.calDate.getMonth() + 1, 1);
      renderCalendar();
    });
    $('calTodayBtn').addEventListener('click', function () {
      state.calDate = new Date();
      renderCalendar();
    });
    $('viewCalendar').addEventListener('click', function (e) {
      var cardBtn = e.target.closest('[data-open-card]');
      if (cardBtn) { openStudio(cardBtn.getAttribute('data-open-card')); return; }
      var dayCell = e.target.closest('[data-cal-day]');
      if (dayCell) openCreateModal('Scripting', dayCell.getAttribute('data-cal-day'));
    });
    $('viewCalendar').addEventListener('change', function (e) {
      var inp = e.target.closest('[data-sched-card]');
      if (!inp || !inp.value) return;
      var card = getCard(inp.getAttribute('data-sched-card'));
      if (!card) return;
      card.dueDate = inp.value;
      addActivity(card, 'Scheduled for ' + inp.value);
      persistCards();
      renderCalendar();
    });

    // Create Modal
    $('closeCreateModalBtn').addEventListener('click', function () { $('createModal').hidden = true; });
    $('cancelCreateBtn').addEventListener('click', function () { $('createModal').hidden = true; });
    $('createCardForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var title = ($('ncTitle').value || '').trim();
      if (!title) return;
      $('createModal').hidden = true;
      createCard({
        title: title,
        format: $('ncFormat').value,
        stage: $('ncStage').value,
        priority: $('ncPriority').value,
        dueDate: $('ncDueDate').value
      }, true);
    });

    // Studio Header, Mobile Overflow & Tabs
    $('studioCloseBtn').addEventListener('click', closeStudio);
    $('studioOverlay').addEventListener('click', function (e) {
      if (e.target === $('studioOverlay')) closeStudio();
    });
    $('studioMoreBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      $('studioMoreMenu').hidden = !$('studioMoreMenu').hidden;
    });
    $('studioMobileHistory').addEventListener('click', function () {
      $('studioMoreMenu').hidden = true;
      openHistoryModal();
    });
    $('studioMobileCopy').addEventListener('click', function () {
      $('studioMoreMenu').hidden = true;
      $('studioCopyPackBtn').click();
    });
    $('studioMobileDelete').addEventListener('click', function () {
      $('studioMoreMenu').hidden = true;
      $('studioDeleteBtn').click();
    });
    $('studioTabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.ws-stab[data-stab]');
      if (btn) setStudioTab(btn.getAttribute('data-stab'));
    });
    $('scriptViewMode').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-smode]');
      if (btn) setScriptViewMode(btn.getAttribute('data-smode'));
    });

    // Studio Input Autosave
    [
      ['stTitle', 'title'],
      ['stFormat', 'format'],
      ['stStage', 'stage'],
      ['stPriority', 'priority'],
      ['stTopic', 'topic'],
      ['stDueDate', 'dueDate'],
      ['stHook', 'hook'],
      ['stBody', 'body'],
      ['stCta', 'cta'],
      ['stCaption', 'caption'],
      ['stHashtags', 'hashtags'],
      ['stSourceUrl', 'sourceUrl'],
      ['stTranscript', 'transcript'],
      ['stBriefUrl', 'briefUrl'],
      ['stFinalUrl', 'finalUrl'],
      ['stPostedUrl', 'postedUrl'],
      ['stNotes', 'notes']
    ].forEach(function (pair) {
      var el = $(pair[0]);
      var evt = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(evt, function () {
        updateActiveCardField(pair[1], el.value);
        if (pair[1] === 'title') autoSizeTitle();
        if (pair[1] === 'hook' || pair[1] === 'body' || pair[1] === 'cta') updateScriptStats();
      });
    });

    // Slides Builder
    $('addSlideBtn').addEventListener('click', function () {
      var card = getCard(state.activeCardId);
      if (!card) return;
      if (!card.slides.length) card.slides.push('');
      card.slides.push('');
      persistCards();
      renderSlides(card);
      renderStudioRail();
    });
    $('slidesList').addEventListener('input', function (e) {
      var ta = e.target.closest('textarea[data-slide-idx]');
      if (!ta) return;
      var card = getCard(state.activeCardId);
      if (!card) return;
      var idx = Number(ta.getAttribute('data-slide-idx'));
      card.slides[idx] = ta.value;
      persistCards();
      var counter = ta.parentElement.querySelector('.ws-muted-meta');
      if (counter) counter.textContent = ta.value.length + ' ch';
      renderStudioRail();
    });
    $('slidesList').addEventListener('click', function (e) {
      var card = getCard(state.activeCardId);
      if (!card) return;
      var up = e.target.closest('[data-slide-up]');
      if (up) {
        var i = Number(up.getAttribute('data-slide-up'));
        if (i > 0) {
          var tmp = card.slides[i - 1];
          card.slides[i - 1] = card.slides[i];
          card.slides[i] = tmp;
          persistCards();
          renderSlides(card);
        }
        return;
      }
      var del = e.target.closest('[data-slide-del]');
      if (del) {
        var di = Number(del.getAttribute('data-slide-del'));
        card.slides.splice(di, 1);
        persistCards();
        renderSlides(card);
        renderStudioRail();
      }
    });

    // AI Studio Actions
    $('aiHooksBtn').addEventListener('click', runStudioHooks);
    $('aiPolishBtn').addEventListener('click', function () { runStudioPolishOrFormat('polish'); });
    $('aiBuildSlidesBtn').addEventListener('click', function () { runStudioPolishOrFormat('repurpose'); });

    $('studioDialog').addEventListener('click', function (e) {
      var hookBtn = e.target.closest('[data-use-hook]');
      if (!hookBtn) return;
      var line = hookBtn.getAttribute('data-use-hook');
      var card = getCard(state.activeCardId);
      if (!card) return;
      card.hook = line;
      $('stHook').value = line;
      if (card.slides && card.slides.length) {
        card.slides[0] = line;
        renderSlides(card);
      }
      updateScriptStats();
      addActivity(card, 'Applied hook variation');
      persistCards();
      renderStudioRail();
      setStudioTab('script');
      toast('Hook applied');
    });

    // Intel Transcribe & Analyze inside Studio
    $('studioAnalyzeUrlBtn').addEventListener('click', async function () {
      var card = getCard(state.activeCardId);
      var url = ($('stSourceUrl').value || '').trim();
      if (!card || !url) { toast('Paste a video URL first'); return; }
      var btn = $('studioAnalyzeUrlBtn');
      var status = $('studioIntelStatus');
      btn.disabled = true;
      status.textContent = 'Transcribing via Whisper…';
      status.hidden = false;
      try {
        var fd = new FormData();
        fd.append('url', url);
        fd.append('language', 'auto');
        var txResp = await fetch('/api/transcribe', { method: 'POST', body: fd });
        var tx = await txResp.json().catch(function () { return {}; });
        if (!txResp.ok) throw new Error(tx.detail || 'Transcription failed');
        var ts = (tx.segments && tx.segments.length)
          ? tx.segments.map(function (s) { return '[' + s.start_str + '] ' + s.text; }).join('\n')
          : (tx.text || '');
        card.transcript = ts;
        $('stTranscript').value = ts;
        if (tx.text && tx.text.length >= 12) {
          status.textContent = 'Analyzing hook…';
          var hkResp = await fetch('/api/analyze-transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: tx.text, title: card.title })
          });
          if (hkResp.ok) {
            card.hookAnalysis = await hkResp.json();
            renderHookIntel(card);
          }
        }
        status.hidden = true;
        addActivity(card, 'Transcribed & analyzed URL');
        persistCards();
        renderStudioRail();
      } catch (err) {
        status.textContent = err.message;
      } finally {
        btn.disabled = !state.groqActive;
      }
    });

    $('analyzeTextBtn').addEventListener('click', async function () {
      var card = getCard(state.activeCardId);
      var text = ($('stTranscript').value || '').trim();
      if (!card || text.length < 12) { toast('Add at least 12 characters of transcript'); return; }
      var btn = $('analyzeTextBtn');
      btn.disabled = true;
      btn.textContent = 'Analyzing…';
      try {
        var resp = await fetch('/api/analyze-transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: text, title: card.title })
        });
        var data = await resp.json().catch(function () { return {}; });
        if (!resp.ok) throw new Error(data.detail || 'Analysis failed');
        card.hookAnalysis = data;
        renderHookIntel(card);
        addActivity(card, 'Analyzed transcript hook');
        persistCards();
        renderStudioRail();
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = !state.groqActive;
        btn.textContent = 'Analyze Hook';
      }
    });

    // Copy helpers
    $('copyCaptionBtn').addEventListener('click', function () {
      var full = [$('stCaption').value, $('stHashtags').value].filter(Boolean).join('\n\n');
      if (full && navigator.clipboard) {
        navigator.clipboard.writeText(full);
        toast('Caption copied');
      }
    });
    $('copyTxBtn').addEventListener('click', function () {
      var t = $('stTranscript').value;
      if (t && navigator.clipboard) {
        navigator.clipboard.writeText(t);
        toast('Transcript copied');
      }
    });
    $('studioCopyPackBtn').addEventListener('click', function () {
      var card = getCard(state.activeCardId);
      if (!card) return;
      var parts = [card.title];
      if (card.hook) parts.push('HOOK: ' + card.hook);
      if (card.body) parts.push(card.body);
      if (card.slides && card.slides.length) parts.push('SLIDES:\n' + card.slides.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'));
      if (card.cta) parts.push('CTA: ' + card.cta);
      if (card.caption) parts.push('CAPTION:\n' + card.caption + (card.hashtags ? '\n' + card.hashtags : ''));
      if (navigator.clipboard) navigator.clipboard.writeText(parts.filter(Boolean).join('\n\n'));
      toast('Full post pack copied');
    });

    // Assets attach & upload
    $('attachFromVaultBtn').addEventListener('click', openVaultPicker);
    $('closeVaultPickerBtn').addEventListener('click', function () { $('vaultPickerModal').hidden = true; });
    $('vaultPickerList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-pick-vault]');
      if (!btn) return;
      var card = getCard(state.activeCardId);
      var vid = btn.getAttribute('data-pick-vault');
      if (card && card.assetIds.indexOf(vid) === -1) {
        card.assetIds.push(vid);
        addActivity(card, 'Attached asset from Vault');
        persistCards();
        renderStudioAssets(card);
        renderStudioRail();
      }
      $('vaultPickerModal').hidden = true;
    });
    $('uploadCardAssetBtn').addEventListener('click', function () { $('cardAssetFileInput').click(); });
    $('cardAssetFileInput').addEventListener('change', function () {
      handleLocalImageAttach($('cardAssetFileInput').files);
      $('cardAssetFileInput').value = '';
    });
    $('attachedAssetsGrid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-detach-asset]');
      if (!btn) return;
      var card = getCard(state.activeCardId);
      var aid = btn.getAttribute('data-detach-asset');
      if (!card) return;
      card.assetIds = card.assetIds.filter(function (x) { return x !== aid; });
      persistCards();
      renderStudioAssets(card);
      renderStudioRail();
    });

    // Checklist
    $('addCheckForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var card = getCard(state.activeCardId);
      var text = ($('newCheckInput').value || '').trim();
      if (!card || !text) return;
      card.checklist.push({ id: 'chk_' + Date.now(), text: text, done: false });
      $('newCheckInput').value = '';
      persistCards();
      renderStudioRail();
    });
    $('studioChecklist').addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-check-id]');
      if (!cb) return;
      var card = getCard(state.activeCardId);
      if (!card) return;
      var id = cb.getAttribute('data-check-id');
      card.checklist.forEach(function (c) { if (c.id === id) c.done = cb.checked; });
      persistCards();
      renderStudioRail();
    });
    $('studioChecklist').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del-check]');
      if (!del) return;
      var card = getCard(state.activeCardId);
      if (!card) return;
      var id = del.getAttribute('data-del-check');
      card.checklist = card.checklist.filter(function (c) { return c.id !== id; });
      persistCards();
      renderStudioRail();
    });

    // Delete card
    $('studioDeleteBtn').addEventListener('click', function () {
      var id = state.activeCardId;
      state.cards = state.cards.filter(function (c) { return c.id !== id; });
      persistCards();
      closeStudio();
      toast('Card deleted');
    });

    // Repurpose Modal
    $('studioRepurposeBtn').addEventListener('click', openRepurposeModal);
    $('closeRepurposeBtn').addEventListener('click', function () { $('repurposeModal').hidden = true; });
    $('repurposeTargets').addEventListener('click', async function (e) {
      var btn = e.target.closest('[data-rep-fmt]');
      if (!btn) return;
      var targetFmt = btn.getAttribute('data-rep-fmt');
      var card = getCard(state.activeCardId);
      if (!card) return;
      var useAi = $('repurposeAiToggle').checked && state.groqActive;
      if (useAi) {
        btn.disabled = true;
        btn.innerHTML = '<span>Generating…</span><span>⏳</span>';
        try {
          var res = await callWorkspaceAi({
            mode: 'repurpose',
            title: card.title,
            source_text: buildSourceContext(card),
            target_format: targetFmt,
            topic: card.topic,
            hook_pattern: card.hookAnalysis ? card.hookAnalysis.hook_pattern : ''
          });
          $('repurposeModal').hidden = true;
          createCard({
            title: res.title || (card.title + ' (' + targetFmt + ')'),
            format: targetFmt,
            stage: 'Scripting',
            priority: card.priority,
            topic: card.topic,
            hook: res.hook || card.hook,
            body: res.body || card.body,
            cta: res.cta || card.cta,
            slides: Array.isArray(res.slides) ? res.slides : [],
            caption: res.caption || card.caption,
            hashtags: res.hashtags || card.hashtags,
            sourceUrl: card.sourceUrl,
            thumbnail: card.thumbnail,
            transcript: card.transcript,
            hookAnalysis: card.hookAnalysis,
            assetIds: card.assetIds.slice(),
            activities: [{ text: 'AI repurposed from ' + card.format, at: nowIso() }]
          }, true);
          toast('Repurposed to ' + targetFmt);
          return;
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
          btn.innerHTML = '<span>' + escapeHtml(targetFmt) + '</span><span>→</span>';
          return;
        }
      }
      $('repurposeModal').hidden = true;
      createCard({
        title: card.title + ' (' + targetFmt + ')',
        format: targetFmt,
        stage: 'Swipe',
        priority: card.priority,
        topic: card.topic,
        hook: card.hook,
        body: card.body,
        cta: card.cta,
        slides: card.slides.slice(),
        caption: card.caption,
        hashtags: card.hashtags,
        sourceUrl: card.sourceUrl,
        thumbnail: card.thumbnail,
        transcript: card.transcript,
        assetIds: card.assetIds.slice(),
        activities: [{ text: 'Cloned from ' + card.format, at: nowIso() }]
      }, true);
    });

    // Snapshots
    $('studioHistoryBtn').addEventListener('click', openHistoryModal);
    $('closeHistoryBtn').addEventListener('click', function () { $('historyModal').hidden = true; });
    $('saveSnapshotBtn').addEventListener('click', function () {
      var card = getCard(state.activeCardId);
      if (!card) return;
      saveSnapshot(card, 'Manual Snapshot');
      addActivity(card, 'Saved snapshot');
      persistCards();
      openHistoryModal();
      renderStudioRail();
    });
    $('snapshotsList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-restore-snap]');
      if (!btn) return;
      var card = getCard(state.activeCardId);
      if (!card) return;
      var snap = card.snapshots[Number(btn.getAttribute('data-restore-snap'))];
      if (!snap) return;
      saveSnapshot(card, 'Before Restore');
      card.title = snap.title || card.title;
      card.hook = snap.hook || '';
      card.body = snap.body || '';
      card.cta = snap.cta || '';
      card.slides = Array.isArray(snap.slides) ? snap.slides.slice() : [];
      card.caption = snap.caption || '';
      addActivity(card, 'Restored snapshot');
      persistCards();
      $('historyModal').hidden = true;
      openStudio(card.id);
      toast('Snapshot restored');
    });

    // Teleprompter
    $('studioTeleprompterBtn').addEventListener('click', openTeleprompter);
    $('tpCloseBtn').addEventListener('click', function () {
      stopTeleprompter();
      $('teleprompterOverlay').hidden = true;
    });
    $('tpPlayBtn').addEventListener('click', function () {
      tpState.playing = !tpState.playing;
      $('tpPlayBtn').textContent = tpState.playing ? 'Pause' : 'Play';
      if (tpState.playing) {
        tpState.lastTs = 0;
        tpState.rafId = requestAnimationFrame(stepTeleprompter);
      } else {
        stopTeleprompter();
      }
    });
    $('tpResetBtn').addEventListener('click', function () { $('tpStage').scrollTop = 0; });
    $('tpSize').addEventListener('input', function () { $('tpText').style.fontSize = $('tpSize').value + 'px'; });
    $('tpMirrorBtn').addEventListener('click', function () {
      $('tpText').classList.toggle('is-mirrored');
    });

    // Command Palette
    $('openCmdBtn').addEventListener('click', openCommandPalette);
    $('cmdOverlay').addEventListener('click', function (e) {
      if (e.target === $('cmdOverlay')) $('cmdOverlay').hidden = true;
    });
    $('cmdInput').addEventListener('input', function () { renderCommandResults($('cmdInput').value); });
    $('cmdResults').addEventListener('click', function (e) {
      var row = e.target.closest('[data-cmd-id]');
      if (!row) return;
      var fn = window._cmdHandlers && window._cmdHandlers[row.getAttribute('data-cmd-id')];
      $('cmdOverlay').hidden = true;
      if (fn) fn();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if ($('cmdOverlay').hidden) openCommandPalette();
        else $('cmdOverlay').hidden = true;
        return;
      }
      if (e.key === ' ' && !$('teleprompterOverlay').hidden) {
        e.preventDefault();
        $('tpPlayBtn').click();
        return;
      }
      if (e.key === 'Escape') {
        if (!$('teleprompterOverlay').hidden) {
          stopTeleprompter();
          $('teleprompterOverlay').hidden = true;
        } else if (!$('cmdOverlay').hidden) {
          $('cmdOverlay').hidden = true;
        } else if (!$('mobileSheetOverlay').hidden) {
          $('mobileSheetOverlay').hidden = true;
        } else if (!$('historyModal').hidden) {
          $('historyModal').hidden = true;
        } else if (!$('repurposeModal').hidden) {
          $('repurposeModal').hidden = true;
        } else if (!$('vaultPickerModal').hidden) {
          $('vaultPickerModal').hidden = true;
        } else if (!$('createModal').hidden) {
          $('createModal').hidden = true;
        } else if (!$('studioOverlay').hidden) {
          closeStudio();
        }
      }
    });
  }

  /* -------------------------------------------------------------- Init */
  function checkHealth() {
    fetch('/api/health', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        state.groqActive = !!j.groq_active;
        if (!state.groqActive) {
          document.querySelectorAll('[data-ws-ai-btn]').forEach(function (b) {
            b.disabled = true;
            b.title = 'AI features unavailable (GROQ_API_KEY not configured)';
          });
        }
      })
      .catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(window.DroplabsWorkspace ? window.DroplabsWorkspace.getTheme() : 'dark');
    bindEvents();
    checkHealth();

    if (window.DroplabsWorkspace) {
      state.vault = window.DroplabsWorkspace.list();
      state.cards = window.DroplabsWorkspace.listCards().map(normalizeCard);
      renderAll();

      window.DroplabsWorkspace.loadState().then(function (loaded) {
        state.vault = loaded.vault || [];
        if (loaded.cards && loaded.cards.length >= state.cards.length) {
          state.cards = loaded.cards.map(normalizeCard);
        }
        renderAll();
      });
    }
  });
})();
