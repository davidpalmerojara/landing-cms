/**
 * BuilderPro Analytics Pixel — lightweight tracking script (< 3KB gzip).
 *
 * Injected into published pages at /p/[slug].
 * Cookieless: stores nothing on the visitor's device and sends no visitor
 * identifier. The server derives a daily anonymous hash from the request.
 * Captures: pageview, click, scroll_depth, time_on_page, cta_conversion.
 * Sends batched events via navigator.sendBeacon (fallback: fetch POST).
 *
 * Config attributes on the <script> tag:
 *   data-page-id   — UUID of the page
 *   data-api-url   — base API URL (e.g. http://localhost:8001/api)
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────
  var script = document.currentScript;
  if (!script) return;

  var PAGE_ID = script.getAttribute('data-page-id');
  var API_URL = script.getAttribute('data-api-url');
  if (!PAGE_ID || !API_URL) return;

  var COLLECT_URL = API_URL + '/analytics/collect/';
  var BATCH_SIZE = 5;
  var BATCH_INTERVAL = 10000; // 10s
  var HEARTBEAT_INTERVAL = 15000; // 15s
  var SCROLL_THRESHOLDS = [25, 50, 75, 100];

  // ── UTM params ──────────────────────────────────────────
  function getUtmParams() {
    var params = {};
    try {
      var sp = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
        var v = sp.get(k);
        if (v) params[k] = v;
      });
    } catch (e) { /* old browser */ }
    return params;
  }

  var UTM = getUtmParams();

  // ── Referrer (origin only, never the full URL) ─────────
  function getReferrerOrigin() {
    if (!document.referrer) return null;
    try {
      var u = new URL(document.referrer);
      return u.protocol + '//' + u.host;
    } catch (e) {
      return null;
    }
  }

  // ── Link target (http(s) or relative only, no query/fragment) ──
  function getSafeHref(raw) {
    if (!raw) return null;
    try {
      var u = new URL(raw, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (u.origin === location.origin) return u.pathname;
      return u.origin + u.pathname;
    } catch (e) {
      return null;
    }
  }

  // ── Screen info ─────────────────────────────────────────
  var SCREEN_SIZE = screen.width + 'x' + screen.height;

  // ── Event buffer & flush ────────────────────────────────
  var buffer = [];
  var flushTimer = null;

  function flush() {
    if (buffer.length === 0) return;

    var payload = JSON.stringify({
      page_id: PAGE_ID,
      events: buffer.splice(0)
    });

    // Prefer sendBeacon for reliability on page unload
    var sent = false;
    if (navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon(COLLECT_URL, new Blob([payload], { type: 'application/json' }));
      } catch (e) { /* fallback */ }
    }

    if (!sent) {
      try {
        fetch(COLLECT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function () { /* silently ignore */ });
      } catch (e) { /* ignore */ }
    }
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, BATCH_INTERVAL);
  }

  function pushEvent(type, extra) {
    var evt = {
      event_type: type,
      screen_size: SCREEN_SIZE,
      referrer: getReferrerOrigin(),
      timestamp: new Date().toISOString()
    };

    if (UTM.utm_source) evt.utm_source = UTM.utm_source;
    if (UTM.utm_medium) evt.utm_medium = UTM.utm_medium;
    if (UTM.utm_campaign) evt.utm_campaign = UTM.utm_campaign;

    if (extra) {
      if (extra.block_id) evt.block_id = extra.block_id;
      if (extra.block_type) evt.block_type = extra.block_type;
      if (extra.event_data) evt.event_data = extra.event_data;
    }

    buffer.push(evt);

    if (buffer.length >= BATCH_SIZE) {
      flush();
    } else {
      scheduleFlush();
    }
  }

  // ── 1. Pageview ─────────────────────────────────────────
  pushEvent('pageview', {
    event_data: { path: location.pathname }
  });

  // ── 2. Click tracking ──────────────────────────────────
  document.addEventListener('click', function (e) {
    // Walk up to find an interactive element inside a block
    var el = e.target;
    var blockEl = null;
    var interactive = null;

    while (el && el !== document.body) {
      if (!interactive && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')) {
        interactive = el;
      }
      if (el.dataset && el.dataset.blockId) {
        blockEl = el;
        break;
      }
      el = el.parentElement;
    }

    if (!interactive || !blockEl) return;

    var blockId = blockEl.dataset.blockId;
    var blockType = blockEl.dataset.blockType || null;
    var href = getSafeHref(interactive.getAttribute('href'));

    // Check if it's a CTA conversion
    var isCta = blockEl.dataset.blockType === 'cta' || blockEl.dataset.blockType === 'hero';
    var eventType = isCta ? 'cta_conversion' : 'click';

    pushEvent(eventType, {
      block_id: blockId,
      block_type: blockType,
      event_data: {
        href: href
      }
    });
  }, true);

  // ── 3. Scroll depth ────────────────────────────────────
  var firedThresholds = {};

  function checkScroll() {
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    var viewportHeight = window.innerHeight;
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    if (docHeight <= viewportHeight) return; // single-screen page

    var pct = Math.round(((scrollTop + viewportHeight) / docHeight) * 100);

    for (var i = 0; i < SCROLL_THRESHOLDS.length; i++) {
      var t = SCROLL_THRESHOLDS[i];
      if (pct >= t && !firedThresholds[t]) {
        firedThresholds[t] = true;

        // Find the block visible at this scroll position
        var visibleBlock = findBlockAtPosition(scrollTop + viewportHeight * 0.5);

        pushEvent('scroll_depth', {
          block_id: visibleBlock ? visibleBlock.id : null,
          block_type: visibleBlock ? visibleBlock.type : null,
          event_data: { depth: t }
        });
      }
    }
  }

  function findBlockAtPosition(yPos) {
    var blocks = document.querySelectorAll('[data-block-id]');
    for (var i = blocks.length - 1; i >= 0; i--) {
      var rect = blocks[i].getBoundingClientRect();
      var blockTop = rect.top + (window.pageYOffset || document.documentElement.scrollTop);
      if (blockTop <= yPos) {
        return {
          id: blocks[i].dataset.blockId,
          type: blocks[i].dataset.blockType || null
        };
      }
    }
    return null;
  }

  // Throttled scroll listener
  var scrollTimeout = null;
  window.addEventListener('scroll', function () {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function () {
      scrollTimeout = null;
      checkScroll();
    }, 200);
  }, { passive: true });

  // Check initial scroll position (e.g. page loaded with anchor)
  setTimeout(checkScroll, 500);

  // ── 4. Time on page (heartbeat) ─────────────────────────
  var totalTime = 0;
  var heartbeatTimer = null;
  var isVisible = true;

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function () {
      if (!isVisible) return;
      totalTime += HEARTBEAT_INTERVAL / 1000;
      pushEvent('time_on_page', {
        event_data: { seconds: totalTime, type: 'heartbeat' }
      });
    }, HEARTBEAT_INTERVAL);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  document.addEventListener('visibilitychange', function () {
    isVisible = !document.hidden;
    if (isVisible) {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  });

  startHeartbeat();

  // Final flush on page exit
  function onExit() {
    pushEvent('time_on_page', {
      event_data: { seconds: totalTime, type: 'exit' }
    });
    flush();
  }

  window.addEventListener('beforeunload', onExit);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      onExit();
    }
  });
})();
