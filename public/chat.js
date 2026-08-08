/* ARGONAUT OS · KI-Verkaufsberater (öffentliche Kundenseite)
 * Schwebender Chat unten links: berät Besucher, spricht mit
 * /api/oeffentlich/chat (kennt die Shop-Produkte/Preise/Bestand).
 * Klar als KI gekennzeichnet (EU-KI-Verordnung Art. 50).
 * Wird nur auf veröffentlichten Seiten mit Chatbot-Baustein eingebunden.
 */
(function () {
  var c = document.querySelector('.ao-chat[data-seite]');
  if (!c) return;
  var seite = c.getAttribute('data-seite');
  if (!seite) return;
  var titel = c.getAttribute('data-titel') || 'Beratung';
  var gruss = c.getAttribute('data-gruss') || 'Hallo! Wie kann ich helfen?';
  var verlauf = [];

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

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var frage = (input.value || '').trim();
    if (!frage || busy) return;
    add('user', frage); verlauf.push({ role: 'user', text: frage }); input.value = '';
    busy = true;
    var tip = document.createElement('div'); tip.className = 'ao-chat-msg ao-chat-bot'; tip.textContent = '…';
    log.appendChild(tip); log.scrollTop = log.scrollHeight;
    fetch('/api/oeffentlich/chat', {
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
})();
