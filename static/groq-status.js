/* Reflects /api/health groq_active on the Video-to-Text surfaces.
   When the server has no Whisper key, the tool is disabled and a notice is
   shown instead of letting every request fail with a 503. When the key is
   present (or added later on Render), everything stays enabled. */
(function () {
  'use strict';

  var active = true;

  function apply(isActive) {
    active = isActive;
    if (active) return;

    var notices = document.querySelectorAll('[data-groq-unavailable]');
    for (var i = 0; i < notices.length; i += 1) notices[i].hidden = false;

    var controls = document.querySelectorAll('[data-groq-submit]');
    for (var j = 0; j < controls.length; j += 1) {
      controls[j].disabled = true;
      controls[j].setAttribute('aria-disabled', 'true');
      controls[j].title = 'Transcription is temporarily unavailable.';
    }

    var notes = document.querySelectorAll('[data-groq-note]');
    for (var k = 0; k < notes.length; k += 1) notes[k].hidden = false;
  }

  // Block implicit form submits (Enter key) while the tool is unavailable.
  document.addEventListener(
    'submit',
    function (e) {
      if (!active && e.target && e.target.closest('[data-groq-block]')) {
        e.preventDefault();
      }
    },
    true
  );

  fetch('/api/health', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) { apply(!!j.groq_active); })
    .catch(function () {
      /* Health unreachable: leave the UI untouched; the API will explain. */
    });
})();
