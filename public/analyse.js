/* ==========================================================================
 * ARGONAUT OS · public/analyse.js — cookiefreies Mess-Skript
 * Meldet an /api/oeffentlich/analyse: Seitenaufruf (mit Titel + Herkunft/UTM),
 * Klicks (wohin) und Verweildauer (beim Verlassen, nur sichtbare Zeit).
 * Kein Cookie, kein localStorage — nichts wird auf dem Gerät gespeichert.
 * Welche Seite: window.__ANALYSE_SEITE  ODER  data-seite am <script>  ODER
 * Standard 'argonaut-os' (die eigene Seite).
 * ========================================================================== */
(function () {
  'use strict';
  try {
    var skript = document.currentScript;
    var SEITE =
      (window && window.__ANALYSE_SEITE) ||
      (skript && skript.getAttribute('data-seite')) ||
      'argonaut-os';
    var ENDPUNKT =
      (skript && skript.getAttribute('data-endpunkt')) || '/api/oeffentlich/analyse';

    // Grobe Bot-Ausklammerung (die zaehlen wir nicht als Besucher).
    if (/(bot|spider|crawl|slurp|preview|lighthouse|headless|monitor)/i.test(navigator.userAgent || '')) return;

    function senden(daten) {
      try {
        daten.seite = SEITE;
        var koerper = JSON.stringify(daten);
        if (navigator.sendBeacon) {
          navigator.sendBeacon(ENDPUNKT, new Blob([koerper], { type: 'text/plain' }));
        } else {
          fetch(ENDPUNKT, {
            method: 'POST',
            body: koerper,
            keepalive: true,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      } catch (e) {}
    }

    function pfad() {
      return (location.pathname || '/').slice(0, 300);
    }

    var start = Date.now();
    var sichtbarSeit = Date.now();
    var sichtbarSumme = 0;
    var aktuellerPfad = pfad();

    function seitenaufruf() {
      start = Date.now();
      sichtbarSeit = Date.now();
      sichtbarSumme = 0;
      aktuellerPfad = pfad();
      senden({
        typ: 'view',
        pfad: aktuellerPfad,
        titel: (document.title || '').slice(0, 300),
        referrer: document.referrer || '',
        abfrage: location.search || '',
      });
    }

    function verweilSenden() {
      if (document.visibilityState === 'visible') {
        sichtbarSumme += Date.now() - sichtbarSeit;
        sichtbarSeit = Date.now();
      }
      var ms = sichtbarSumme > 0 ? sichtbarSumme : Date.now() - start;
      if (ms < 300) return; // Ministips ignorieren
      senden({ typ: 'verweil', pfad: aktuellerPfad, verweildauer_ms: ms });
    }

    // Verweildauer nur zaehlen, solange der Tab sichtbar ist.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        sichtbarSumme += Date.now() - sichtbarSeit;
        verweilSenden();
      } else {
        sichtbarSeit = Date.now();
      }
    });
    window.addEventListener('pagehide', verweilSenden);

    // Klicks auf Links, Buttons, Elemente mit data-track.
    document.addEventListener(
      'click',
      function (e) {
        try {
          var el = e.target && e.target.closest ? e.target.closest('a,button,[data-track],[role="button"]') : null;
          if (!el) return;
          var ziel = el.getAttribute('data-track') || (el.textContent || '').trim().slice(0, 120);
          var href = el.getAttribute && el.getAttribute('href');
          if (!ziel && href) ziel = href;
          if (ziel && href) ziel = ziel + '  →  ' + href;
          senden({ typ: 'click', pfad: pfad(), ziel: (ziel || 'Klick').slice(0, 200) });
        } catch (e2) {}
      },
      true,
    );

    // SPA-Navigationen (Next.js) erkennen: pushState/replaceState + Zurueck/Vor.
    function aufNavigation() {
      if (pfad() === aktuellerPfad) return;
      verweilSenden(); // Verweildauer der alten Seite abschliessen
      seitenaufruf(); // neuen Aufruf melden
    }
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      if (typeof orig !== 'function') return;
      history[m] = function () {
        var r = orig.apply(this, arguments);
        setTimeout(aufNavigation, 0);
        return r;
      };
    });
    window.addEventListener('popstate', function () {
      setTimeout(aufNavigation, 0);
    });

    // Erster Seitenaufruf.
    if (document.readyState === 'complete' || document.readyState === 'interactive') seitenaufruf();
    else window.addEventListener('DOMContentLoaded', seitenaufruf);
  } catch (e) {}
})();
