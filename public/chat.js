/* ARGONAUT OS · KI-Verkaufsberater (öffentliche Kundenseite)
 * Schwebender Chat unten links: berät Besucher, spricht mit
 * /api/oeffentlich/chat (kennt die Shop-Produkte/Preise/Bestand).
 * Klar als KI gekennzeichnet (EU-KI-Verordnung Art. 50).
 *
 * G1 (09.09.2026) — läuft jetzt auch auf FREMDEN Websites:
 *   · Die API-Adresse wird aus der eigenen Skript-Adresse gebildet. Auf einer
 *     fremden Seite gibt es kein "/api/..." von uns.
 *   · Das Aussehen bringt das Widget selbst mit. Bisher steckte das CSS in
 *     seiteHtml() und damit nur in ARGONAUT-gebauten Seiten — auf einer
 *     WordPress-Seite wäre der Chat unsichtbar gewesen. Die mitgelieferten
 *     Regeln stehen in :where(), haben also Spezifität 0: wo ein ARGONAUT-
 *     Seiten-CSS existiert, gewinnt weiterhin dieses.
 *   · Die Seiten-Kennung hängt zusätzlich am URL, damit der Vorab-Aufruf des
 *     Browsers (Preflight) weiß, welche Seite gemeint ist.
 */
(function () {
  /* Die eigene Adresse MUSS gelesen werden, solange das Skript läuft —
     document.currentScript ist danach null. */
  var meinSkript = document.currentScript;

  function basisAdresse() {
    var src = meinSkript && meinSkript.src ? meinSkript.src : '';
    if (!src) {
      var alle = document.querySelectorAll('script[src]');
      for (var i = alle.length - 1; i >= 0; i--) {
        if (/\/chat\.js(\?|$)/.test(alle[i].src)) { src = alle[i].src; break; }
      }
    }
    var t = String(src || '').match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)\//i);
    return t ? t[1] : '';   // leer = gleiche Herkunft, relativer Aufruf genügt
  }

  var basis = basisAdresse();

  function starte() {
    var c = document.querySelector('.ao-chat[data-seite]');
    if (!c) return;
    var seite = c.getAttribute('data-seite');
    if (!seite) return;
    var titel = c.getAttribute('data-titel') || 'Beratung';
    var gruss = c.getAttribute('data-gruss') || 'Hallo! Wie kann ich helfen?';
    var farbe = c.getAttribute('data-farbe') || '';
    var verlauf = [];

    stilMitbringen(farbe);

    function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var fab = document.createElement('button');
    fab.className = 'ao-chat-fab'; fab.type = 'button'; fab.innerHTML = '🤖 ' + esc(titel);

    var panel = document.createElement('div');
    panel.className = 'ao-chat-panel';
    panel.innerHTML =
      '<div class="ao-chat-kopf"><span><b>' + esc(titel) + '</b><small>KI-Assistent · kann Fehler machen</small></span>'
      + '<button class="ao-chat-x" type="button" aria-label="Schließen">✕</button></div>'
      + '<div class="ao-chat-log"></div>'
      + '<form class="ao-chat-form"><input type="text" placeholder="Ihre Frage …" autocomplete="off"><button type="submit" aria-label="Senden">➤</button></form>'
      + '<div class="ao-chat-hinweis">🤖 Automatischer KI-Berater</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var log = panel.querySelector('.ao-chat-log');
    var form = panel.querySelector('.ao-chat-form');
    var input = form.querySelector('input');

    function add(role, text) {
      var d = document.createElement('div');
      d.className = 'ao-chat-msg ' + (role === 'user' ? 'ao-chat-user' : 'ao-chat-bot');
      d.textContent = text;
      log.appendChild(d); log.scrollTop = log.scrollHeight;
    }

    var begruesst = false;
    function oeffne() { panel.classList.add('auf'); fab.style.display = 'none'; if (!begruesst) { begruesst = true; add('assistant', gruss); } input.focus(); }
    function schliesse() { panel.classList.remove('auf'); fab.style.display = ''; }
    fab.addEventListener('click', oeffne);
    panel.querySelector('.ao-chat-x').addEventListener('click', schliesse);

    /* Die Kennung hängt am URL, damit der Preflight sie ohne Body kennt. */
    var ziel = (basis || '') + '/api/oeffentlich/chat?seite=' + encodeURIComponent(seite);

    var busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var frage = (input.value || '').trim();
      if (!frage || busy) return;
      add('user', frage); verlauf.push({ role: 'user', text: frage }); input.value = '';
      busy = true;
      var tip = document.createElement('div'); tip.className = 'ao-chat-msg ao-chat-bot'; tip.textContent = '…';
      log.appendChild(tip); log.scrollTop = log.scrollHeight;
      fetch(ziel, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seite: seite, frage: frage, verlauf: verlauf.slice(-8) })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (tip.parentNode) tip.parentNode.removeChild(tip);
          var a = (x.ok && x.d && x.d.antwort) ? x.d.antwort : ((x.d && x.d.error) || 'Entschuldigung, das hat gerade nicht geklappt.');
          add('assistant', a);
          if (x.ok) verlauf.push({ role: 'assistant', text: a });
        }).catch(function () {
          if (tip.parentNode) tip.parentNode.removeChild(tip);
          add('assistant', 'Verbindung fehlgeschlagen. Bitte später erneut.');
        }).finally(function () { busy = false; });
    });
  }

  /* Das Aussehen für fremde Seiten. Alles in :where() — Spezifität 0, damit
     ein vorhandenes ARGONAUT-Seiten-CSS immer gewinnt, egal in welcher
     Reihenfolge die Stile im Dokument stehen. */
  function stilMitbringen(farbe) {
    if (document.getElementById('ao-chat-stil')) return;
    var p = /^#[0-9a-fA-F]{3,8}$/.test(farbe || '') ? farbe : '#0A1628';
    var css = [
      ':where(.ao-chat){display:none}',
      ':where(.ao-chat-fab){position:fixed;left:20px;bottom:20px;z-index:2147483000;background:' + p + ';color:#fff;border:none;border-radius:999px;padding:13px 20px;font:700 15px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;box-shadow:0 8px 24px -6px rgba(0,0,0,.45)}',
      ':where(.ao-chat-panel){position:fixed;left:20px;bottom:20px;z-index:2147483001;width:min(360px,calc(100vw - 40px));height:min(520px,calc(100vh - 40px));background:#fff;border:1px solid #e7ebf1;border-radius:16px;box-shadow:0 20px 60px -12px rgba(0,0,0,.4);display:none;flex-direction:column;overflow:hidden;font:400 14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c2430;text-align:left}',
      ':where(.ao-chat-panel.auf){display:flex}',
      ':where(.ao-chat-kopf){background:' + p + ';color:#fff;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px}',
      ':where(.ao-chat-kopf b){font-size:15px}',
      ':where(.ao-chat-kopf small){display:block;opacity:.8;font-weight:400;font-size:11px}',
      ':where(.ao-chat-x){background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;padding:0}',
      ':where(.ao-chat-log){flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f7fafc}',
      ':where(.ao-chat-msg){max-width:85%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.5;white-space:pre-wrap;margin:0}',
      ':where(.ao-chat-bot){align-self:flex-start;background:#fff;border:1px solid #e7ebf1;color:#1c2430;border-bottom-left-radius:4px}',
      ':where(.ao-chat-user){align-self:flex-end;background:' + p + ';color:#fff;border-bottom-right-radius:4px}',
      ':where(.ao-chat-form){display:flex;gap:8px;padding:12px;border-top:1px solid #eceff3;background:#fff;margin:0}',
      ':where(.ao-chat-form input){flex:1;border:1px solid #d3dbe4;border-radius:10px;padding:10px 12px;font:inherit;font-size:14px;box-sizing:border-box;background:#fff;color:#1c2430}',
      ':where(.ao-chat-form button){background:' + p + ';color:#fff;border:none;border-radius:10px;padding:0 14px;font-size:16px;cursor:pointer}',
      ':where(.ao-chat-hinweis){padding:7px 12px;background:#f2f5f9;color:#5b6b7d;font-size:11px;text-align:center;border-top:1px solid #eceff3}',
      '@media (prefers-reduced-motion: reduce){:where(.ao-chat-fab,.ao-chat-panel){transition:none}}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'ao-chat-stil';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', starte);
  else starte();
})();
