/* ARGONAUT OS · Webshop-Storefront (öffentliche Kundenseite)
 * Lädt die Shop-Produkte, führt einen Warenkorb (localStorage je Seite),
 * zeigt einen Warenkorb-Drawer mit Mengen/Entfernen und eine schlanke Kasse,
 * die die Bestellung an /api/oeffentlich/shop-bestellung sendet.
 * Wird nur auf veröffentlichten Seiten mit Produkt-Baustein eingebunden.
 *
 * Paket 317 (S3a Geschäftskunden): Kundenlink …/p/<seite>#konto=<token>.
 * Der Token steht nur im #-Teil (geht nie in Server-Protokolle), wird im
 * Browser gemerkt und als Kopfzeile x-shop-konto mitgeschickt. Mit gültigem
 * Konto: Netto-Preise, Staffeln, Zahlart „auf Rechnung" (wenn freigegeben).
 * Gebinde und Mindestmenge gelten für alle Käufer. Preise rechnet immer der
 * Server — der Browser zeigt nur an.
 */
(function () {
  var c = document.querySelector('.ao-shop[data-seite]');
  if (!c) return;
  var seite = c.getAttribute('data-seite');
  if (!seite) return;
  // Paket 317 (Claude-Befund): Solange der Shop geschlossen ist (lib/startSperre.ts), liefert die Seite
  // keine Warenkorb-Leiste, sondern nur den Hinweis. Vorher überschrieb dieses Skript den Hinweis mit den
  // Produkten samt „In den Warenkorb" — die Bestellung scheiterte dann erst an der Kasse.
  if (!c.querySelector('.ao-wk-bar')) return;
  var wkKey = 'ao_wk_' + seite;
  var kontoKey = 'ao_konto_' + seite;
  var produkte = [];
  var konto = null;
  var kontoHinweis = '';

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function eur(n) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
  function zahl(n) { return (Number(n) || 0).toLocaleString('de-DE'); }
  function ladeWk() { try { return JSON.parse(localStorage.getItem(wkKey) || '[]'); } catch (e) { return []; } }
  function saveWk(w) { try { localStorage.setItem(wkKey, JSON.stringify(w)); } catch (e) {} }

  // --- Kundenkonto per Link ---
  function tokenOk(t) { return typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t); }
  function ladeToken() { try { var t = localStorage.getItem(kontoKey); return tokenOk(t) ? t : null; } catch (e) { return null; } }
  function setToken(t) { try { if (t) { localStorage.setItem(kontoKey, t); } else { localStorage.removeItem(kontoKey); } } catch (e) {} }
  (function ausLink() {
    var m = /(?:^#|&)konto=([A-Za-z0-9_-]{32})(?:&|$)/.exec(location.hash || '');
    if (!m) return;
    setToken(m[1]);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  })();
  function kopf() { var t = ladeToken(); return t ? { 'x-shop-konto': t } : {}; }

  function produkt(id) { for (var i = 0; i < produkte.length; i++) { if (produkte[i].id === id) return produkte[i]; } return null; }
  function gebinde(p) { var g = p && Number(p.gebinde); return g >= 1 ? Math.floor(g) : 1; }
  function mindest(p) { var m = p && Number(p.mindest); return m >= 1 ? Math.floor(m) : gebinde(p); }
  /** Anzeige-Stückpreis: Geschäftskunde netto je Staffel, sonst brutto. */
  function stueck(p, menge) {
    if (!p) return 0;
    if (konto && p.staffeln && p.staffeln.length) {
      var preis = p.staffeln[0].netto, i;
      for (i = 0; i < p.staffeln.length; i++) { if (p.staffeln[i].ab <= menge) preis = p.staffeln[i].netto; }
      return preis;
    }
    if (konto && p.preis_netto != null) return p.preis_netto;
    return p.preis;
  }
  function zeilenPreis(it) { var p = produkt(it.id); return it.menge * (p ? stueck(p, it.menge) : (Number(it.preis) || 0)); }
  // Nur Anzeige — die verbindliche Summe rechnet der Server in Cent.
  function summe(w) { var s = 0, i; for (i = 0; i < w.length; i++) { s += zeilenPreis(w[i]); } return s; }
  function anzahl(w) { var a = 0, i; for (i = 0; i < w.length; i++) { a += w[i].menge; } return a; }

  function add(id) {
    var p = produkt(id);
    if (!p) return;
    var w = ladeWk(), f = null, j; for (j = 0; j < w.length; j++) { if (w[j].id === id) { f = w[j]; break; } }
    if (f) { f.menge += gebinde(p); } else { w.push({ id: p.id, name: p.name, preis: p.preis, menge: mindest(p) }); }
    saveWk(w); zeigeBar(); zeigeDrawer();
  }
  function setMenge(id, richtung) {
    var w = ladeWk(), i, p = produkt(id);
    for (i = 0; i < w.length; i++) {
      if (w[i].id === id) {
        w[i].menge += richtung * gebinde(p);
        if (richtung < 0 && w[i].menge < mindest(p)) { w.splice(i, 1); }
        break;
      }
    }
    saveWk(w); zeigeBar(); zeigeDrawer();
  }
  function entfernen(id) { var w = ladeWk().filter(function (x) { return x.id !== id; }); saveWk(w); zeigeBar(); zeigeDrawer(); }
  function leere() { saveWk([]); zeigeBar(); }

  // --- Warenkorb-Leiste (im Produkt-Baustein) ---
  var bar;
  function zeigeBar() {
    if (!bar) return;
    var w = ladeWk(), a = anzahl(w);
    if (a > 0) { bar.style.display = ''; var t = bar.querySelector('.ao-wk-text'); if (t) { t.textContent = '🛒 ' + zahl(a) + ' Artikel · ' + eur(summe(w)) + (konto ? ' netto' : '') + ' — Warenkorb öffnen'; } }
    else { bar.style.display = 'none'; }
  }

  // --- Konto-Leiste über den Produkten ---
  function zeigeKonto() {
    var alt = c.querySelector('.ao-konto'); if (alt) alt.parentNode.removeChild(alt);
    if (!konto && !kontoHinweis) return;
    var d = document.createElement('div');
    d.className = 'ao-konto' + (konto ? '' : ' ao-konto-alt');
    if (konto) {
      d.innerHTML = '<span>🏢 Angemeldet als <b>' + esc(konto.name) + '</b> · Ihre Preise netto zzgl. MwSt'
        + (konto.auf_rechnung ? ' · Kauf auf Rechnung (' + zahl(konto.zahlungsziel) + ' Tage)' : '') + '</span>'
        + '<button type="button" class="ao-konto-ab">Nicht Ihr Konto? Abmelden</button>';
    } else {
      d.innerHTML = '<span>' + esc(kontoHinweis) + '</span>';
    }
    c.insertBefore(d, c.firstChild);
    var ab = d.querySelector('.ao-konto-ab');
    if (ab) ab.addEventListener('click', function () { setToken(null); konto = null; kontoHinweis = 'Sie sind abgemeldet und sehen die normalen Shop-Preise.'; lade(); });
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
      var it = w[i], p = produkt(it.id);
      h += '<div class="ao-wk-item"><div class="ao-wk-item-name">' + esc(it.name)
        + (p && gebinde(p) > 1 ? '<div class="ao-prod-menge">in Gebinden zu ' + zahl(gebinde(p)) + '</div>' : '') + '</div>'
        + '<div class="ao-wk-menge"><button type="button" data-id="' + esc(it.id) + '" data-d="-1" aria-label="Weniger">−</button><span>' + zahl(it.menge) + '</span><button type="button" data-id="' + esc(it.id) + '" data-d="1" aria-label="Mehr">+</button></div>'
        + '<div class="ao-wk-item-preis">' + eur(zeilenPreis(it)) + '</div>'
        + '<button type="button" class="ao-wk-del" data-del="' + esc(it.id) + '" aria-label="Entfernen">✕</button></div>';
    }
    h += '</div><div class="ao-wk-summe"><span>' + (konto ? 'Summe netto' : 'Summe') + '</span><b>' + eur(summe(w)) + '</b></div>';
    h += konto
      ? '<div class="ao-wk-rechtshinweis">Alle Preise netto zzgl. gesetzlicher MwSt. Den Endbetrag mit MwSt erhalten Sie mit der Bestätigung. Versandkosten &amp; Lieferzeit stimmt der Anbieter mit Ihnen ab.</div>'
      : '<div class="ao-wk-rechtshinweis">Alle Preise inkl. MwSt. Versandkosten &amp; Lieferzeit stimmt der Anbieter mit Ihnen ab.</div>';
    h += '<form class="ao-wk-kasse" novalidate>'
      + '<div class="ao-wk-feld"><label>' + (konto ? 'Ansprechpartner*' : 'Name*') + '</label><input name="besteller" required autocomplete="name"></div>'
      + '<div class="ao-wk-zwei"><div class="ao-wk-feld"><label>E-Mail</label><input type="email" name="email" autocomplete="email"></div><div class="ao-wk-feld"><label>Telefon</label><input name="telefon" autocomplete="tel"></div></div>'
      + (konto ? '<div class="ao-wk-feld"><label>Ihre Bestellnummer (optional)</label><input name="bestellnummer" maxlength="60"></div>' : '')
      + '<div class="ao-wk-feld"><label>' + (konto ? 'Lieferanschrift / Nachricht' : 'Anschrift / Nachricht') + '</label><textarea name="nachricht" rows="2"></textarea></div>'
      + (konto
        ? '<div class="ao-wk-zahlart" role="radiogroup" aria-label="Zahlart">'
          + (konto.auf_rechnung ? '<label><input type="radio" name="zahlart" value="rechnung" checked> Auf Rechnung (' + zahl(konto.zahlungsziel) + ' Tage)</label>' : '')
          + '<label><input type="radio" name="zahlart" value="vorkasse"' + (konto.auf_rechnung ? '' : ' checked') + '> Vorkasse</label></div>'
        : '')
      + '<label class="ao-wk-dsgvo"><input type="checkbox" name="privacy"><span>Ich habe die <a href="#datenschutz">Datenschutzerklärung</a> gelesen und stimme zu.*</span></label>'
      + '<input type="text" name="firma_hp" class="ao-wk-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<button type="submit" class="btn ao-wk-senden">Zahlungspflichtig bestellen</button>'
      + '<div class="ao-wk-msg" role="status"></div></form>';
    drawer.innerHTML = h;
    kopfWireX();
    var mengeBtns = drawer.querySelectorAll('.ao-wk-menge button');
    for (var m = 0; m < mengeBtns.length; m++) {
      (function (bt) { bt.addEventListener('click', function () { setMenge(bt.getAttribute('data-id'), parseInt(bt.getAttribute('data-d'), 10)); }); })(mengeBtns[m]);
    }
    var delBtns = drawer.querySelectorAll('.ao-wk-del');
    for (var dd = 0; dd < delBtns.length; dd++) {
      (function (bt) { bt.addEventListener('click', function () { entfernen(bt.getAttribute('data-del')); }); })(delBtns[dd]);
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
    if (!besteller) { set(konto ? 'Bitte einen Ansprechpartner angeben.' : 'Bitte Ihren Namen angeben.', false); return; }
    if (!email && !tel) { set('Bitte E-Mail oder Telefon angeben.', false); return; }
    if (!el.privacy.checked) { set('Bitte der Datenschutzerklärung zustimmen.', false); return; }
    var w = ladeWk(); if (!w.length) { set('Ihr Warenkorb ist leer.', false); return; }
    var pos = [], i; for (i = 0; i < w.length; i++) { pos.push({ id: w[i].id, menge: w[i].menge }); }
    var zahlart = '';
    if (konto) { var za = f.querySelector('input[name="zahlart"]:checked'); zahlart = za ? za.value : 'vorkasse'; }
    var btn = f.querySelector('.ao-wk-senden'); btn.disabled = true; var bt = btn.textContent; btn.textContent = 'Senden …';
    var body = { seite: seite, besteller: besteller, email: email, telefon: tel, nachricht: el.nachricht.value, positionen: pos, privacy: true, firma_hp: '' };
    if (konto) { body.zahlart = zahlart; body.bestellnummer = el.bestellnummer ? el.bestellnummer.value : ''; }
    var hd = kopf(); hd['content-type'] = 'application/json';
    fetch('/api/oeffentlich/shop-bestellung', { method: 'POST', headers: hd, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.ok) {
          leere();
          drawer.innerHTML = '<div class="ao-wk-kopf"><b>Bestellung</b><button class="ao-wk-x" aria-label="Schließen">✕</button></div><div class="ao-wk-danke">✓ Vielen Dank! Ihre Bestellung ist eingegangen — wir melden uns mit der Bestätigung.</div>';
          kopfWireX();
        } else {
          if (x.d && x.d.konto_ungueltig) { setToken(null); konto = null; kontoHinweis = 'Ihr Kundenlink ist nicht mehr gültig. Bitte fordern Sie beim Anbieter einen neuen an.'; lade(); }
          set((x.d && x.d.error) || 'Bestellung fehlgeschlagen. Bitte später erneut.', false);
          btn.disabled = false; btn.textContent = bt;
        }
      }).catch(function () { set('Verbindung fehlgeschlagen. Bitte später erneut.', false); btn.disabled = false; btn.textContent = bt; });
  }

  // --- Paket 315: Produkt-Dokumente (Datenblätter, Zertifikate) zum Herunterladen ---
  function doks(p) {
    var d = (p && p.dokumente) || [];
    if (!d.length) return '';
    var h = '<div class="ao-prod-doks">', i;
    for (i = 0; i < d.length; i++) {
      h += '<a class="ao-prod-dok" target="_blank" rel="noopener" href="/api/oeffentlich/produkt-dokument?seite=' + encodeURIComponent(seite) + '&amp;id=' + encodeURIComponent(d[i].id) + '">'
        + '<span class="ao-prod-dok-art">' + esc(d[i].art) + '</span>' + esc(d[i].name) + ' (PDF)</a>';
    }
    return h + '</div>';
  }

  // --- Paket 317: Staffeln und Mengen-Hinweis ---
  function staffeln(p) {
    if (!konto || !p.staffeln || p.staffeln.length < 2) return '';
    var h = '<div class="ao-prod-staffel">', i;
    for (i = 0; i < p.staffeln.length; i++) { h += '<span>ab ' + zahl(p.staffeln[i].ab) + ': ' + eur(p.staffeln[i].netto) + '</span>'; }
    return h + '</div>';
  }
  function mengeHinweis(p) {
    var g = gebinde(p), m = mindest(p), t = [];
    if (m > 1) t.push('Mindestmenge ' + zahl(m));
    if (g > 1) t.push('in Gebinden zu ' + zahl(g));
    return t.length ? '<div class="ao-prod-menge">' + esc(t.join(' · ')) + '</div>' : '';
  }

  // --- Produkt-Kacheln ---
  var grid;
  function karten() {
    grid = c.querySelector('.ao-shop-grid'); if (!grid) return;
    if (!produkte.length) { grid.innerHTML = '<div class="ao-shop-leer">Noch keine Produkte im Shop.</div>'; return; }
    var h = '', i;
    for (i = 0; i < produkte.length; i++) {
      var p = produkte[i];
      var preis = konto && p.preis_netto != null
        ? eur(p.preis_netto) + '<span class="ao-prod-mwst">netto zzgl. MwSt' + (mindest(p) > 1 ? ' · ab ' + zahl(mindest(p)) : '') + '</span>'
        : eur(p.preis) + '<span class="ao-prod-mwst">inkl. MwSt</span>';
      h += '<div class="ao-prod">'
        + (p.bild ? '<div class="ao-prod-bild" style="background-image:url(' + encodeURI(p.bild) + ')"></div>' : '<div class="ao-prod-bild ao-prod-kein"></div>')
        + '<div class="ao-prod-body"><div class="ao-prod-name">' + esc(p.name) + '</div>'
        + (p.beschreibung ? '<div class="ao-prod-text">' + esc(p.beschreibung) + '</div>' : '')
        + doks(p)
        + staffeln(p)
        + mengeHinweis(p)
        + '<div class="ao-prod-fuss"><span class="ao-prod-preis">' + preis + '</span>'
        + '<button type="button" class="btn ao-prod-add" data-id="' + esc(p.id) + '">In den Warenkorb</button></div></div></div>';
    }
    grid.innerHTML = h;
  }

  function lade() {
    fetch('/api/oeffentlich/shop-produkte?seite=' + encodeURIComponent(seite), { headers: kopf() })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        produkte = (d && d.produkte) || [];
        konto = (d && d.konto) || null;
        if (d && d.konto_ungueltig) { setToken(null); kontoHinweis = 'Ihr Kundenlink ist nicht mehr gültig. Sie sehen die normalen Shop-Preise; einen neuen Link erhalten Sie beim Anbieter.'; }
        if (konto) kontoHinweis = '';
        zeigeKonto(); karten(); zeigeBar(); zeigeDrawer();
      })
      .catch(function () {});
  }

  bar = c.querySelector('.ao-wk-bar');
  if (bar) { bar.style.cursor = 'pointer'; bar.addEventListener('click', oeffne); }
  baueDrawer();
  var g0 = c.querySelector('.ao-shop-grid');
  if (g0) g0.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('.ao-prod-add') : null; if (b) add(b.getAttribute('data-id')); });
  lade();
})();
