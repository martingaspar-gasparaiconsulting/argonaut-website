// ============================================================
// ARGONAUT OS · W4-Look · webBloecke.ts — Bausteine + Render-Maschine (v2)
//
// Eine Webseite = eine Liste von Bausteinen (Block[]). Diese Datei enthält:
//   • BAUSTEIN_KATALOG — welche Bausteine es gibt (für den Editor W5)
//   • blockHtml        — ein Baustein → HTML
//   • rechtsSektionen  — Impressum/Datenschutz/AGB als verankerte Abschnitte
//   • seiteHtml        — komplette, in sich geschlossene HTML-Seite (für <iframe>
//                        und fürs Veröffentlichen W7), inkl. fixem Fuß.
//
// v2: mehr „Sog"-Bausteine (Hero mit Bildplatz, Zahlen-Band, Bewertungen, FAQ),
// mutigere Typografie, echter Abschnitts-Rhythmus. Reine Funktionen — keine
// Supabase-Aufrufe, keine Hooks.
// ============================================================

import { impressumText, datenschutzText, agbText, fussHtml, type CiRecht } from './webRecht';

export interface CiWeb extends CiRecht {
  firma?: string | null;
  slogan?: string | null;
  ueber_uns?: string | null;
  kernsaetze?: string | null;
  logo_url?: string | null;
  farbe_primaer?: string | null;
  farbe_sekundaer?: string | null;
  farbe_akzent?: string | null;
  schrift?: string | null;
  oeffnungszeiten?: string | null;
}

// --- Baustein-Typen ---------------------------------------------------------
export type Block =
  | { typ: 'hero'; eyebrow?: string; titel: string; unterzeile: string; knopf: string; bild?: string }
  | { typ: 'stats'; titel?: string; zahlen: { wert: string; label: string }[] }
  | { typ: 'leistungen'; eyebrow?: string; titel: string; punkte: { titel: string; text: string }[] }
  | { typ: 'ueber'; eyebrow?: string; titel: string; text: string }
  | { typ: 'galerie'; titel: string; anzahl: number; bilder?: string[] }
  | { typ: 'testimonials'; eyebrow?: string; titel: string; stimmen: { text: string; name: string; rolle: string }[] }
  | { typ: 'bewertungen'; eyebrow?: string; titel: string }
  | { typ: 'faq'; eyebrow?: string; titel: string; fragen: { frage: string; antwort: string }[] }
  | { typ: 'kontakt'; titel: string; text: string; knopf?: string }
  | { typ: 'newsletter'; titel: string; text: string; knopf?: string }
  | { typ: 'termin'; titel: string; text: string; knopf?: string }
  | { typ: 'video'; titel?: string; url: string }
  | { typ: 'whatsapp'; nummer: string; text?: string }
  | { typ: 'anfahrt'; eyebrow?: string; titel: string }
  | { typ: 'buchung'; eyebrow?: string; titel: string; text?: string }
  | { typ: 'produkte'; eyebrow?: string; titel: string }
  | { typ: 'cta'; titel: string; knopf: string };

// --- Katalog für den Editor (W5) --------------------------------------------
export const BAUSTEIN_KATALOG: { typ: Block['typ']; icon: string; name: string; beschreibung: string }[] = [
  { typ: 'hero', icon: '⭐', name: 'Titelbereich', beschreibung: 'Großer Aufmacher mit Bild, Claim und Knopf' },
  { typ: 'stats', icon: '📊', name: 'Zahlen-Band', beschreibung: 'Große Kennzahlen, die Vertrauen schaffen' },
  { typ: 'leistungen', icon: '🧩', name: 'Leistungen', beschreibung: 'Ihre Angebote in Kacheln' },
  { typ: 'ueber', icon: '🏢', name: 'Über uns', beschreibung: 'Ihre Geschichte und Stärken' },
  { typ: 'galerie', icon: '🖼️', name: 'Galerie', beschreibung: 'Platz für Bilder (Platzhalter)' },
  { typ: 'testimonials', icon: '⭐', name: 'Bewertungen (Beispiele)', beschreibung: 'Kundenstimmen mit Sternen — selbst gepflegt' },
  { typ: 'bewertungen', icon: '🌟', name: 'Live-Bewertungen', beschreibung: 'Echte freigegebene Kundenbewertungen — automatisch aktuell' },
  { typ: 'faq', icon: '❓', name: 'FAQ', beschreibung: 'Häufige Fragen zum Aufklappen' },
  { typ: 'kontakt', icon: '✉️', name: 'Kontakt', beschreibung: 'Adresse, Telefon, Anfrage' },
  { typ: 'newsletter', icon: '📧', name: 'Newsletter', beschreibung: 'E-Mail-Anmeldung mit Bestätigung (DSGVO)' },
  { typ: 'termin', icon: '📅', name: 'Termin anfragen', beschreibung: 'Terminwunsch aufnehmen — landet im CRM' },
  { typ: 'video', icon: '🎬', name: 'Video', beschreibung: 'YouTube-/Vimeo-Link einbetten — kein Upload, 0 Speicher' },
  { typ: 'whatsapp', icon: '💬', name: 'WhatsApp-Button', beschreibung: 'Schwebender Knopf — Besucher schreiben direkt per WhatsApp' },
  { typ: 'anfahrt', icon: '📍', name: 'Öffnungszeiten & Anfahrt', beschreibung: 'Zeiten, Adresse und Karte — aus dem Webauftritt' },
  { typ: 'buchung', icon: '🗓️', name: 'Online-Terminbuchung', beschreibung: 'Echte Slot-Buchung — Kunde bucht selbst (aus dem Buchungs-Modul)' },
  { typ: 'produkte', icon: '🛍️', name: 'Shop-Produkte', beschreibung: 'Ihre Produkte als Kacheln mit Warenkorb (aus „Produkte in den Shop")' },
  { typ: 'cta', icon: '📣', name: 'Handlungsaufruf', beschreibung: 'Auffälliger Knopf zur Anfrage' },
];

// --- Helfer -----------------------------------------------------------------
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function z(v?: string | null): string { return (v ?? '').trim(); }
function safeUrl(u?: string | null): string {
  const s = z(u);
  if (!/^https?:\/\//i.test(s)) return '';
  return s.replace(/["'()\\<>\s]/g, '');
}
function eyebrowHtml(text?: string): string {
  return text ? '<div class="eyebrow">' + esc(text) + '</div>' : '';
}

// Text auf n Zeichen kürzen (für Meta-Beschreibung).
function kurz(s: string, n: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

// SEO-/Social-Meta-Tags für den <head> — aus dem CI abgeleitet. Rein additiv:
// Beschreibung aus Slogan/Über-uns, Vorschaubild aus dem Logo. firmaEsc ist
// bereits HTML-escaped (kommt aus seiteHtml).
function seoMeta(ci: CiWeb, firmaEsc: string): string {
  const besch = esc(kurz(z(ci.slogan) || z(ci.ueber_uns) || '', 155));
  const bild = safeUrl(ci.logo_url);
  return [
    besch ? '<meta name="description" content="' + besch + '">' : '',
    '<meta property="og:type" content="website">',
    '<meta property="og:title" content="' + firmaEsc + '">',
    besch ? '<meta property="og:description" content="' + besch + '">' : '',
    bild ? '<meta property="og:image" content="' + bild + '">' : '',
    '<meta name="twitter:card" content="' + (bild ? 'summary_large_image' : 'summary') + '">',
    '<meta name="twitter:title" content="' + firmaEsc + '">',
    besch ? '<meta name="twitter:description" content="' + besch + '">' : '',
  ].filter(Boolean).join('');
}

const SCHRIFT_STACKS: Record<string, string> = {
  modern: "'Inter','Segoe UI',system-ui,sans-serif",
  klassisch: "Georgia,'Times New Roman',serif",
  elegant: "'Playfair Display',Georgia,serif",
  freundlich: "'Nunito','Segoe UI',sans-serif",
  technisch: "'Roboto Mono',ui-monospace,monospace",
  system: 'system-ui,sans-serif',
};
export function schriftStack(schrift?: string | null): string {
  return SCHRIFT_STACKS[z(schrift) || 'modern'] || SCHRIFT_STACKS.modern;
}

function kontaktAdresse(ci: CiWeb): string {
  return [z(ci.strasse), [z(ci.plz), z(ci.ort)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
function sterne(): string {
  return '<span class="sterne">' + '★★★★★' + '</span>';
}

// Video-Link erkennen (YouTube/Vimeo) → Anbieter + ID. Nur Buchstaben/Zahlen aus
// der ID werden weiterverwendet (kein Einschleusen möglich).
function videoQuelle(url?: string): { art: 'youtube' | 'vimeo' | ''; id: string } {
  const u = z(url);
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (m) return { art: 'youtube', id: m[1] };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { art: 'vimeo', id: m[1] };
  return { art: '', id: '' };
}

// Anfrage-Formular auf der veröffentlichten Kundenseite. Sendet an
// /api/oeffentlich/web-anfrage, das den Kontakt als Lead ins CRM des Seiten-
// Inhabers schreibt. Ohne oeffentlichId (Editor-/Dashboard-Vorschau) ist es
// sichtbar, sendet aber nicht — der Kunde sieht, wie es aussieht.
function anfrageFormular(oeffentlichId?: string, knopf?: string): string {
  const seite = oeffentlichId ? esc(oeffentlichId) : '';
  const knopfText = esc(z(knopf) || 'Anfrage senden');
  return [
    '<form class="ao-anfrage" id="ao-anfrage" novalidate>',
    '<input type="hidden" name="seite" value="' + seite + '">',
    '<input class="ao-hp" type="text" name="firma_hp" tabindex="-1" autocomplete="off" aria-hidden="true">',
    '<div class="ao-feld"><label>Name*</label><input type="text" name="name" required></div>',
    '<div class="ao-zwei">',
    '<div class="ao-feld"><label>E-Mail</label><input type="email" name="email"></div>',
    '<div class="ao-feld"><label>Telefon</label><input type="tel" name="telefon"></div>',
    '</div>',
    '<div class="ao-zwei">',
    '<div class="ao-feld"><label>PLZ</label><input type="text" name="plz" inputmode="numeric" maxlength="5" autocomplete="postal-code"></div>',
    '<div class="ao-feld"><label>Ort</label><input type="text" name="ort"></div>',
    '</div>',
    '<div class="ao-feld"><label>Ihre Nachricht</label><textarea name="nachricht" rows="4"></textarea></div>',
    '<label class="ao-dsgvo"><input type="checkbox" name="privacy"> Ich habe die <a href="#datenschutz">Datenschutzerkl&auml;rung</a> gelesen und stimme zu.*</label>',
    '<button type="submit" class="btn">' + knopfText + '</button>',
    '<div class="ao-msg" id="ao-anfrage-msg" role="status"></div>',
    '</form>',
  ].join('');
}

// Kleines, eigenständiges Skript für das Anfrage-Formular (läuft in der fertigen
// Seite). Prüft die Felder, blockt Spam per Honeypot und sendet per fetch.
function anfrageSkript(): string {
  return '<script>(function(){var f=document.getElementById("ao-anfrage");if(!f)return;var el=f.elements;var m=document.getElementById("ao-anfrage-msg");function set(t,ok){m.textContent=t;m.className="ao-msg "+(ok?"ok":"err");}f.addEventListener("submit",function(e){e.preventDefault();if(el.firma_hp&&el.firma_hp.value)return;var name=(el.name.value||"").trim();var email=(el.email.value||"").trim();var tel=(el.telefon.value||"").trim();if(!name||(!email&&!tel)){set("Bitte Name und E-Mail oder Telefon angeben.",false);return;}if(!el.privacy.checked){set("Bitte der Datenschutzerkl\\u00e4rung zustimmen.",false);return;}var seite=el.seite.value;if(!seite){set("Vorschau \\u2014 im Live-Betrieb wird Ihre Anfrage gesendet.",true);return;}var btn=f.querySelector("button[type=submit]");btn.disabled=true;var bt=btn.textContent;btn.textContent="Senden \\u2026";fetch("/api/oeffentlich/web-anfrage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seite:seite,name:name,email:email,telefon:tel,plz:(el.plz?el.plz.value:""),ort:(el.ort?el.ort.value:""),nachricht:el.nachricht.value,privacy:true,firma_hp:el.firma_hp?el.firma_hp.value:""})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});}).then(function(x){if(x.ok){f.reset();set("Vielen Dank! Ihre Anfrage ist eingegangen \\u2014 wir melden uns zeitnah.",true);}else{set((x.d&&x.d.error)||"Senden fehlgeschlagen. Bitte sp\\u00e4ter erneut.",false);}}).catch(function(){set("Verbindung fehlgeschlagen. Bitte sp\\u00e4ter erneut.",false);}).finally(function(){btn.disabled=false;btn.textContent=bt;});});})();</script>';
}

// Newsletter-Anmeldung auf der Kundenseite. Sendet an
// /api/oeffentlich/web-newsletter, das den Kontakt mit Double-Opt-In in die
// Abonnenten-Liste des Seiten-Inhabers einträgt. Ohne oeffentlichId (Vorschau)
// sichtbar, aber inert.
function newsletterFormular(oeffentlichId?: string, knopf?: string): string {
  const seite = oeffentlichId ? esc(oeffentlichId) : '';
  const knopfText = esc(z(knopf) || 'Anmelden');
  return [
    '<form class="ao-news" id="ao-newsletter">',
    '<input type="hidden" name="seite" value="' + seite + '">',
    '<input class="ao-hp" type="text" name="firma_hp" tabindex="-1" autocomplete="off" aria-hidden="true">',
    '<div class="ao-news-row">',
    '<input type="email" name="email" placeholder="Ihre E-Mail-Adresse" required>',
    '<button type="submit" class="btn">' + knopfText + '</button>',
    '</div>',
    '<label class="ao-dsgvo"><input type="checkbox" name="privacy"> Ich m&ouml;chte E-Mails erhalten und habe die <a href="#datenschutz">Datenschutzerkl&auml;rung</a> gelesen.*</label>',
    '<div class="ao-msg" id="ao-newsletter-msg" role="status"></div>',
    '</form>',
  ].join('');
}

// Skript für die Newsletter-Anmeldung (Double-Opt-In: nach dem Absenden folgt
// die Bestätigungsmail). Läuft in der fertigen Seite.
function newsletterSkript(): string {
  return '<script>(function(){var f=document.getElementById("ao-newsletter");if(!f)return;var el=f.elements;var m=document.getElementById("ao-newsletter-msg");function set(t,ok){m.textContent=t;m.className="ao-msg "+(ok?"ok":"err");}f.addEventListener("submit",function(e){e.preventDefault();if(el.firma_hp&&el.firma_hp.value)return;var email=(el.email.value||"").trim();if(!email||email.indexOf("@")<1){set("Bitte eine g\\u00fcltige E-Mail-Adresse eingeben.",false);return;}if(!el.privacy.checked){set("Bitte der Datenschutzerkl\\u00e4rung zustimmen.",false);return;}var seite=el.seite.value;if(!seite){set("Vorschau \\u2014 im Live-Betrieb wird die Anmeldung gesendet.",true);return;}var btn=f.querySelector("button[type=submit]");btn.disabled=true;var bt=btn.textContent;btn.textContent="\\u2026";fetch("/api/oeffentlich/web-newsletter",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seite:seite,email:email,privacy:true,firma_hp:el.firma_hp?el.firma_hp.value:""})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});}).then(function(x){if(x.ok){f.reset();set("Fast geschafft! Bitte best\\u00e4tigen Sie die Anmeldung \\u00fcber den Link in Ihrer E-Mail.",true);}else{set((x.d&&x.d.error)||"Anmeldung fehlgeschlagen. Bitte sp\\u00e4ter erneut.",false);}}).catch(function(){set("Verbindung fehlgeschlagen. Bitte sp\\u00e4ter erneut.",false);}).finally(function(){btn.disabled=false;btn.textContent=bt;});});})();</script>';
}

// Termin-Anfrage auf der Kundenseite. Nimmt einen Terminwunsch auf und sendet
// ihn über /api/oeffentlich/web-anfrage als Lead ins CRM (Wunschtermin steht in
// der Nachricht). Bewusst schlank — die volle Slot-Buchung ist ein eigener
// Baustein. Ohne oeffentlichId (Vorschau) sichtbar, aber inert.
function terminFormular(oeffentlichId?: string, knopf?: string): string {
  const seite = oeffentlichId ? esc(oeffentlichId) : '';
  const knopfText = esc(z(knopf) || 'Termin anfragen');
  return [
    '<form class="ao-anfrage" id="ao-termin" novalidate>',
    '<input type="hidden" name="seite" value="' + seite + '">',
    '<input class="ao-hp" type="text" name="firma_hp" tabindex="-1" autocomplete="off" aria-hidden="true">',
    '<div class="ao-feld"><label>Name*</label><input type="text" name="name" required></div>',
    '<div class="ao-zwei">',
    '<div class="ao-feld"><label>E-Mail</label><input type="email" name="email"></div>',
    '<div class="ao-feld"><label>Telefon</label><input type="tel" name="telefon"></div>',
    '</div>',
    '<div class="ao-feld"><label>Wunschtermin</label><input type="text" name="wunsch" placeholder="z. B. nächste Woche vormittags"></div>',
    '<div class="ao-feld"><label>Nachricht</label><textarea name="nachricht" rows="3"></textarea></div>',
    '<label class="ao-dsgvo"><input type="checkbox" name="privacy"> Ich habe die <a href="#datenschutz">Datenschutzerkl&auml;rung</a> gelesen und stimme zu.*</label>',
    '<button type="submit" class="btn">' + knopfText + '</button>',
    '<div class="ao-msg" id="ao-termin-msg" role="status"></div>',
    '</form>',
  ].join('');
}

// Skript für die Termin-Anfrage: baut aus Wunschtermin + Nachricht eine Zeile
// und sendet an dieselbe Anfrage-Route wie das Kontaktformular.
function terminSkript(): string {
  return '<script>(function(){var f=document.getElementById("ao-termin");if(!f)return;var el=f.elements;var m=document.getElementById("ao-termin-msg");function set(t,ok){m.textContent=t;m.className="ao-msg "+(ok?"ok":"err");}f.addEventListener("submit",function(e){e.preventDefault();if(el.firma_hp&&el.firma_hp.value)return;var name=(el.name.value||"").trim();var email=(el.email.value||"").trim();var tel=(el.telefon.value||"").trim();var wunsch=(el.wunsch.value||"").trim();var nr=(el.nachricht.value||"").trim();if(!name||(!email&&!tel)){set("Bitte Name und E-Mail oder Telefon angeben.",false);return;}if(!el.privacy.checked){set("Bitte der Datenschutzerkl\\u00e4rung zustimmen.",false);return;}var seite=el.seite.value;if(!seite){set("Vorschau \\u2014 im Live-Betrieb wird Ihre Terminanfrage gesendet.",true);return;}var nachricht=(wunsch?"Terminwunsch: "+wunsch:"")+(nr?(wunsch?"\\n":"")+nr:"");var btn=f.querySelector("button[type=submit]");btn.disabled=true;var bt=btn.textContent;btn.textContent="Senden \\u2026";fetch("/api/oeffentlich/web-anfrage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seite:seite,name:name,email:email,telefon:tel,nachricht:nachricht,privacy:true,firma_hp:el.firma_hp?el.firma_hp.value:""})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});}).then(function(x){if(x.ok){f.reset();set("Danke! Ihre Terminanfrage ist eingegangen \\u2014 wir melden uns zur Abstimmung.",true);}else{set((x.d&&x.d.error)||"Senden fehlgeschlagen. Bitte sp\\u00e4ter erneut.",false);}}).catch(function(){set("Verbindung fehlgeschlagen. Bitte sp\\u00e4ter erneut.",false);}).finally(function(){btn.disabled=false;btn.textContent=bt;});});})();</script>';
}

// --- Ein Baustein → HTML ----------------------------------------------------
export function blockHtml(b: Block, ci: CiWeb, ctx: { oeffentlichId?: string; editor?: boolean } = {}): string {
  const ed = ctx.editor;
  // Editor-Marker: nur im Vollbild-Editor gesetzt. Macht Text direkt anklick-/editierbar.
  const ce = (feld: string) => (ed ? ' data-ao-feld="' + feld + '" contenteditable="true"' : '');
  const ebHtml = (text?: string) => (ed ? '<div class="eyebrow"' + ce('eyebrow') + '>' + esc(text || '') + '</div>' : eyebrowHtml(text));
  switch (b.typ) {
    case 'hero': {
      const url = safeUrl(b.bild);
      const stil = url
        ? ' style="background-image:linear-gradient(135deg,rgba(10,15,25,.72),rgba(10,15,25,.55)),url(' + url + ');background-size:cover;background-position:center"'
        : '';
      return [
        '<section class="hero' + (url ? ' hero-bild' : '') + '"' + stil + '><div class="wrap">',
        ebHtml(b.eyebrow),
        '<h1' + ce('titel') + '>' + esc(b.titel) + '</h1>',
        b.unterzeile ? '<p class="lead"' + ce('unterzeile') + '>' + esc(b.unterzeile) + '</p>' : '',
        b.knopf ? '<a class="btn" href="#kontakt"' + ce('knopf') + '>' + esc(b.knopf) + '</a>' : '',
        '</div></section>',
      ].join('');
    }
    case 'stats':
      return [
        '<section class="stats"><div class="wrap">',
        b.titel ? '<h2 class="stats-titel"' + ce('titel') + '>' + esc(b.titel) + '</h2>' : '',
        '<div class="stats-grid">',
        b.zahlen.map((za) => '<div class="stat"><div class="stat-wert">' + esc(za.wert) + '</div><div class="stat-label">' + esc(za.label) + '</div></div>').join(''),
        '</div></div></section>',
      ].join('');
    case 'leistungen':
      return [
        '<section class="sec" id="leistungen"><div class="wrap">',
        ebHtml(b.eyebrow),
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        '<div class="grid">',
        b.punkte.map((p) => '<div class="card"><h3>' + esc(p.titel) + '</h3>' + (p.text ? '<p>' + esc(p.text) + '</p>' : '') + '</div>').join(''),
        '</div></div></section>',
      ].join('');
    case 'ueber':
      return [
        '<section class="sec alt" id="ueber"><div class="wrap narrow">',
        ebHtml(b.eyebrow),
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        '<p class="fliess"' + ce('text') + '>' + esc(b.text) + '</p>',
        '</div></section>',
      ].join('');
    case 'galerie': {
      const bilder = Array.isArray(b.bilder) ? b.bilder.map(safeUrl).filter(Boolean) : [];
      let inner = '';
      if (bilder.length) {
        inner = bilder.slice(0, 12).map((u) => '<div class="galimg"><img src="' + u + '" alt="" loading="lazy"></div>').join('');
      } else {
        const n = Math.max(1, Math.min(12, b.anzahl || 3));
        for (let i = 0; i < n; i++) inner += '<div class="ph"><span>Bild</span></div>';
      }
      return '<section class="sec"><div class="wrap"><h2' + ce('titel') + '>' + esc(b.titel) + '</h2><div class="gal">' + inner + '</div></div></section>';
    }
    case 'testimonials':
      return [
        '<section class="sec alt"><div class="wrap">',
        ebHtml(b.eyebrow),
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        '<div class="grid">',
        b.stimmen.map((s) => '<figure class="stimme">' + sterne() + '<blockquote>' + esc(s.text) + '</blockquote><figcaption><b>' + esc(s.name) + '</b>' + (s.rolle ? '<span>' + esc(s.rolle) + '</span>' : '') + '</figcaption></figure>').join(''),
        '</div></div></section>',
      ].join('');
    case 'faq':
      return [
        '<section class="sec"><div class="wrap narrow">',
        ebHtml(b.eyebrow),
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        '<div class="faq">',
        b.fragen.map((f) => '<details><summary>' + esc(f.frage) + '</summary><div class="faq-a">' + esc(f.antwort) + '</div></details>').join(''),
        '</div></div></section>',
      ].join('');
    case 'kontakt': {
      const tel = z(ci.telefon), mail = z(ci.email), adr = kontaktAdresse(ci), oeff = z(ci.oeffnungszeiten);
      const li: string[] = [];
      if (tel) li.push('<li>&#9742; ' + esc(tel) + '</li>');
      if (mail) li.push('<li>&#9993; ' + esc(mail) + '</li>');
      if (adr) li.push('<li>&#128205; ' + esc(adr) + '</li>');
      if (oeff) li.push('<li>&#128336; ' + esc(oeff).replace(/\n/g, '<br>') + '</li>');
      return [
        '<section class="sec alt" id="kontakt"><div class="wrap narrow">',
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        b.text ? '<p class="fliess"' + ce('text') + '>' + esc(b.text) + '</p>' : '',
        li.length
          ? '<div class="kontakt-grid"><ul class="kontakt">' + li.join('') + '</ul>' + anfrageFormular(ctx.oeffentlichId, b.knopf) + '</div>'
          : anfrageFormular(ctx.oeffentlichId, b.knopf),
        '</div></section>',
      ].join('');
    }
    case 'cta':
      return '<section class="cta"><div class="wrap"><h2' + ce('titel') + '>' + esc(b.titel) + '</h2><a class="btn btn-dunkel" href="#kontakt"' + ce('knopf') + '>' + esc(b.knopf) + '</a></div></section>';
    case 'newsletter':
      return [
        '<section class="sec" id="newsletter"><div class="wrap narrow">',
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        b.text ? '<p class="fliess"' + ce('text') + '>' + esc(b.text) + '</p>' : '',
        newsletterFormular(ctx.oeffentlichId, b.knopf),
        '</div></section>',
      ].join('');
    case 'termin':
      return [
        '<section class="sec alt" id="termin"><div class="wrap narrow">',
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        b.text ? '<p class="fliess"' + ce('text') + '>' + esc(b.text) + '</p>' : '',
        terminFormular(ctx.oeffentlichId, b.knopf),
        '</div></section>',
      ].join('');
    case 'video': {
      const v = videoQuelle(b.url);
      let media = '';
      if (v.art === 'youtube') {
        const thumb = 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg';
        const embed = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1';
        media = '<button type="button" class="ao-video ao-video-facade" data-embed="' + embed + '" style="background-image:url(' + thumb + ')" aria-label="Video abspielen"><span class="ao-video-play">&#9654;</span></button>';
      } else if (v.art === 'vimeo') {
        media = '<div class="ao-video"><iframe src="https://player.vimeo.com/video/' + v.id + '" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>';
      } else {
        media = '<div class="ao-video ao-video-leer"><span>' + (ed ? 'Video-Link rechts einf&uuml;gen (YouTube/Vimeo)' : 'Video') + '</span></div>';
      }
      return [
        '<section class="sec"><div class="wrap narrow">',
        (b.titel || ed) ? '<h2' + ce('titel') + '>' + esc(b.titel || '') + '</h2>' : '',
        media,
        '</div></section>',
      ].join('');
    }
    case 'bewertungen': {
      const oid = ctx.oeffentlichId ? esc(ctx.oeffentlichId) : '';
      const inhalt = oid
        ? '<div class="ao-bew-lade">Bewertungen werden geladen &hellip;</div>'
        : '<div class="ao-bew-platz">' + (ed
            ? 'Hier erscheinen automatisch Ihre echten, freigegebenen Bewertungen. Freigeben im Modul &bdquo;Bewertungen&ldquo;.'
            : 'Bewertungen folgen in K&uuml;rze.') + '</div>';
      return [
        '<section class="sec alt"><div class="wrap">',
        ebHtml(b.eyebrow),
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        '<div class="ao-bew grid" data-seite="' + oid + '">' + inhalt + '</div>',
        '</div></section>',
      ].join('');
    }
    case 'whatsapp': {
      const num = z(b.nummer).replace(/[^\d]/g, '');
      const txt = z(b.text);
      const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.26-.1-.45-.15-.64.15-.19.28-.73.94-.9 1.13-.16.19-.33.21-.61.07-.3-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.03-.17-.29-.02-.45.13-.6.13-.13.3-.34.44-.51.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.08-.15-.64-1.55-.88-2.12-.23-.55-.47-.48-.64-.48h-.55c-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.38s1.02 2.76 1.17 2.95c.14.19 2.02 3.08 4.9 4.32.68.29 1.22.47 1.63.6.69.22 1.31.19 1.8.12.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34zM12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.06L2 22l5.06-1.33C8.5 21.52 10.2 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>';
      if (ed) {
        return num
          ? '<div class="ao-wa" title="WhatsApp (Vorschau) – im Live-Betrieb öffnet der Chat">' + icon + '</div>'
          : '<div class="ao-wa-hinweis">💬 WhatsApp-Nummer rechts eintragen (mit Ländervorwahl)</div>';
      }
      if (!num) return '';
      const href = 'https://wa.me/' + num + (txt ? '?text=' + encodeURIComponent(txt) : '');
      return '<a class="ao-wa" href="' + href + '" target="_blank" rel="noopener" aria-label="Per WhatsApp schreiben">' + icon + '</a>';
    }
    case 'anfahrt': {
      const adr = kontaktAdresse(ci);
      const oeff = z(ci.oeffnungszeiten);
      const encAdr = encodeURIComponent(adr || z(ci.firma) || '');
      const oeffHtml = oeff
        ? '<div class="ao-oeff-text">' + esc(oeff).replace(/\n/g, '<br>') + '</div>'
        : (ed ? '<div class="ao-oeff-text ao-leer">Im Webauftritt hinterlegen</div>' : '');
      const adrHtml = adr
        ? '<div>' + esc(adr) + '</div><a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=' + encAdr + '" target="_blank" rel="noopener">🗺️ Route planen</a>'
        : (ed ? '<div class="ao-leer">Im Webauftritt hinterlegen</div>' : '');
      const karte = adr
        ? '<button type="button" class="ao-karte ao-karte-facade" data-embed="https://maps.google.com/maps?q=' + encAdr + '&amp;z=15&amp;output=embed"><span class="ao-karte-play">🗺️ Karte anzeigen</span></button>'
        : (ed ? '<div class="ao-karte ao-karte-facade"><span class="ao-karte-play">Karte erscheint mit Adresse</span></div>' : '');
      return [
        '<section class="sec" id="anfahrt"><div class="wrap">',
        ebHtml(b.eyebrow),
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        '<div class="ao-anfahrt"><div class="ao-anfahrt-info">',
        (oeffHtml ? '<div class="ao-oeff"><h3>Öffnungszeiten</h3>' + oeffHtml + '</div>' : ''),
        (adrHtml ? '<div class="ao-adr"><h3>Adresse</h3>' + adrHtml + '</div>' : ''),
        '</div>', karte, '</div>',
        '</div></section>',
      ].join('');
    }
    case 'buchung': {
      const oid = ctx.oeffentlichId ? esc(ctx.oeffentlichId) : '';
      const knopf = (!ed && oid)
        ? '<a class="btn ao-buchung-btn" href="#" style="pointer-events:none;opacity:.6">&#128197; L&auml;dt &hellip;</a>'
        : '<span class="btn ao-buchung-btn">&#128197; Termin online buchen</span>';
      const hint = ed
        ? '<div class="ao-buchung-hinweis ao-leer">Terminarten &amp; Zeiten richtest du im Buchungs-Modul ein. Der Knopf f&uuml;hrt Besucher zur Buchung.</div>'
        : '<div class="ao-buchung-hinweis"></div>';
      return [
        '<section class="sec alt" id="termin-buchen"><div class="wrap narrow">',
        ebHtml(b.eyebrow),
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        b.text ? '<p class="fliess"' + ce('text') + '>' + esc(b.text) + '</p>' : '',
        '<div class="ao-buchung" data-seite="' + oid + '">' + knopf + hint + '</div>',
        '</div></section>',
      ].join('');
    }
    case 'produkte': {
      const oid = ctx.oeffentlichId ? esc(ctx.oeffentlichId) : '';
      let inner: string;
      if (oid) {
        inner = '<div class="ao-wk-bar" style="display:none"><span class="ao-wk-text"></span></div>'
          + '<div class="ao-shop-grid"><div class="ao-shop-lade">Produkte werden geladen &hellip;</div></div>';
      } else if (ed) {
        const bsp = [
          { n: 'Beispiel-Produkt A', p: '19,90 €' },
          { n: 'Beispiel-Produkt B', p: '34,00 €' },
          { n: 'Beispiel-Produkt C', p: '9,50 €' },
        ].map((x) =>
          '<div class="ao-prod"><div class="ao-prod-bild ao-prod-kein"></div><div class="ao-prod-body">'
          + '<div class="ao-prod-name">' + x.n + '</div>'
          + '<div class="ao-prod-fuss"><span class="ao-prod-preis">' + x.p + '</span>'
          + '<span class="btn ao-prod-add">In den Warenkorb</span></div></div></div>',
        ).join('');
        inner = '<div class="ao-shop-hinweis">Vorschau — echte Produkte übernehmen Sie unter „Produkte in den Shop".</div><div class="ao-shop-grid">' + bsp + '</div>';
      } else {
        inner = '<div class="ao-shop-grid"><div class="ao-shop-leer">Produkte folgen in Kürze.</div></div>';
      }
      return [
        '<section class="sec" id="shop"><div class="wrap">',
        ebHtml(b.eyebrow),
        '<h2' + ce('titel') + '>' + esc(b.titel) + '</h2>',
        '<div class="ao-shop" data-seite="' + oid + '">' + inner + '</div>',
        '</div></section>',
      ].join('');
    }
    default:
      return '';
  }
}

// --- Rechts-Abschnitte (verankert, damit der Fuß darauf zeigt) --------------
export function rechtsSektionen(ci: CiWeb): string {
  const block = (id: string, titel: string, text: string) =>
    '<section class="recht" id="' + id + '"><div class="wrap narrow"><h2>' + titel + '</h2><div class="pretext">' + esc(text) + '</div></div></section>';
  return [
    block('impressum', 'Impressum', impressumText(ci)),
    block('datenschutz', 'Datenschutz', datenschutzText(ci)),
    block('agb', 'AGB', agbText(ci)),
  ].join('');
}

// --- CSS der erzeugten Seite ------------------------------------------------
function seiteCss(ci: CiWeb): string {
  const p = z(ci.farbe_primaer) || '#1F3A5F';
  const s = z(ci.farbe_sekundaer) || '#E0A24C';
  const a = z(ci.farbe_akzent) || '#4CAF7D';
  const font = schriftStack(ci.schrift);
  return [
    ':root{--p:' + p + ';--s:' + s + ';--a:' + a + '}',
    '*{box-sizing:border-box}',
    'body{margin:0;font-family:' + font + ';color:#1c2430;background:#fff;line-height:1.65;-webkit-font-smoothing:antialiased}',
    'h1,h2,h3{line-height:1.12;letter-spacing:-.02em}',
    '.wrap{max-width:1120px;margin:0 auto;padding:0 24px}',
    '.wrap.narrow{max-width:780px}',
    '.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:13px;font-weight:800;color:var(--s);margin-bottom:14px}',
    // Kopf
    '.top{background:rgba(255,255,255,.92);backdrop-filter:saturate(1.2) blur(8px);border-bottom:1px solid #eceff3;position:sticky;top:0;z-index:5}',
    '.trow{display:flex;align-items:center;gap:14px;padding:15px 24px;max-width:1120px;margin:0 auto}',
    '.logo{height:46px;width:46px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;background:var(--p);flex:0 0 auto;font-size:20px}',
    '.logo img{height:46px;width:auto;border-radius:11px;display:block}',
    '.fn{font-weight:800;font-size:20px;color:var(--p);letter-spacing:-.01em}',
    '.cl{font-size:13px;color:var(--s);font-weight:700}',
    '.mainnav{margin-left:auto;display:flex;gap:24px}',
    '.mainnav a{color:#41505f;text-decoration:none;font-weight:600;font-size:15px}',
    '.mainnav a:hover{color:var(--p)}',
    // Knöpfe
    '.btn{display:inline-block;background:var(--a);color:#fff;text-decoration:none;font-weight:800;padding:15px 30px;border-radius:10px;font-size:17px;box-shadow:0 8px 24px -8px rgba(0,0,0,.35);transition:transform .15s}',
    '.btn:hover{transform:translateY(-2px)}',
    '.btn-dunkel{background:var(--p)}',
    // Hero
    '.hero{background:var(--p);color:#fff;padding:96px 0;position:relative;overflow:hidden}',
    '.hero:not(.hero-bild):after{content:"";position:absolute;top:-30%;right:-10%;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,var(--s),transparent 62%);opacity:.28;pointer-events:none}',
    '.hero .wrap{position:relative;z-index:1}',
    '.hero .eyebrow{color:var(--s)}',
    '.hero h1{margin:0 0 16px;font-size:clamp(34px,5.4vw,60px);max-width:14ch}',
    '.hero .lead{font-size:clamp(17px,2.4vw,23px);color:rgba(255,255,255,.9);margin:0 0 30px;max-width:620px}',
    // Abschnitte
    '.sec{padding:82px 0}',
    '.sec.alt{background:#f5f8fc}',
    '.sec h2{font-size:clamp(26px,3.6vw,40px);margin:0 0 34px;color:var(--p)}',
    '.fliess{font-size:clamp(16px,1.5vw,19px);color:#41505f;max-width:64ch}',
    // Leistungs-/Karten-Raster
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}',
    '.card{background:#fff;border:1px solid #e7ebf1;border-radius:16px;padding:26px;box-shadow:0 12px 30px -22px rgba(20,40,70,.35)}',
    '.card h3{margin:0 0 9px;color:var(--p);font-size:20px}',
    '.card p{margin:0;color:#51606f}',
    // Zahlen-Band
    '.stats{background:var(--p);color:#fff;padding:56px 0}',
    '.stats-titel{color:#fff;text-align:center;margin:0 0 30px;font-size:clamp(22px,3vw,30px)}',
    '.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:22px;text-align:center}',
    '.stat-wert{font-size:clamp(34px,4.4vw,52px);font-weight:900;color:var(--s);letter-spacing:-.03em}',
    '.stat-label{font-size:15px;color:rgba(255,255,255,.82);margin-top:6px}',
    // Galerie
    '.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}',
    '.ph{aspect-ratio:4/3;background:linear-gradient(135deg,#eef2f7,#dde5ee);border:1px dashed #c3ccd7;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#9aa7b5;font-weight:700}',
    '.galimg{aspect-ratio:4/3;border-radius:14px;overflow:hidden;background:#eef2f7}',
    '.galimg img{width:100%;height:100%;object-fit:cover;display:block}',
    // Bewertungen
    '.stimme{margin:0;background:#fff;border:1px solid #e7ebf1;border-radius:16px;padding:24px;box-shadow:0 12px 30px -22px rgba(20,40,70,.35)}',
    '.sterne{color:#f5b301;font-size:18px;letter-spacing:2px}',
    '.stimme blockquote{margin:12px 0 16px;font-size:17px;color:#33414f;line-height:1.6}',
    '.stimme figcaption{display:flex;flex-direction:column}',
    '.stimme figcaption b{color:var(--p)}',
    '.stimme figcaption span{font-size:13px;color:#8290a0}',
    // Live-Bewertungen (Lade-/Platzhalter-Zustand; Karten nutzen .stimme)
    '.ao-bew-lade,.ao-bew-platz{grid-column:1/-1;color:#8290a0;font-size:15px;padding:8px 0;font-weight:600}',
    // FAQ
    '.faq details{border:1px solid #e7ebf1;border-radius:12px;margin-bottom:10px;background:#fff;overflow:hidden}',
    '.faq summary{cursor:pointer;padding:16px 18px;font-weight:700;color:var(--p);list-style:none}',
    '.faq summary::-webkit-details-marker{display:none}',
    '.faq summary:after{content:"+";float:right;color:var(--s);font-weight:900}',
    '.faq details[open] summary:after{content:"–"}',
    '.faq-a{padding:0 18px 16px;color:#51606f}',
    // Kontakt
    '.kontakt{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:10px;font-size:17px;color:#38434f}',
    // Anfrage-Formular
    '.kontakt-grid{display:grid;grid-template-columns:1fr;gap:26px;margin-top:8px}',
    '@media(min-width:720px){.kontakt-grid{grid-template-columns:1fr 1.15fr;align-items:start}.kontakt{margin-top:0}}',
    '.ao-anfrage{display:flex;flex-direction:column;gap:12px;background:#fff;border:1px solid #e7ebf1;border-radius:16px;padding:22px;box-shadow:0 12px 30px -22px rgba(20,40,70,.35)}',
    '.ao-anfrage .ao-feld{display:flex;flex-direction:column;gap:5px}',
    '.ao-anfrage label{font-size:14px;font-weight:700;color:#41505f}',
    '.ao-anfrage input,.ao-anfrage textarea{font:inherit;font-size:15px;color:#1c2430;background:#fff;border:1px solid #d3dbe4;border-radius:10px;padding:11px 13px;width:100%;box-sizing:border-box}',
    '.ao-anfrage input:focus,.ao-anfrage textarea:focus{outline:none;border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 22%,transparent)}',
    '.ao-anfrage textarea{resize:vertical;min-height:96px;line-height:1.5}',
    '.ao-zwei{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '@media(max-width:520px){.ao-zwei{grid-template-columns:1fr}}',
    '.ao-dsgvo{flex-direction:row;display:flex;gap:9px;align-items:flex-start;font-size:13px;font-weight:500;color:#51606f}',
    '.ao-dsgvo input{width:auto;margin-top:3px;flex:0 0 auto}',
    '.ao-dsgvo a{color:var(--p);font-weight:700}',
    '.ao-anfrage .btn{border:none;cursor:pointer;align-self:flex-start}',
    '.ao-hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none}',
    '.ao-msg{font-size:14px;font-weight:600}',
    '.ao-msg.ok{color:#2e7d55}',
    '.ao-msg.err{color:#c0392b}',
    // Newsletter-Anmeldung
    '.ao-news{display:flex;flex-direction:column;gap:12px;max-width:600px}',
    '.ao-news-row{display:flex;gap:10px;flex-wrap:wrap}',
    '.ao-news input[type=email]{flex:1;min-width:200px;font:inherit;font-size:15px;color:#1c2430;background:#fff;border:1px solid #d3dbe4;border-radius:10px;padding:12px 14px;box-sizing:border-box}',
    '.ao-news input[type=email]:focus{outline:none;border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 22%,transparent)}',
    '.ao-news .btn{border:none;cursor:pointer;white-space:nowrap}',
    // Video (Link-Einbettung, tempo-sicher: 16/9-Fläche, Player erst nach Klick)
    '.ao-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#0d141c;border:1px solid #e7ebf1}',
    '.ao-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}',
    '.ao-video-facade{cursor:pointer;background-size:cover;background-position:center}',
    '.ao-video-facade:before{content:"";position:absolute;inset:0;background:rgba(10,15,25,.28);transition:background .15s}',
    '.ao-video-facade:hover:before{background:rgba(10,15,25,.12)}',
    '.ao-video-play{position:relative;z-index:1;width:74px;height:74px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;padding-left:5px}',
    '.ao-video-leer{display:flex;align-items:center;justify-content:center;color:#9aa7b5;font-weight:700;border:1px dashed #c3ccd7;background:#f5f8fc}',
    // WhatsApp (schwebender Knopf, fest unten rechts)
    '.ao-wa{position:fixed;right:20px;bottom:20px;z-index:50;width:56px;height:56px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px -6px rgba(0,0,0,.45);cursor:pointer;text-decoration:none}',
    '.ao-wa:hover{transform:translateY(-2px)}',
    '.ao-wa svg{width:32px;height:32px;fill:#fff;display:block}',
    '.ao-wa-hinweis{position:fixed;right:20px;bottom:20px;z-index:50;background:#0d141c;color:#25D366;border:1px dashed #25D366;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700}',
    // Öffnungszeiten & Anfahrt
    '.ao-anfahrt{display:grid;grid-template-columns:1fr;gap:24px;align-items:start}',
    '@media(min-width:760px){.ao-anfahrt{grid-template-columns:1fr 1.2fr}}',
    '.ao-anfahrt-info h3{color:var(--p);font-size:18px;margin:0 0 6px}',
    '.ao-oeff{margin-bottom:22px}',
    '.ao-oeff-text{color:#41505f;line-height:1.75;font-size:16px}',
    '.ao-adr>div{color:#41505f;font-size:16px}',
    '.ao-adr .btn{margin-top:14px}',
    '.ao-anfahrt .ao-leer{color:#9aa7b5;font-style:italic}',
    '.ao-karte{position:relative;width:100%;aspect-ratio:4/3;min-height:260px;border-radius:14px;overflow:hidden;background:#eef2f7;border:1px solid #e7ebf1}',
    '.ao-karte iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}',
    '.ao-karte-facade{cursor:pointer;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#eef2f7,#dde5ee);border:none}',
    '.ao-karte-play{background:var(--p);color:#fff;border-radius:10px;padding:12px 18px;font-weight:800;font-size:15px}',
    // Online-Terminbuchung
    '.ao-buchung{margin-top:18px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}',
    '.ao-buchung-btn{cursor:pointer}',
    '.ao-buchung-hinweis{color:#8290a0;font-size:14px}',
    '.ao-buchung .ao-leer{font-style:italic}',
    // Shop-Produkte (Kachel-Raster + Warenkorb-Leiste)
    '.ao-shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px;margin-top:8px}',
    '.ao-prod{background:#fff;border:1px solid #e7ebf1;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px -22px rgba(20,40,70,.35);display:flex;flex-direction:column}',
    '.ao-prod-bild{aspect-ratio:4/3;background-size:cover;background-position:center;background-color:#eef2f7}',
    '.ao-prod-kein{background:linear-gradient(135deg,#eef2f7,#dde5ee)}',
    '.ao-prod-body{padding:14px 16px;display:flex;flex-direction:column;gap:8px;flex:1}',
    '.ao-prod-name{font-weight:800;color:var(--p);font-size:17px}',
    '.ao-prod-text{color:#51606f;font-size:14px;line-height:1.5;flex:1}',
    '.ao-prod-fuss{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px}',
    '.ao-prod-preis{font-weight:900;color:#1c2430;font-size:18px}',
    '.ao-prod-add{border:none;cursor:pointer;font-size:14px;padding:10px 14px}',
    '.ao-shop-lade,.ao-shop-leer,.ao-shop-hinweis{color:#8290a0;font-weight:600;padding:8px 0}',
    '.ao-wk-bar{position:sticky;top:8px;z-index:6;background:var(--p);color:#fff;border-radius:12px;padding:12px 18px;margin-bottom:16px;font-weight:800;box-shadow:0 10px 30px -12px rgba(0,0,0,.4)}',
    // CTA
    '.cta{background:var(--s);color:#1c2430;padding:64px 0;text-align:center}',
    '.cta h2{margin:0 0 24px;font-size:clamp(24px,3.2vw,36px)}',
    // Recht
    '.recht{padding:44px 0;border-top:1px solid #eceff3;background:#fff}',
    '.recht h2{color:var(--p);font-size:22px;margin:0 0 14px}',
    '.pretext{white-space:pre-wrap;color:#41505f;font-size:14px;line-height:1.7}',
    // Fuß
    '.ao-fuss{background:#0d141c;color:rgba(255,255,255,.8);padding:26px 0}',
    '.ao-fuss-inner{max-width:1120px;margin:0 auto;padding:0 24px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;font-size:14px}',
    '.ao-fuss-links{display:flex;gap:20px}',
    '.ao-fuss-links a{color:#fff;text-decoration:none;opacity:.85}',
    '.ao-fuss-links a:hover{opacity:1}',
  ].join('');
}

// --- Editor-Modus: CSS + Skript (nur im Vollbild-Editor, nie auf Live-Seiten) ---
// Klick auf einen Baustein wählt ihn (postMessage 'select'); direkt editierbare
// Texte (data-ao-feld/contenteditable) melden ihren neuen Wert beim Verlassen
// (postMessage 'edit') an den Editor. Veröffentlichte Seiten bekommen davon nichts.
function editorCss(): string {
  return [
    '.ao-b{position:relative}',
    '.ao-b:hover{outline:2px dashed rgba(43,143,255,.45);outline-offset:-2px}',
    '.ao-b.ao-sel{outline:2px solid #2b8fff;outline-offset:-2px}',
    '.ao-b.ao-drop{outline:3px solid #4CAF7D;outline-offset:-2px;background:rgba(76,175,125,.08)}',
    '[data-ao-feld]{cursor:text;border-radius:3px;outline:1px dashed transparent;transition:outline-color .15s,background .15s}',
    '[data-ao-feld]:hover{outline-color:rgba(43,143,255,.55)}',
    '[data-ao-feld]:focus{outline:2px solid #2b8fff;outline-offset:2px;background:rgba(43,143,255,.08)}',
  ].join('');
}
function editorSkript(): string {
  return '<script>(function(){'
    + 'function post(o){parent.postMessage(o,"*");}'
    + 'function sel(el){var a=document.querySelectorAll(".ao-b.ao-sel");for(var i=0;i<a.length;i++){a[i].classList.remove("ao-sel");}if(el){el.classList.add("ao-sel");}}'
    + 'document.addEventListener("click",function(e){var t=e.target;if(!t||!t.closest){return;}var f=t.closest("[data-ao-feld]");if(f){e.preventDefault();}var a=t.closest("a,.ao-karte-facade,.ao-video-facade");if(a){e.preventDefault();}var b=t.closest("[data-ao-i]");if(b){sel(b);post({ao:"select",index:parseInt(b.getAttribute("data-ao-i"),10)});}},true);'
    + 'document.addEventListener("blur",function(e){var el=e.target;if(!el||!el.getAttribute||!el.hasAttribute("data-ao-feld")){return;}var b=el.closest("[data-ao-i]");if(!b){return;}post({ao:"edit",index:parseInt(b.getAttribute("data-ao-i"),10),feld:el.getAttribute("data-ao-feld"),wert:(el.textContent||"").trim()});},true);'
    + 'document.addEventListener("keydown",function(e){var t=e.target;if(e.key==="Enter"&&t&&t.hasAttribute&&t.hasAttribute("data-ao-feld")){e.preventDefault();t.blur();}},true);'
    // Bild vom PC auf einen Baustein ziehen: Baustein markieren + Datei an den Editor melden.
    + 'function hatDatei(e){var ty=e.dataTransfer&&e.dataTransfer.types;if(!ty)return false;for(var i=0;i<ty.length;i++){if(ty[i]==="Files")return true;}return false;}'
    + 'function markDrop(el){var a=document.querySelectorAll(".ao-b.ao-drop");for(var i=0;i<a.length;i++){a[i].classList.remove("ao-drop");}if(el){el.classList.add("ao-drop");}}'
    + 'document.addEventListener("dragover",function(e){if(!hatDatei(e))return;e.preventDefault();var t=e.target;markDrop(t&&t.closest?t.closest("[data-ao-i]"):null);},true);'
    + 'document.addEventListener("dragleave",function(e){if(!hatDatei(e))return;if(!e.relatedTarget)markDrop(null);},true);'
    + 'document.addEventListener("drop",function(e){if(!hatDatei(e))return;e.preventDefault();markDrop(null);var t=e.target;var b=t&&t.closest?t.closest("[data-ao-i]"):null;var f=e.dataTransfer.files&&e.dataTransfer.files[0];if(!f||String(f.type).indexOf("image/")!==0)return;post({ao:"datei",index:b?parseInt(b.getAttribute("data-ao-i"),10):-1,datei:f});},true);'
    + '})();</script>';
}

// Live-Bewertungen: holt die echten, freigegebenen Bewertungen des Seiten-Inhabers
// und füllt den Baustein. Nur auf veröffentlichten Seiten (mit oeffentlichId).
function bewertungenSkript(): string {
  return '<script>(function(){'
    + 'var c=document.querySelector(".ao-bew[data-seite]");if(!c)return;var seite=c.getAttribute("data-seite");if(!seite)return;'
    + 'function esc(t){return String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}'
    + 'fetch("/api/oeffentlich/bewertungen?seite="+encodeURIComponent(seite)).then(function(r){return r.json();}).then(function(d){'
    + 'var a=(d&&d.bewertungen)||[];if(!a.length){c.innerHTML="";return;}var h="";'
    + 'for(var i=0;i<a.length;i++){var b=a[i];var st=Math.max(0,Math.min(5,b.sterne||0));var sterne="";for(var s=0;s<5;s++){sterne+=(s<st?"\\u2605":"\\u2606");}'
    + 'h+="<figure class=\\"stimme\\"><span class=\\"sterne\\">"+sterne+"</span>"+(b.text?"<blockquote>"+esc(b.text)+"</blockquote>":"")+"<figcaption><b>"+esc(b.name||"Kunde")+"</b>"+(b.datum?"<span>"+esc(b.datum)+"</span>":"")+"</figcaption></figure>";}'
    + 'c.innerHTML=h;}).catch(function(){c.innerHTML="";});'
    + '})();</script>';
}

// Online-Terminbuchung: prüft, ob der Inhaber die Buchung freigeschaltet hat, und
// verlinkt den Knopf auf /buchen/<slug>. Nur auf veröffentlichten Seiten.
function buchungSkript(): string {
  return '<script>(function(){'
    + 'var c=document.querySelector(".ao-buchung[data-seite]");if(!c)return;var seite=c.getAttribute("data-seite");if(!seite)return;'
    + 'var btn=c.querySelector(".ao-buchung-btn");var hint=c.querySelector(".ao-buchung-hinweis");'
    + 'fetch("/api/oeffentlich/buchung-info?seite="+encodeURIComponent(seite)).then(function(r){return r.json();}).then(function(d){'
    + 'if(d&&d.aktiv&&d.slug){if(btn){btn.setAttribute("href","/buchen/"+encodeURIComponent(d.slug));btn.style.pointerEvents="";btn.style.opacity="";btn.textContent="\\uD83D\\uDCC5 Termin online buchen";}}'
    + 'else{if(btn)btn.style.display="none";if(hint)hint.textContent="Online-Buchung ist noch nicht eingerichtet.";}'
    + '}).catch(function(){if(btn)btn.style.display="none";});'
    + '})();</script>';
}

// Shop-Produkte: lädt die freigeschalteten Artikel und zeigt sie als Kacheln.
// Warenkorb liegt clientseitig in localStorage (Schlüssel je Seite); die Kasse
// baut in Kapitel 3 darauf auf. Nur auf veröffentlichten Seiten.
function produkteSkript(): string {
  return '<script>(function(){'
    + 'var c=document.querySelector(".ao-shop[data-seite]");if(!c)return;var seite=c.getAttribute("data-seite");if(!seite)return;var wkKey="ao_wk_"+seite;'
    + 'function esc(t){return String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}'
    + 'function eur(n){return (Number(n)||0).toLocaleString("de-DE",{style:"currency",currency:"EUR"});}'
    + 'function ladeWk(){try{return JSON.parse(localStorage.getItem(wkKey)||"[]");}catch(e){return [];}}'
    + 'function saveWk(w){try{localStorage.setItem(wkKey,JSON.stringify(w));}catch(e){}}'
    + 'var produkte=[];'
    + 'function add(id){var p=null,i;for(i=0;i<produkte.length;i++){if(produkte[i].id===id){p=produkte[i];break;}}if(!p)return;var w=ladeWk(),f=null,j;for(j=0;j<w.length;j++){if(w[j].id===id){f=w[j];break;}}if(f){f.menge++;}else{w.push({id:p.id,name:p.name,preis:p.preis,menge:1});}saveWk(w);zeigeWk();}'
    + 'function zeigeWk(){var w=ladeWk(),bar=c.querySelector(".ao-wk-bar");if(!bar)return;var anz=0,sum=0,i;for(i=0;i<w.length;i++){anz+=w[i].menge;sum+=w[i].menge*(Number(w[i].preis)||0);}if(anz>0){bar.style.display="";var t=bar.querySelector(".ao-wk-text");if(t){t.textContent="\\uD83D\\uDED2 "+anz+" Artikel im Warenkorb \\u00b7 "+eur(sum);}}else{bar.style.display="none";}}'
    + 'fetch("/api/oeffentlich/shop-produkte?seite="+encodeURIComponent(seite)).then(function(r){return r.json();}).then(function(d){'
    + 'produkte=(d&&d.produkte)||[];var grid=c.querySelector(".ao-shop-grid");if(!grid)return;'
    + 'if(!produkte.length){grid.innerHTML="<div class=\\"ao-shop-leer\\">Noch keine Produkte im Shop.</div>";return;}'
    + 'var h="",i;for(i=0;i<produkte.length;i++){var p=produkte[i];'
    + 'h+="<div class=\\"ao-prod\\">"+(p.bild?"<div class=\\"ao-prod-bild\\" style=\\"background-image:url("+encodeURI(p.bild)+")\\"></div>":"<div class=\\"ao-prod-bild ao-prod-kein\\"></div>")+"<div class=\\"ao-prod-body\\"><div class=\\"ao-prod-name\\">"+esc(p.name)+"</div>"+(p.beschreibung?"<div class=\\"ao-prod-text\\">"+esc(p.beschreibung)+"</div>":"")+"<div class=\\"ao-prod-fuss\\"><span class=\\"ao-prod-preis\\">"+eur(p.preis)+"</span><button type=\\"button\\" class=\\"btn ao-prod-add\\" data-id=\\""+esc(p.id)+"\\">In den Warenkorb</button></div></div></div>";}'
    + 'grid.innerHTML=h;grid.addEventListener("click",function(e){var b=e.target.closest?e.target.closest(".ao-prod-add"):null;if(b){add(b.getAttribute("data-id"));}});zeigeWk();'
    + '}).catch(function(){});'
    + '})();</script>';
}

// Video-Facade: klick auf das Vorschaubild lädt erst dann den echten Player (tempo-
// sicher, kein Autoload). Nur auf Live-/Vorschau-Seiten, nicht im Editor.
function videoSkript(): string {
  return '<script>(function(){document.addEventListener("click",function(e){var b=e.target.closest?e.target.closest(".ao-video-facade"):null;if(!b)return;var src=b.getAttribute("data-embed");if(!src)return;var f=document.createElement("iframe");f.src=src;f.loading="lazy";f.setAttribute("allow","autoplay; fullscreen; picture-in-picture");f.setAttribute("allowfullscreen","");var w=document.createElement("div");w.className="ao-video";w.appendChild(f);if(b.parentNode){b.parentNode.replaceChild(w,b);}},false);})();</script>';
}

// Karten-Facade: Karte (Google-Embed, kein Key) lädt erst nach Klick — tempo-sicher.
// Nur auf Live-/Vorschau-Seiten, nicht im Editor.
function karteSkript(): string {
  return '<script>(function(){document.addEventListener("click",function(e){var b=e.target.closest?e.target.closest(".ao-karte-facade"):null;if(!b||!b.getAttribute("data-embed"))return;var src=b.getAttribute("data-embed");var f=document.createElement("iframe");f.src=src;f.loading="lazy";f.setAttribute("title","Karte");f.setAttribute("referrerpolicy","no-referrer-when-downgrade");var w=document.createElement("div");w.className="ao-karte";w.appendChild(f);if(b.parentNode){b.parentNode.replaceChild(w,b);}},false);})();</script>';
}

// --- Komplette, in sich geschlossene HTML-Seite -----------------------------
export function seiteHtml(
  seite: { titel?: string; bloecke: Block[] },
  ci: CiWeb,
  jahr: number,
  opts: { oeffentlichId?: string; editor?: boolean } = {},
): string {
  const firma = esc(z(ci.firma) || 'Ihr Firmenname');
  const slogan = esc(z(ci.slogan));
  const logo = safeUrl(ci.logo_url)
    ? '<span class="logo"><img src="' + safeUrl(ci.logo_url) + '" alt="Logo"></span>'
    : '<span class="logo">' + esc((z(ci.firma) || 'A').charAt(0).toUpperCase()) + '</span>';

  const koerper = (seite.bloecke || []).map((b, i) => {
    const inner = blockHtml(b, ci, { oeffentlichId: opts.oeffentlichId, editor: opts.editor });
    return opts.editor ? '<div class="ao-b" data-ao-i="' + i + '">' + inner + '</div>' : inner;
  }).join('\n');
  const hatVideo = (seite.bloecke || []).some((b) => b.typ === 'video');
  const hatBewertungen = (seite.bloecke || []).some((b) => b.typ === 'bewertungen');
  const hatAnfahrt = (seite.bloecke || []).some((b) => b.typ === 'anfahrt');
  const hatBuchung = (seite.bloecke || []).some((b) => b.typ === 'buchung');
  const hatProdukte = (seite.bloecke || []).some((b) => b.typ === 'produkte');

  return [
    '<!doctype html>',
    '<html lang="de"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + firma + '</title>',
    seoMeta(ci, firma),
    '<style>' + seiteCss(ci) + (opts.editor ? editorCss() : '') + '</style>',
    '</head><body>',
    '<header class="top"><div class="trow">',
    logo,
    '<div><div class="fn">' + firma + '</div>' + (slogan ? '<div class="cl">' + slogan + '</div>' : '') + '</div>',
    '<nav class="mainnav"><a href="#leistungen">Leistungen</a><a href="#ueber">Über uns</a><a href="#kontakt">Kontakt</a></nav>',
    '</div></header>',
    koerper,
    rechtsSektionen(ci),
    fussHtml(ci, jahr),
    anfrageSkript(),
    newsletterSkript(),
    terminSkript(),
    // Cookiefreie Website-Analyse: nur auf veröffentlichten Seiten (mit oeffentlichId),
    // nicht in der Editor-/Dashboard-Vorschau. Meldet an /api/oeffentlich/analyse.
    opts.oeffentlichId
      ? '<script>window.__ANALYSE_SEITE=' + JSON.stringify(opts.oeffentlichId) + ';</script><script src="/analyse.js" defer></script>'
      : '',
    (!opts.editor && hatVideo) ? videoSkript() : '',
    (!opts.editor && hatAnfahrt) ? karteSkript() : '',
    (opts.oeffentlichId && hatBuchung) ? buchungSkript() : '',
    (opts.oeffentlichId && hatProdukte) ? produkteSkript() : '',
    (opts.oeffentlichId && hatBewertungen) ? bewertungenSkript() : '',
    opts.editor ? editorSkript() : '',
    '</body></html>',
  ].join('\n');
}
