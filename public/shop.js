/* ARGONAUT OS · Webshop-Storefront (öffentliche Kundenseite)
 * Lädt die Shop-Produkte, führt einen Warenkorb (localStorage je Seite),
 * zeigt einen Warenkorb-Drawer mit Mengen/Entfernen und eine schlanke Kasse,
 * die die Bestellung an /api/oeffentlich/shop-bestellung sendet.
 * Wird nur auf veröffentlichten Seiten mit Produkt-Baustein eingebunden.
 */
(function () {
  var c = document.querySelector('.ao-shop[data-seite]');
  if (!c) return;
  var seite = c.getAttribute('data-seite');
  if (!seite) return;
  var wkKey = 'ao_wk_' + seite;
  var produkte = [];

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function eur(n) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
  function ladeWk() { try { return JSON.parse(localStorage.getItem(wkKey) || '[]'); } catch (e) { return []; } }
  function saveWk(w) { try { localStorage.setItem(wkKey, JSON.stringify(w)); } catch (e) {} }
  function summe(w) { var s = 0, i; for (i = 0; i < w.length; i++) { s += w[i].menge * (Number(w[i].preis) || 0); } return s; }
  function anzahl(w) { var a = 0, i; for (i = 0; i < w.length; i++) { a += w[i].menge; } return a; }

  function add(id) {
    var p = null, i; for (i = 0; i < produkte.length; i++) { if (produkte[i].id === id) { p = produkte[i]; break; } }
    if (!p) return;
    var w = ladeWk(), f = null, j; for (j = 0; j < w.length; j++) { if (w[j].id === id) { f = w[j]; break; } }
    if (f) { f.menge++; } else { w.push({ id: p.id, name: p.name, preis: p.preis, menge: 1 }); }
    saveWk(w); zeigeBar(); zeigeDrawer();
  }
  function setMenge(id, delta) {
    var w = ladeWk(), i;
    for (i = 0; i < w.length; i++) { if (w[i].id === id) { w[i].menge += delta; if (w[i].menge <= 0) { w.splice(i, 1); } break; } }
    saveWk(w); zeigeBar(); zeigeDrawer();
  }
  function leere() { saveWk([]); zeigeBar(); }

  // --- Warenkorb-Leiste (im Produkt-Baustein) ---
  var bar;
  function zeigeBar() {
    if (!bar) return;
    var w = ladeWk(), a = anzahl(w);
    if (a > 0) { bar.style.display = ''; var t = bar.querySelector('.ao-wk-text'); if (t) { t.textContent = '🛒 ' + a + ' Artikel · ' + eur(summe(w)) + ' — Warenkorb öffnen'; } }
    else { bar.style.display = 'none'; }
  }

  // --- Drawer (Warenkorb + Kasse) ---
  var overlay, drawer, offen = false;
  function baueDrawer() {
    overlay = document.createElement('div'); overlay.className = 'ao-wk-overlay';
    drawer = document.createElement('div'); drawer.className = 'ao-wk-drawer';
    overlay.appendChild(drawer);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) schliesse(); });
    document.body.appendChild(overlay);
  }
  function oeffne() { offen = true; overlay.classList.add('auf'); zeigeDrawer(); }
  function schliesse() { offen = false; overlay.classList.remove('auf'); }
  function kopfWireX() { var x = drawer.querySelector('.ao-wk-x'); if (x) x.addEventListener('click', schliesse); }

  function zeigeDrawer() {
    if (!drawer || !offen) return;
    var w = ladeWk();
    if (!w.length) {
      drawer.innerHTML = '<div class="ao-wk-kopf"><b>Warenkorb</b><button class="ao-wk-x" aria-label="Schließen">✕</button></div><div class="ao-wk-leer">Ihr Warenkorb ist leer.</div>';
      kopfWireX(); return;
    }
    var h = '<div class="ao-wk-kopf"><b>Warenkorb</b><button class="ao-wk-x" aria-label="Schließen">✕</button></div><div class="ao-wk-items">';
    for (var i = 0; i < w.length; i++) {
      var it = w[i];
      h += '<div class="ao-wk-item"><div class="ao-wk-item-name">' + esc(it.name) + '</div>'
        + '<div class="ao-wk-menge"><button type="button" data-id="' + esc(it.id) + '" data-d="-1">−</button><span>' + it.menge + '</span><button type="button" data-id="' + esc(it.id) + '" data-d="1">+</button></div>'
        + '<div class="ao-wk-item-preis">' + eur(it.menge * (Number(it.preis) || 0)) + '</div>'
        + '<button type="button" class="ao-wk-del" data-del="' + esc(it.id) + '" aria-label="Entfernen">✕</button></div>';
    }
    h += '</div><div class="ao-wk-summe"><span>Summe</span><b>' + eur(summe(w)) + '</b></div>';
    h += '<form class="ao-wk-kasse" novalidate>'
      + '<div class="ao-wk-feld"><label>Name*</label><input name="besteller" required></div>'
      + '<div class="ao-wk-zwei"><div class="ao-wk-feld"><label>E-Mail</label><input type="email" name="email"></div><div class="ao-wk-feld"><label>Telefon</label><input name="telefon"></div></div>'
      + '<div class="ao-wk-feld"><label>Anschrift / Nachricht</label><textarea name="nachricht" rows="2"></textarea></div>'
      + '<label class="ao-wk-dsgvo"><input type="checkbox" name="privacy"> Ich habe die <a href="#datenschutz">Datenschutzerklärung</a> gelesen und stimme zu.*</label>'
      + '<input type="text" name="firma_hp" class="ao-wk-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<button type="submit" class="btn ao-wk-senden">Bestellung absenden</button>'
      + '<div class="ao-wk-msg" role="status"></div></form>';
    drawer.innerHTML = h;
    kopfWireX();
    var mengeBtns = drawer.querySelectorAll('.ao-wk-menge button');
    for (var m = 0; m < mengeBtns.length; m++) {
      (function (bt) { bt.addEventListener('click', function () { setMenge(bt.getAttribute('data-id'), parseInt(bt.getAttribute('data-d'), 10)); }); })(mengeBtns[m]);
    }
    var delBtns = drawer.querySelectorAll('.ao-wk-del');
    for (var dd = 0; dd < delBtns.length; dd++) {
      (function (bt) { bt.addEventListener('click', function () { setMenge(bt.getAttribute('data-del'), -999999); }); })(delBtns[dd]);
    }
    var form = drawer.querySelector('.ao-wk-kasse');
    if (form) form.addEventListener('submit', absenden);
  }

  function absenden(e) {
    e.preventDefault();
    var f = e.target, el = f.elements, msg = f.querySelector('.ao-wk-msg');
    function set(t, ok) { msg.textContent = t; msg.className = 'ao-wk-msg ' + (ok ? 'ok' : 'err'); }
    if (el.firma_hp && el.firma_hp.value) return;
    var besteller = (el.besteller.value || '').trim();
    var email = (el.email.value || '').trim();
    var tel = (el.telefon.value || '').trim();
    if (!besteller) { set('Bitte Ihren Namen angeben.', false); return; }
    if (!email && !tel) { set('Bitte E-Mail oder Telefon angeben.', false); return; }
    if (!el.privacy.checked) { set('Bitte der Datenschutzerklärung zustimmen.', false); return; }
    var w = ladeWk(); if (!w.length) { set('Ihr Warenkorb ist leer.', false); return; }
    var pos = [], i; for (i = 0; i < w.length; i++) { pos.push({ id: w[i].id, menge: w[i].menge }); }
    var btn = f.querySelector('.ao-wk-senden'); btn.disabled = true; var bt = btn.textContent; btn.textContent = 'Senden …';
    fetch('/api/oeffentlich/shop-bestellung', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seite: seite, besteller: besteller, email: email, telefon: tel, nachricht: el.nachricht.value, positionen: pos, privacy: true, firma_hp: '' })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.ok) {
          leere();
          drawer.innerHTML = '<div class="ao-wk-kopf"><b>Bestellung</b><button class="ao-wk-x" aria-label="Schließen">✕</button></div><div class="ao-wk-danke">✓ Vielen Dank! Ihre Bestellung ist eingegangen — wir melden uns mit der Bestätigung.</div>';
          kopfWireX();
        } else {
          set((x.d && x.d.error) || 'Bestellung fehlgeschlagen. Bitte später erneut.', false);
          btn.disabled = false; btn.textContent = bt;
        }
      }).catch(function () { set('Verbindung fehlgeschlagen. Bitte später erneut.', false); btn.disabled = false; btn.textContent = bt; });
  }

  // --- Produkt-Kacheln ---
  function karten() {
    var grid = c.querySelector('.ao-shop-grid'); if (!grid) return;
    if (!produkte.length) { grid.innerHTML = '<div class="ao-shop-leer">Noch keine Produkte im Shop.</div>'; return; }
    var h = '', i;
    for (i = 0; i < produkte.length; i++) {
      var p = produkte[i];
      h += '<div class="ao-prod">'
        + (p.bild ? '<div class="ao-prod-bild" style="background-image:url(' + encodeURI(p.bild) + ')"></div>' : '<div class="ao-prod-bild ao-prod-kein"></div>')
        + '<div class="ao-prod-body"><div class="ao-prod-name">' + esc(p.name) + '</div>'
        + (p.beschreibung ? '<div class="ao-prod-text">' + esc(p.beschreibung) + '</div>' : '')
        + '<div class="ao-prod-fuss"><span class="ao-prod-preis">' + eur(p.preis) + '</span>'
        + '<button type="button" class="btn ao-prod-add" data-id="' + esc(p.id) + '">In den Warenkorb</button></div></div></div>';
    }
    grid.innerHTML = h;
    grid.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('.ao-prod-add') : null; if (b) add(b.getAttribute('data-id')); });
  }

  bar = c.querySelector('.ao-wk-bar');
  if (bar) { bar.style.cursor = 'pointer'; bar.addEventListener('click', oeffne); }
  baueDrawer();
  fetch('/api/oeffentlich/shop-produkte?seite=' + encodeURIComponent(seite))
    .then(function (r) { return r.json(); })
    .then(function (d) { produkte = (d && d.produkte) || []; karten(); zeigeBar(); })
    .catch(function () {});
})();
