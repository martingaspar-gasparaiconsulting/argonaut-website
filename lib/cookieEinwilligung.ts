// ============================================================================
// ARGONAUT OS · lib/cookieEinwilligung.ts — Paket C1 (16.10.2026)
// Einwilligungs-Fenster und Besucher-Messung mit Cookie auf Kunden-Webseiten.
//
// Heute zählen Kunden-Webseiten nur ohne Cookie (Tageskennung, lib/besucherKennung.ts):
// wiederkehrende Besucher und Kampagnen-Wege über mehrere Tage sind nicht messbar.
// C1 ergänzt — NUR mit Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO):
//   · eigenes Fenster, „Annehmen" und „Ablehnen" gleichwertig (gleiche Größe, Farbe,
//     Ebene), kein vorausgewähltes Häkchen, kein „Schließen", das als Ja zählt
//   · erst NACH „Annehmen" ein eigenes Cookie mit einer Zufalls-Kennung
//     (keine IP, kein Fingerabdruck, keine Weitergabe an Google & Co.)
//   · Nachweis je Entscheidung (Zeitpunkt, Text-Fassung, Kennung) — ohne IP
//   · jederzeit widerrufbar über „Cookie-Einstellungen" im Fuß; beim Widerruf
//     wird die Kennung aus allen Messdaten entfernt
//   · wer ablehnt, wird weiter ohne Cookie gezählt (wie bisher)
//
// Gesperrt hinter dem Start-Schalter `cookieMessung` (lib/startSperre.ts, R68)
// UND zusätzlich je Betrieb einzuschalten (web_ci.cookie_messung).
//
// Keine Imports — node-testbar (tests/cookieEinwilligungC1.test.mjs).
// ============================================================================

/** Fassung des Fenster-Texts. Bei JEDER Textänderung neue Fassung anhängen (Nachweis). */
export const EINWILLIGUNG_VERSIONEN = ['c1-2026-10-16'] as const;
export const EINWILLIGUNG_VERSION: string = EINWILLIGUNG_VERSIONEN[EINWILLIGUNG_VERSIONEN.length - 1];

/** Name des einen Cookies. Inhalt: „ja.<kennung>" oder „nein". */
export const COOKIE_NAME = 'ao_einw';
/** Laufzeit in Tagen. Danach fragt das Fenster neu. */
export const COOKIE_TAGE = 365;

export type Entscheidung = 'ja' | 'nein' | 'widerruf';

export const FENSTER = Object.freeze({
  titel: 'Darf diese Website Sie wiedererkennen?',
  text:
    'Mit Ihrer Erlaubnis speichern wir ein Cookie mit einer zufälligen Kennung auf Ihrem Gerät. '
    + 'So sehen wir, ob Sie wiederkommen und über welche Anzeige oder welchen Link Sie uns gefunden haben. '
    + 'Die Daten bleiben bei uns und unserem Dienstleister ARGONAUT OS – keine Weitergabe an Google oder andere Werbenetzwerke. '
    + 'Lehnen Sie ab, zählen wir Ihren Besuch nur anonym ohne Cookie. '
    + 'Ihre Wahl können Sie jederzeit unten unter „Cookie-Einstellungen“ ändern.',
  ablehnen: 'Ablehnen',
  annehmen: 'Annehmen',
  mehr: 'Mehr in der Datenschutzerklärung',
  einstellungen: 'Cookie-Einstellungen',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Gültige Besucher-Kennung (Zufalls-UUID v4, klein geschrieben)? */
export function gueltigeKennung(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/** Liest die Wahl aus einem Cookie-Kopf („a=1; ao_einw=ja.<uuid>"). */
export function wahlLesen(cookieKopf: string | null | undefined): { wahl: 'ja' | 'nein' | null; kennung: string | null } {
  const m = /(?:^|;\s*)ao_einw=([^;]*)/.exec(cookieKopf || '');
  if (!m) return { wahl: null, kennung: null };
  let w = '';
  try { w = decodeURIComponent(m[1]); } catch { w = ''; }
  if (w === 'nein') return { wahl: 'nein', kennung: null };
  const ja = /^ja\.(.+)$/.exec(w);
  if (ja && gueltigeKennung(ja[1])) return { wahl: 'ja', kennung: ja[1] };
  return { wahl: null, kennung: null };
}

export type EntscheidungEingang = {
  seite: string;
  entscheidung: Entscheidung;
  besucher_id: string | null;
  text_version: string;
};

/**
 * Prüft die Meldung des Fensters. Gibt die bereinigte Zeile zurück oder einen Fehlertext.
 * Regeln: „ja" und „widerruf" brauchen eine gültige Kennung, „nein" hat nie eine;
 * nur bekannte Text-Fassungen (sonst ist der Nachweis wertlos).
 */
export function entscheidungPruefen(b: unknown): EntscheidungEingang | { fehler: string } {
  if (!b || typeof b !== 'object') return { fehler: 'leer' };
  const o = b as Record<string, unknown>;
  const seite = typeof o.seite === 'string' ? o.seite.trim() : '';
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(seite)) return { fehler: 'seite' };
  const e = o.entscheidung;
  if (e !== 'ja' && e !== 'nein' && e !== 'widerruf') return { fehler: 'entscheidung' };
  const v = typeof o.version === 'string' ? o.version : '';
  if (!(EINWILLIGUNG_VERSIONEN as readonly string[]).includes(v)) return { fehler: 'version' };
  const id = o.besucher_id;
  if (e === 'nein') {
    if (id !== null && id !== undefined && id !== '') return { fehler: 'kennung' };
    return { seite, entscheidung: e, besucher_id: null, text_version: v };
  }
  if (!gueltigeKennung(id)) return { fehler: 'kennung' };
  return { seite, entscheidung: e, besucher_id: id, text_version: v };
}

/** Ist die Messung mit Cookie für diese Seite wirksam? Beides muss an sein. */
export function messungAktiv(schalterFrei: boolean, ci: { cookie_messung?: boolean | null } | null | undefined): boolean {
  return schalterFrei === true && ci?.cookie_messung === true;
}

/** Kennung aus einem Mess-Ereignis nur übernehmen, wenn gültig und die Messung wirksam ist. */
export function kennungFuerEreignis(roh: unknown, aktiv: boolean): string | null {
  return aktiv && gueltigeKennung(roh) ? roh : null;
}

/** Absatz für die Datenschutzerklärung der Kunden-Webseite (nur wenn die Messung an ist). */
export const DATENSCHUTZ_ABSCHNITT = Object.freeze({
  titel: 'Wiedererkennung mit Cookie (nur mit Ihrer Einwilligung)',
  absaetze: [
    'Nur wenn Sie im Fenster „Annehmen" wählen, speichern wir das Cookie „ao_einw" mit einer zufällig erzeugten Kennung auf Ihrem Gerät (Laufzeit 12 Monate). Damit erkennen wir wiederkehrende Besuche und über welche Anzeige oder welchen Link Sie zu uns gekommen sind. Die Kennung enthält keinen Namen und keine IP-Adresse. Die Daten verarbeitet ARGONAUT OS als unser Auftragsverarbeiter; sie werden nicht an Werbenetzwerke weitergegeben. Rechtsgrundlage ist Ihre Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO).',
    'Lehnen Sie ab, speichern wir im selben Cookie nur den Vermerk „nein", damit das Fenster nicht bei jedem Aufruf erneut erscheint (§ 25 Abs. 2 Nr. 2 TDDDG); Ihr Besuch wird dann nur wie oben beschrieben ohne Wiedererkennung gezählt.',
    'Als Nachweis speichern wir zu jeder Entscheidung Zeitpunkt, Fassung des Fenster-Texts und – bei „Annehmen" – die Kennung, nicht aber Ihre IP-Adresse. Sie können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft über „Cookie-Einstellungen" im Fuß jeder Seite widerrufen. Dann wird das Cookie gelöscht und die Kennung aus unseren Messdaten entfernt.',
  ],
});

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Das Fenster (HTML). Startet versteckt — das Skript zeigt es nur ohne Wahl. */
export function fensterHtml(): string {
  return [
    '<div id="ao-einw" class="ao-einw" role="dialog" aria-modal="false" aria-labelledby="ao-einw-t" aria-describedby="ao-einw-x" hidden>',
    '<div class="ao-einw-in">',
    '<div id="ao-einw-t" class="ao-einw-t">' + esc(FENSTER.titel) + '</div>',
    '<p id="ao-einw-x" class="ao-einw-x">' + esc(FENSTER.text) + ' <a href="#datenschutz">' + esc(FENSTER.mehr) + '</a></p>',
    '<div class="ao-einw-k">',
    '<button type="button" class="ao-einw-b" data-wahl="nein">' + esc(FENSTER.ablehnen) + '</button>',
    '<button type="button" class="ao-einw-b" data-wahl="ja">' + esc(FENSTER.annehmen) + '</button>',
    '</div></div></div>',
  ].join('');
}

/** Schwarz oder Weiß — was auf der Knopffarbe besser lesbar ist (WCAG-Leuchtdichte). */
export function knopfSchrift(hex: string): '#000000' | '#ffffff' {
  let h = (hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}/.test(h)) return '#ffffff';
  const kanal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
  // Kontrast gegen Weiß (1,05) und gegen Schwarz (0,05) vergleichen.
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? '#ffffff' : '#000000';
}

/** Gleichwertige Knöpfe: EINE Klasse, eine Farbe, eine Größe für beide. */
export function fensterCss(primaer: string): string {
  const p = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaer) ? primaer : '#0A1628';
  const t = knopfSchrift(p);
  return '.ao-einw{position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:12px 16px;background:rgba(0,0,0,.35)}'
    + '.ao-einw[hidden]{display:none}'
    + '.ao-einw-in{max-width:720px;margin:0 auto;background:#fff;color:#1a1a1a;border-radius:12px;padding:18px 20px;box-shadow:0 8px 30px rgba(0,0,0,.25);font-size:15px;line-height:1.5}'
    + '.ao-einw-t{font-weight:700;font-size:17px;margin-bottom:6px}'
    + '.ao-einw-x{margin:0 0 14px}.ao-einw-x a{color:inherit;text-decoration:underline}'
    + '.ao-einw-k{display:flex;gap:12px;flex-wrap:wrap}'
    + '.ao-einw-b{flex:1 1 160px;min-height:44px;padding:10px 16px;border:2px solid ' + p + ';border-radius:8px;background:' + p + ';color:' + t + ';font:inherit;font-weight:600;cursor:pointer}'
    + '.ao-einw-b:focus-visible{outline:3px solid #1a73e8;outline-offset:2px}'
    + '.ao-fuss-einw{background:none;border:0;padding:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}';
}

/**
 * Das Skript des Fensters (ES5, inline). Setzt das Cookie ERST nach „Annehmen",
 * gibt die Kennung über window.__ANALYSE_BESUCHER an public/analyse.js weiter
 * (analyse.js selbst liest nie ein Cookie) und meldet jede Entscheidung als Nachweis.
 */
export function fensterSkript(oeffentlichId: string): string {
  const seite = JSON.stringify(String(oeffentlichId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100));
  return '<script>(function(){try{'
    + 'var SEITE=' + seite + ',V=' + JSON.stringify(EINWILLIGUNG_VERSION) + ',N="' + COOKIE_NAME + '",TAGE=' + COOKIE_TAGE + ';'
    + 'var f=document.getElementById("ao-einw");if(!f)return;'
    + 'function lies(){var m=document.cookie.match(/(?:^|;\\s*)ao_einw=([^;]*)/);if(!m)return"";try{return decodeURIComponent(m[1]);}catch(e){return"";}}'
    + 'function setze(w,tage){var d=new Date(Date.now()+tage*864e5);document.cookie=N+"="+encodeURIComponent(w)+";expires="+d.toUTCString()+";path=/;SameSite=Lax"+(location.protocol==="https:"?";Secure":"");}'
    + 'function neueId(){var c=window.crypto;if(c&&c.randomUUID)return c.randomUUID();var b=new Uint8Array(16);c.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h="";for(var i=0;i<16;i++){h+=(b[i]+256).toString(16).slice(1);if(i===3||i===5||i===7||i===9)h+="-";}return h;}'
    + 'function melden(e,id){try{fetch("/api/oeffentlich/einwilligung",{method:"POST",keepalive:true,headers:{"content-type":"application/json"},body:JSON.stringify({seite:SEITE,entscheidung:e,besucher_id:id||null,version:V})});}catch(x){}}'
    + 'function zeigen(){f.hidden=false;var k=f.querySelector("[data-wahl]");if(k&&k.focus)k.focus();}'
    + 'var w=lies(),m=/^ja\\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(w),id=m?m[1]:null;'
    + 'if(id){window.__ANALYSE_BESUCHER=id;}else if(w!=="nein"){zeigen();}'
    + 'f.querySelector("[data-wahl=ja]").addEventListener("click",function(){var neu=id||neueId();setze("ja."+neu,TAGE);window.__ANALYSE_BESUCHER=neu;f.hidden=true;if(!id)melden("ja",neu);id=neu;});'
    + 'f.querySelector("[data-wahl=nein]").addEventListener("click",function(){var alt=id;setze("nein",TAGE);window.__ANALYSE_BESUCHER=null;f.hidden=true;melden(alt?"widerruf":"nein",alt);id=null;});'
    + 'var o=document.querySelectorAll("[data-ao-einw-oeffnen]");for(var i=0;i<o.length;i++)o[i].addEventListener("click",function(ev){ev.preventDefault();zeigen();});'
    + '}catch(e){}})();</script>';
}
