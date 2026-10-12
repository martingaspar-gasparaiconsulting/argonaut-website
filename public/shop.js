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
 *
 * Paket 324 (S4 Shop mehrsprachig): Sprach-Umschalter, sobald der Betrieb eine
 * zweite Sprache freigegeben hat. Gemerkte Wahl je Shop, sonst Browser-Sprache
 * (entscheidet der Server, nur aus den angebotenen Sprachen). Alle Texte über
 * T(); DE ist der Rückfall und muss genau lib/shopSprachen.ts TEXT_DE entsprechen
 * (tests/shopSprachenP324). Zahlen und Preise im Format der Sprache, immer EUR,
 * immer westliche Ziffern. Arabisch und Persisch von rechts nach links.
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
  var sprachKey = 'ao_sprache_' + seite;
  var produkte = [];
  var konto = null;
  var kontoHinweis = '';
  var sprache = 'de', bcp = 'de-DE', rtl = false, sprachen = [], texte = null;
  // Paket 327 (S3b): Shop nur für geprüfte Geschäftskunden — dann ohne Konto keine Warenkorb-Knöpfe (der Server lehnt ohnehin ab).
  var nurGewerbe = false;
  function gesperrt() { return nurGewerbe && !(konto && konto.nachweis); }
  var DE = {
    sprache: "Sprache",
    warenkorb: "Warenkorb",
    warenkorb_leiste: "{n} Artikel · {summe} — Warenkorb öffnen",
    warenkorb_leiste_netto: "{n} Artikel · {summe} netto — Warenkorb öffnen",
    schliessen: "Schließen",
    leer: "Ihr Warenkorb ist leer.",
    gebinde: "in Gebinden zu {n}",
    mindestmenge: "Mindestmenge {n}",
    weniger: "Weniger",
    mehr: "Mehr",
    entfernen: "Entfernen",
    summe: "Summe",
    summe_netto: "Summe netto",
    hinweis_brutto: "Alle Preise inkl. MwSt. Versandkosten & Lieferzeit stimmt der Anbieter mit Ihnen ab.",
    hinweis_netto: "Alle Preise netto zzgl. gesetzlicher MwSt. Den Endbetrag mit MwSt erhalten Sie mit der Bestätigung. Versandkosten & Lieferzeit stimmt der Anbieter mit Ihnen ab.",
    feld_name: "Name*",
    feld_ansprechpartner: "Ansprechpartner*",
    feld_email: "E-Mail",
    feld_telefon: "Telefon",
    feld_bestellnummer: "Ihre Bestellnummer (optional)",
    feld_anschrift: "Anschrift / Nachricht",
    feld_lieferanschrift: "Lieferanschrift / Nachricht",
    zahlart: "Zahlart",
    auf_rechnung: "Auf Rechnung ({n} Tage)",
    vorkasse: "Vorkasse",
    datenschutz: "Ich habe die {link}Datenschutzerklärung{/link} gelesen und stimme zu.*",
    bestellen: "Zahlungspflichtig bestellen",
    senden: "Senden …",
    fehler_name: "Bitte Ihren Namen angeben.",
    fehler_ansprechpartner: "Bitte einen Ansprechpartner angeben.",
    fehler_kontakt: "Bitte E-Mail oder Telefon angeben.",
    fehler_datenschutz: "Bitte der Datenschutzerklärung zustimmen.",
    bestellung: "Bestellung",
    danke: "✓ Vielen Dank! Ihre Bestellung ist eingegangen — wir melden uns mit der Bestätigung.",
    fehler_bestellung: "Bestellung fehlgeschlagen. Bitte später erneut.",
    fehler_verbindung: "Verbindung fehlgeschlagen. Bitte später erneut.",
    konto: "Angemeldet als {name} · Ihre Preise netto zzgl. MwSt",
    konto_rechnung: "Kauf auf Rechnung ({n} Tage)",
    abmelden: "Nicht Ihr Konto? Abmelden",
    abgemeldet: "Sie sind abgemeldet und sehen die normalen Shop-Preise.",
    link_ungueltig: "Ihr Kundenlink ist nicht mehr gültig. Sie sehen die normalen Shop-Preise; einen neuen Link erhalten Sie beim Anbieter.",
    link_ungueltig_kasse: "Ihr Kundenlink ist nicht mehr gültig. Bitte fordern Sie beim Anbieter einen neuen an.",
    keine_produkte: "Noch keine Produkte im Shop.",
    ab: "ab {n}",
    inkl_mwst: "inkl. MwSt",
    netto_mwst: "netto zzgl. MwSt",
    in_warenkorb: "In den Warenkorb",
    version: "Version",
    rechtstexte: "Rechtliche Hinweise (AGB, Widerrufsbelehrung, Datenschutzerklärung) liegen nur auf Deutsch vor.",
    dok_sdb: "Sicherheitsdatenblatt",
    dok_tdb: "Technisches Merkblatt",
    dok_leistungserklaerung: "Leistungserklärung",
    dok_konformitaet: "Konformitätserklärung",
    dok_spezifikation: "Produktspezifikation",
    dok_zertifikat: "Zertifikat",
    dok_anleitung: "Anleitung",
    dok_sonstiges: "Dokument",
    nur_gewerbe: "Bestellungen nur für geprüfte Geschäftskunden. Für ein Kundenkonto wenden Sie sich bitte an uns."
  };
  /** Text in der Sprache des Shops, Platzhalter {n}, {summe}, {name} gefüllt (Werte schon fertig). */
  function T(k, w) {
    var t = (texte && typeof texte[k] === 'string' && texte[k]) || DE[k] || k;
    if (w) { t = t.replace(/\{(\/?[a-z_]+)\}/g, function (m, x) { return Object.prototype.hasOwnProperty.call(w, x) ? String(w[x]) : m; }); }
    return t;
  }
  /** Wie T, aber für HTML: erst maskieren, dann Platzhalter (Werte müssen schon maskiert sein). */
  function TH(k, w) {
    var t = esc((texte && typeof texte[k] === 'string' && texte[k]) || DE[k] || k);
    if (w) { t = t.replace(/\{(\/?[a-z_]+)\}/g, function (m, x) { return Object.prototype.hasOwnProperty.call(w, x) ? String(w[x]) : m; }); }
    return t;
  }
  function ladeSprache() { try { var s = localStorage.getItem(sprachKey); return s && /^[a-z]{2}$/.test(s) ? s : ''; } catch (e) { return ''; } }
  function setSprache(s) { try { localStorage.setItem(sprachKey, s); } catch (e) {} }
  function fmt() { return (bcp || 'de-DE') + '-u-nu-latn'; }

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function eur(n) { try { return (Number(n) || 0).toLocaleString(fmt(), { style: 'currency', currency: 'EUR' }); } catch (e) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); } }
  function zahl(n) { try { return (Number(n) || 0).toLocaleString(fmt()); } catch (e) { return (Number(n) || 0).toLocaleString('de-DE'); } }
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
    if (!p || gesperrt()) return;
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
    if (a > 0 && !gesperrt()) { bar.style.display = ''; var t = bar.querySelector('.ao-wk-text'); if (t) { t.textContent = '🛒 ' + T(konto ? 'warenkorb_leiste_netto' : 'warenkorb_leiste', { n: zahl(a), summe: eur(summe(w)) }); } }
    else { bar.style.display = 'none'; }
  }

  // --- Konto-Leiste über den Produkten ---
  function zeigeKonto() {
    var alt = c.querySelector('.ao-konto'); if (alt) alt.parentNode.removeChild(alt);
    if (gesperrt()) {
      var g = document.createElement('div'); g.className = 'ao-konto ao-konto-alt ao-nur-gewerbe';
      g.innerHTML = '<span>🏢 ' + TH('nur_gewerbe') + '</span>';
      c.insertBefore(g, c.firstChild);
      return;
    }
    if (!konto && !kontoHinweis) return;
    var d = document.createElement('div');
    d.className = 'ao-konto' + (konto ? '' : ' ao-konto-alt');
    if (konto) {
      d.innerHTML = '<span>🏢 ' + TH('konto', { name: '<b>' + esc(konto.name) + '</b>' })
        + (konto.auf_rechnung ? ' · ' + TH('konto_rechnung', { n: zahl(konto.zahlungsziel) }) : '') + '</span>'
        + '<button type="button" class="ao-konto-ab">' + TH('abmelden') + '</button>';
    } else {
      d.innerHTML = '<span>' + TH(kontoHinweis) + '</span>';
    }
    c.insertBefore(d, c.firstChild);
    var ab = d.querySelector('.ao-konto-ab');
    if (ab) ab.addEventListener('click', function () { setToken(null); konto = null; kontoHinweis = 'abgemeldet'; lade(); });
  }

  // --- Drawer (Warenkorb + Kasse) ---
  var overlay, drawer, offen = false;
  function baueDrawer() {
    overlay = document.createElement('div'); overlay.className = 'ao-wk-overlay';
    drawer = document.createElement('div'); drawer.className = 'ao-wk-drawer';
    drawer.setAttribute('role', 'dialog');
    overlay.appendChild(drawer);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) schliesse(); });
    document.body.appendChild(overlay);
  }
  function oeffne() { offen = true; overlay.classList.add('auf'); zeigeDrawer(); }
  function schliesse() { offen = false; overlay.classList.remove('auf'); }
  function richtung() {
    c.setAttribute('lang', sprache); c.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    if (drawer) { drawer.setAttribute('lang', sprache); drawer.setAttribute('dir', rtl ? 'rtl' : 'ltr'); drawer.setAttribute('aria-label', T('warenkorb')); }
  }
  function kopfWireX() { var x = drawer.querySelector('.ao-wk-x'); if (x) x.addEventListener('click', schliesse); }

  function zeigeDrawer() {
    if (!drawer || !offen) return;
    var w = ladeWk();
    if (!w.length) {
      drawer.innerHTML = '<div class="ao-wk-kopf"><b>' + TH('warenkorb') + '</b><button class="ao-wk-x" aria-label="' + TH('schliessen') + '">✕</button></div><div class="ao-wk-leer">' + TH('leer') + '</div>';
      kopfWireX(); return;
    }
    var h = '<div class="ao-wk-kopf"><b>' + TH('warenkorb') + '</b><button class="ao-wk-x" aria-label="' + TH('schliessen') + '">✕</button></div><div class="ao-wk-items">';
    for (var i = 0; i < w.length; i++) {
      var it = w[i], p = produkt(it.id);
      h += '<div class="ao-wk-item"><div class="ao-wk-item-name">' + esc(it.name)
        + (p && gebinde(p) > 1 ? '<div class="ao-prod-menge">' + TH('gebinde', { n: zahl(gebinde(p)) }) + '</div>' : '') + '</div>'
        + '<div class="ao-wk-menge"><button type="button" data-id="' + esc(it.id) + '" data-d="-1" aria-label="' + TH('weniger') + '">−</button><span>' + zahl(it.menge) + '</span><button type="button" data-id="' + esc(it.id) + '" data-d="1" aria-label="' + TH('mehr') + '">+</button></div>'
        + '<div class="ao-wk-item-preis">' + eur(zeilenPreis(it)) + '</div>'
        + '<button type="button" class="ao-wk-del" data-del="' + esc(it.id) + '" aria-label="' + TH('entfernen') + '">✕</button></div>';
    }
    h += '</div><div class="ao-wk-summe"><span>' + TH(konto ? 'summe_netto' : 'summe') + '</span><b>' + eur(summe(w)) + '</b></div>';
    h += '<div class="ao-wk-rechtshinweis">' + TH(konto ? 'hinweis_netto' : 'hinweis_brutto') + '</div>';
    if (sprache !== 'de') h += '<div class="ao-wk-rechtshinweis">' + TH('rechtstexte') + '</div>';
    h += gefahrKasse(w);
    h += '<form class="ao-wk-kasse" novalidate>'
      + '<div class="ao-wk-feld"><label>' + TH(konto ? 'feld_ansprechpartner' : 'feld_name') + '</label><input name="besteller" required autocomplete="name"></div>'
      + '<div class="ao-wk-zwei"><div class="ao-wk-feld"><label>' + TH('feld_email') + '</label><input type="email" name="email" autocomplete="email" dir="ltr"></div><div class="ao-wk-feld"><label>' + TH('feld_telefon') + '</label><input name="telefon" autocomplete="tel" dir="ltr"></div></div>'
      + (konto ? '<div class="ao-wk-feld"><label>' + TH('feld_bestellnummer') + '</label><input name="bestellnummer" maxlength="60"></div>' : '')
      + '<div class="ao-wk-feld"><label>' + TH(konto ? 'feld_lieferanschrift' : 'feld_anschrift') + '</label><textarea name="nachricht" rows="2"></textarea></div>'
      + (konto
        ? '<div class="ao-wk-zahlart" role="radiogroup" aria-label="' + TH('zahlart') + '">'
          + (konto.auf_rechnung ? '<label><input type="radio" name="zahlart" value="rechnung" checked> ' + TH('auf_rechnung', { n: zahl(konto.zahlungsziel) }) + '</label>' : '')
          + '<label><input type="radio" name="zahlart" value="vorkasse"' + (konto.auf_rechnung ? '' : ' checked') + '> ' + TH('vorkasse') + '</label></div>'
        : '')
      + '<label class="ao-wk-dsgvo"><input type="checkbox" name="privacy"><span>' + TH('datenschutz', { link: '<a href="#datenschutz">', '/link': '</a>' }) + '</span></label>'
      + '<input type="text" name="firma_hp" class="ao-wk-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<button type="submit" class="btn ao-wk-senden">' + TH('bestellen') + '</button>'
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
    if (!besteller) { set(T(konto ? 'fehler_ansprechpartner' : 'fehler_name'), false); return; }
    if (!email && !tel) { set(T('fehler_kontakt'), false); return; }
    if (!el.privacy.checked) { set(T('fehler_datenschutz'), false); return; }
    var w = ladeWk(); if (!w.length) { set(T('leer'), false); return; }
    var pos = [], i; for (i = 0; i < w.length; i++) { pos.push({ id: w[i].id, menge: w[i].menge }); }
    var zahlart = '';
    if (konto) { var za = f.querySelector('input[name="zahlart"]:checked'); zahlart = za ? za.value : 'vorkasse'; }
    var btn = f.querySelector('.ao-wk-senden'); btn.disabled = true; var bt = btn.textContent; btn.textContent = T('senden');
    var body = { seite: seite, besteller: besteller, email: email, telefon: tel, nachricht: el.nachricht.value, positionen: pos, privacy: true, firma_hp: '', sprache: sprache };
    if (konto) { body.zahlart = zahlart; body.bestellnummer = el.bestellnummer ? el.bestellnummer.value : ''; }
    var hd = kopf(); hd['content-type'] = 'application/json';
    fetch('/api/oeffentlich/shop-bestellung', { method: 'POST', headers: hd, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.ok) {
          leere();
          drawer.innerHTML = '<div class="ao-wk-kopf"><b>' + TH('bestellung') + '</b><button class="ao-wk-x" aria-label="' + TH('schliessen') + '">✕</button></div><div class="ao-wk-danke">' + TH('danke') + '</div>';
          kopfWireX();
        } else {
          if (x.d && x.d.konto_ungueltig) { setToken(null); konto = null; kontoHinweis = 'link_ungueltig_kasse'; lade(); }
          // Meldungen des Servers sind deutsch — in fremder Sprache die übersetzte Kurzfassung, das Deutsche in Klammern.
          var fm = (x.d && x.d.error) || '';
          set(sprache === 'de' ? (fm || T('fehler_bestellung')) : T('fehler_bestellung') + (fm ? ' (' + fm + ')' : ''), false);
          btn.disabled = false; btn.textContent = bt;
        }
      }).catch(function () { set(T('fehler_verbindung'), false); btn.disabled = false; btn.textContent = bt; });
  }

  // --- Paket 315: Produkt-Dokumente (Datenblätter, Zertifikate) zum Herunterladen ---
  function doks(p) {
    var d = (p && p.dokumente) || [];
    if (!d.length) return '';
    var h = '<div class="ao-prod-doks">', i;
    for (i = 0; i < d.length; i++) {
      h += '<a class="ao-prod-dok" target="_blank" rel="noopener" hreflang="' + esc(d[i].sprache || 'de') + '" href="/api/oeffentlich/produkt-dokument?seite=' + encodeURIComponent(seite) + '&amp;id=' + encodeURIComponent(d[i].id) + '">'
        + '<span class="ao-prod-dok-art">' + esc(sprache === 'de' ? d[i].art : String(d[i].sprache || 'de').toUpperCase()) + '</span>' + (sprache === 'de' || !d[i].art_key ? esc(d[i].name) : esc(dokName(d[i]))) + ' (PDF)</a>';
    }
    return h + '</div>';
  }

  /** Paket 324: Name in der Shop-Sprache — eigener Titel oder Art, Version, Dokument-Sprache (Deutsch liefert der Server fertig). */
  function dokName(x) {
    var t = x.titel || T('dok_' + x.art_key);
    if (x.version) t += ' · ' + T('version') + ' ' + x.version;
    if (x.sprache && x.sprache !== sprache) t += ' · ' + String(x.sprache).toUpperCase();
    return t;
  }

  // --- Paket 326 (S2): Gefahr-Angaben (CLP). Kommen nur bestätigt und nur nach Freigabe vom Server.
  // Bewusst immer Deutsch (Kennzeichnung in der Landessprache), unabhängig von der Shop-Sprache.
  function rauten(g) {
    var h = '', i, p;
    for (i = 0; i < g.piktogramme.length; i++) {
      p = g.piktogramme[i];
      h += '<span class="ao-ghs" title="' + esc(p.key + ' ' + p.label) + '" role="img" aria-label="' + esc('Gefahrenpiktogramm ' + p.label) + '">'
        + '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)" fill="#fff" stroke="#d0021b" stroke-width="3"/>'
        + '<text x="20" y="23" text-anchor="middle" font-size="8" font-weight="700" fill="#1a2433">' + esc(p.key.replace('GHS', '')) + '</text></svg>'
        + '<span>' + esc(p.label) + '</span></span>';
    }
    return h;
  }
  function gefahrHtml(p) {
    var g = p && p.gefahr;
    if (!g || !g.piktogramme) return '';
    var h = '<div class="ao-gefahr" lang="de" dir="ltr">', i;
    if (g.piktogramme.length) h += '<div class="ao-ghs-reihe">' + rauten(g) + '</div>';
    if (g.signalwort) h += '<div class="ao-signal">' + esc(g.signalwort) + '</div>';
    if (g.h && g.h.length) {
      h += '<ul class="ao-hsaetze">';
      for (i = 0; i < g.h.length; i++) h += '<li><b>' + esc(g.h[i].code) + '</b> ' + esc(g.h[i].text) + '</li>';
      h += '</ul>';
    }
    if (g.p && g.p.length) {
      h += '<details class="ao-psaetze"><summary>Sicherheitshinweise (' + g.p.length + ')</summary><ul>';
      for (i = 0; i < g.p.length; i++) h += '<li><b>' + esc(g.p[i].code) + '</b> ' + esc(g.p[i].text) + '</li>';
      h += '</ul></details>';
    }
    var z = [];
    if (g.un) z.push(esc(g.un));
    if (g.ufi) z.push('UFI: ' + esc(g.ufi));
    if (z.length) h += '<div class="ao-gefahr-zusatz">' + z.join(' · ') + '</div>';
    return h + '</div>';
  }
  /** Vor dem Bestellknopf: alle Produkte im Warenkorb mit Gefahr-Angaben, kurz. */
  function gefahrKasse(w) {
    var h = '', i, p, g, k, codes;
    for (i = 0; i < w.length; i++) {
      p = produkt(w[i].id); g = p && p.gefahr;
      if (!g) continue;
      codes = [];
      for (k = 0; k < (g.h || []).length; k++) codes.push(esc(g.h[k].code) + ' ' + esc(g.h[k].text));
      h += '<div class="ao-gefahr-kasse-zeile"><div class="ao-ghs-reihe">' + rauten(g) + '</div><div><b>' + esc(p.name) + '</b>'
        + (g.signalwort ? ' · <span class="ao-signal">' + esc(g.signalwort) + '</span>' : '')
        + (codes.length ? '<div class="ao-gefahr-codes">' + codes.join(' · ') + '</div>' : '') + '</div></div>';
    }
    return h ? '<div class="ao-gefahr-kasse" lang="de" dir="ltr"><b>Gefahrenhinweise zu Ihrer Bestellung</b>' + h + '</div>' : '';
  }

  // --- Paket 317: Staffeln und Mengen-Hinweis ---
  function staffeln(p) {
    if (!konto || !p.staffeln || p.staffeln.length < 2) return '';
    var h = '<div class="ao-prod-staffel">', i;
    for (i = 0; i < p.staffeln.length; i++) { h += '<span>' + TH('ab', { n: zahl(p.staffeln[i].ab) }) + ': ' + eur(p.staffeln[i].netto) + '</span>'; }
    return h + '</div>';
  }
  function mengeHinweis(p) {
    var g = gebinde(p), m = mindest(p), t = [];
    if (m > 1) t.push(T('mindestmenge', { n: zahl(m) }));
    if (g > 1) t.push(T('gebinde', { n: zahl(g) }));
    return t.length ? '<div class="ao-prod-menge">' + esc(t.join(' · ')) + '</div>' : '';
  }

  // --- Produkt-Kacheln ---
  var grid;
  function karten() {
    grid = c.querySelector('.ao-shop-grid'); if (!grid) return;
    if (!produkte.length) { grid.innerHTML = '<div class="ao-shop-leer">' + TH('keine_produkte') + '</div>'; return; }
    var h = '', i;
    for (i = 0; i < produkte.length; i++) {
      var p = produkte[i];
      var preis = konto && p.preis_netto != null
        ? eur(p.preis_netto) + '<span class="ao-prod-mwst">' + TH('netto_mwst') + (mindest(p) > 1 ? ' · ' + TH('ab', { n: zahl(mindest(p)) }) : '') + '</span>'
        : eur(p.preis) + '<span class="ao-prod-mwst">' + TH('inkl_mwst') + '</span>';
      h += '<div class="ao-prod">'
        + (p.bild ? '<div class="ao-prod-bild" style="background-image:url(' + encodeURI(p.bild) + ')"></div>' : '<div class="ao-prod-bild ao-prod-kein"></div>')
        + '<div class="ao-prod-body"><div class="ao-prod-name"' + (p.uebersetzt || sprache === 'de' ? '' : ' lang="de" dir="ltr"') + '>' + esc(p.name) + '</div>'
        + (p.beschreibung ? '<div class="ao-prod-text"' + (p.uebersetzt || sprache === 'de' ? '' : ' lang="de" dir="ltr"') + '>' + esc(p.beschreibung) + '</div>' : '')
        + gefahrHtml(p)
        + doks(p)
        + staffeln(p)
        + mengeHinweis(p)
        + '<div class="ao-prod-fuss"><span class="ao-prod-preis">' + preis + '</span>'
        + (gesperrt() ? '' : '<button type="button" class="btn ao-prod-add" data-id="' + esc(p.id) + '">' + TH('in_warenkorb') + '</button>') + '</div></div></div>';
    }
    grid.innerHTML = h;
  }

  // --- Paket 324: Sprach-Umschalter (nur wenn der Betrieb mehr als Deutsch anbietet) ---
  function zeigeUmschalter() {
    var alt = c.querySelector('.ao-sprache'); if (alt) alt.parentNode.removeChild(alt);
    if (!sprachen || sprachen.length < 2) return;
    var d = document.createElement('div'); d.className = 'ao-sprache';
    var h = '<label><span aria-hidden="true">🌐</span> <span class="ao-sprache-t">' + TH('sprache') + '</span> <select>', i;
    for (i = 0; i < sprachen.length; i++) {
      h += '<option value="' + esc(sprachen[i].code) + '" lang="' + esc(sprachen[i].code) + '"' + (sprachen[i].code === sprache ? ' selected' : '') + '>' + esc(sprachen[i].name) + '</option>';
    }
    d.innerHTML = h + '</select></label>';
    c.insertBefore(d, c.firstChild);
    d.querySelector('select').addEventListener('change', function (e) { setSprache(e.target.value); lade(e.target.value); });
  }

  function lade(wunsch) {
    var gew = wunsch || ladeSprache();
    var hl = ''; try { hl = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).join(','); } catch (e) {}
    fetch('/api/oeffentlich/shop-produkte?seite=' + encodeURIComponent(seite) + (gew ? '&sprache=' + encodeURIComponent(gew) : '') + (hl ? '&hl=' + encodeURIComponent(hl.slice(0, 200)) : ''), { headers: kopf() })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        produkte = (d && d.produkte) || [];
        konto = (d && d.konto) || null;
        sprache = (d && typeof d.sprache === 'string') ? d.sprache : 'de';
        bcp = (d && typeof d.bcp === 'string') ? d.bcp : 'de-DE';
        rtl = !!(d && d.rtl);
        sprachen = (d && d.sprachen) || [];
        texte = (d && d.texte) || null;
        nurGewerbe = !!(d && d.nur_gewerbe);
        if (d && d.konto_ungueltig) { setToken(null); kontoHinweis = 'link_ungueltig'; }
        if (konto) kontoHinweis = '';
        richtung(); zeigeKonto(); zeigeUmschalter(); karten(); zeigeBar(); zeigeDrawer();
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
