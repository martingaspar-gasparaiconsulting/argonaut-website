'use client';

// ============================================================
// ARGONAUT OS · Paket 305 · FM1 Fahrzeugmappe — die Seite für den Verkäufer
//
// Läuft unter /ankauf/<kennung> (argonaut-os.com) und /fahrzeug-verkaufen
// (Domain des Autohauses). Trägt Farbe und Namen des AUTOHAUSES.
// Ablauf: Wunsch (verkaufen / in Zahlung geben) -> Fahrzeug -> Fotos -> Videos
// -> Unterlagen und Preis -> Kontakt und Absenden.
// - „Foto machen" öffnet am Handy direkt die Kamera, „Datei wählen" die Galerie
//   bzw. den Dateiordner. Jede Datei: groß ansehen, neu aufnehmen, löschen.
// - Fotos werden im Browser verkleinert und auf Schärfe/Helligkeit geprüft
//   (lib/fahrzeugMappe.bildMesswerte) — Hinweis, keine Sperre, keine KI.
// - Dateien gehen direkt in den privaten Ordner (signierter Upload-Link vom
//   Server), mit Fortschrittsbalken. Angaben werden zwischengespeichert.
// - Am Computer: QR-Code „Am Handy weitermachen" (Link mit Schlüssel im #).
// Kein Supabase-Client im Browser: alles über /api/oeffentlich/fahrzeugmappe.
// Paket 307 (FM3): „Automatisch ausfüllen" liest den Fahrzeugschein (KI) — nur
// Vorschläge zum Anhaken, übernommen wird erst auf Knopfdruck des Verkäufers.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FAECHER, FOTO_HINWEIS, bildMesswerte, bildUrteil, einwilligungText, fachZu, istBild, istPdf, istVideo,
  mbText, tokenGueltig, vollstaendigkeit, zielGroesse, type Fach, type Urteil,
} from '@/lib/fahrzeugMappe';
import { Symbol } from './Symbole';
import { VORBEHALT_TEXT, euroText, nachrichtInhalt, standFuerKunde, tagText, terminText, type Nachricht } from '@/lib/fahrzeugMappeAntwort';
import { VideoAufnahme, aufnahmeMoeglich } from './VideoAufnahme';
import { ERKANNT_HINWEIS, LESEN_MIME, uebernehmen, vorschlaege, type Erkannt } from '@/lib/fahrzeugMappeAuslesen';

type Datei = {
  id: string; fach: string; mime: string; bytes: number | null; url: string | null; beschreibung: string | null;
  pruefung: { schaerfe?: number; helligkeit?: number; stufe?: string };
  lokal?: string; laeuft?: boolean; fortschritt?: number; fehler?: string; roh?: File; neu?: boolean;
};
type Angaben = Record<string, string | boolean>;

const SCHRITTE = [
  { key: 'fahrzeug', titel: 'Fahrzeug' },
  { key: 'fotos', titel: 'Fotos' },
  { key: 'videos', titel: 'Videos' },
  { key: 'unterlagen', titel: 'Unterlagen' },
  { key: 'absenden', titel: 'Absenden' },
] as const;

const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

async function api(pfad: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; j: Record<string, unknown> }> {
  try {
    const r = await fetch(pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, j };
  } catch {
    return { ok: false, status: 0, j: { error: 'Keine Verbindung. Bitte prüfen Sie Ihr Internet.' } };
  }
}

/** Foto verkleinern (JPEG) und auf einer kleinen Kopie Schärfe/Helligkeit messen. */
async function bildVorbereiten(file: File, max: number): Promise<{ blob: Blob; mime: string; mess: { schaerfe: number; helligkeit: number } | null }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const z = zielGroesse(bmp.width, bmp.height, max);
    const c = document.createElement('canvas'); c.width = z.breite; c.height = z.hoehe;
    const g = c.getContext('2d');
    if (!g) throw new Error('kein Zeichenblatt');
    g.drawImage(bmp, 0, 0, z.breite, z.hoehe);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.86));
    const k = zielGroesse(bmp.width, bmp.height, 640);
    const c2 = document.createElement('canvas'); c2.width = k.breite; c2.height = k.hoehe;
    const g2 = c2.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    let mess: { schaerfe: number; helligkeit: number } | null = null;
    if (g2) {
      g2.drawImage(bmp, 0, 0, k.breite, k.hoehe);
      const px = g2.getImageData(0, 0, k.breite, k.hoehe).data;
      const grau = new Uint8ClampedArray(k.breite * k.hoehe);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) grau[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      mess = bildMesswerte(grau, k.breite, k.hoehe);
    }
    bmp.close();
    if (!blob || (file.type === 'image/jpeg' && blob.size >= file.size)) return { blob: file, mime: file.type, mess };
    return { blob, mime: 'image/jpeg', mess };
  } catch {
    // z. B. HEIC am Computer: Original hochladen, ohne Prüfung
    return { blob: file, mime: file.type || 'image/jpeg', mess: null };
  }
}

/** Upload mit Fortschritt direkt in den Speicher (signierter Link). */
function hochladenXhr(url: string, blob: Blob, name: string, fortschritt: (p: number) => void): Promise<boolean> {
  return new Promise((res) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('apikey', ANON);
    x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = (e) => { if (e.lengthComputable) fortschritt(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => res(x.status >= 200 && x.status < 300);
    x.onerror = () => res(false);
    x.onabort = () => res(false);
    const fd = new FormData();
    fd.append('cacheControl', '3600');
    fd.append('', blob, name);
    x.send(fd);
  });
}

function speicherLesen(k: string): string | null {
  try { const t = window.localStorage.getItem(`argonaut-fm-${k}`); return tokenGueltig(t) ? t : null; } catch { return null; }
}
function speicherSetzen(k: string, t: string | null) {
  try { if (t) window.localStorage.setItem(`argonaut-fm-${k}`, t); else window.localStorage.removeItem(`argonaut-fm-${k}`); } catch { /* privat-Modus */ }
}

export default function FahrzeugMappe({ k, firma, akzent, vorne, datenschutz }: { k: string; firma: string; akzent: string; vorne: string; datenschutz: string }) {
  const [phase, setPhase] = useState<'laedt' | 'start' | 'mappe' | 'gesendet' | 'stand'>('laedt');
  const [token, setToken] = useState<string | null>(null);
  const [angaben, setAngaben] = useState<Angaben>({ wunsch: 'verkauf' });
  const [dateien, setDateien] = useState<Datei[]>([]);
  const [schritt, setSchritt] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gross, setGross] = useState<Datei | null>(null);
  const [aufnahme, setAufnahme] = useState<Fach | null>(null);
  const [nr, setNr] = useState<string | null>(null);
  const [einwilligung, setEinwilligung] = useState(false);
  const [hp, setHp] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState<'still' | 'speichert' | 'ok'>('still');
  const [schadenText, setSchadenText] = useState('');
  // Paket 306: Stand nach dem Absenden — Verlauf, Rückfrage mit Nachreichen, Termin bestätigen
  const [verlauf, setVerlauf] = useState<Nachricht[]>([]);
  const [nachreichenBis, setNachreichenBis] = useState<string | null>(null);
  const [nachricht, setNachricht] = useState('');
  const [standOk, setStandOk] = useState<string | null>(null);
  // Paket 307: Fahrzeugschein auslesen
  const [erkannt, setErkannt] = useState<Erkannt | null>(null);
  const [erkanntAuswahl, setErkanntAuswahl] = useState<string[]>([]);
  const [liest, setLiest] = useState(false);
  const [leseFehler, setLeseFehler] = useState<string | null>(null);
  const eingabe = useRef<HTMLInputElement | null>(null);
  const ziel = useRef<{ fach: Fach; kamera: boolean; mehr: boolean } | null>(null);
  const speicherUhr = useRef<number | null>(null);
  const oben = useRef<HTMLDivElement | null>(null);

  const firmaName = firma || 'das Autohaus';

  // --- Laden: Schlüssel aus dem Link (#m=…) oder aus dem Speicher -------------------
  const laden = useCallback(async (t: string) => {
    const r = await api('/api/oeffentlich/fahrzeugmappe', { k, token: t, aktion: 'laden' });
    if (!r.ok) {
      speicherSetzen(k, null);
      setToken(null);
      setPhase('start');
      if (r.status === 404 && /Autohaus/.test(String(r.j.error ?? ''))) setFehler(String(r.j.error));
      return;
    }
    setToken(t);
    if (r.j.status !== 'entwurf') {
      setVerlauf((r.j.verlauf as Nachricht[]) ?? []);
      setNachreichenBis(typeof r.j.nachreichen_bis === 'string' ? r.j.nachreichen_bis : null);
      setDateien(((r.j.dateien as Datei[]) ?? []).map((d) => ({ ...d, pruefung: d.pruefung ?? {} })));
      setPhase('stand');
      return;
    }
    setAngaben({ wunsch: 'verkauf', ...((r.j.angaben as Angaben) ?? {}) });
    setDateien(((r.j.dateien as Datei[]) ?? []).map((d) => ({ ...d, pruefung: d.pruefung ?? {} })));
    setPhase('mappe');
  }, [k]);

  useEffect(() => {
    let t: string | null = null;
    const m = window.location.hash.match(/[#&]m=([A-Za-z0-9_-]{43})/);
    if (m) { t = m[1]; speicherSetzen(k, t); history.replaceState(null, '', window.location.pathname + window.location.search); }
    t = t ?? speicherLesen(k);
    if (t) void laden(t); else setPhase('start');
  }, [k, laden]);

  // --- QR-Code fürs Handy (nur am Computer sinnvoll) -----------------------------------
  useEffect(() => {
    if (!token || phase !== 'mappe') return;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    let aus = false;
    void import('qrcode').then((QR) => QR.toDataURL(`${window.location.origin}${window.location.pathname}#m=${token}`, { margin: 1, width: 360 }))
      .then((u) => { if (!aus) setQr(u); }).catch(() => undefined);
    return () => { aus = true; };
  }, [token, phase]);

  // --- Zwischenspeichern (1,2 s nach der letzten Eingabe) -------------------------------
  function setze(key: string, wert: string | boolean) {
    setzeAlle({ ...angaben, [key]: wert });
  }

  function setzeAlle(neu: Angaben) {
    setAngaben(neu);
    if (!token) return;
    if (speicherUhr.current) window.clearTimeout(speicherUhr.current);
    setGespeichert('speichert');
    speicherUhr.current = window.setTimeout(() => {
      void api('/api/oeffentlich/fahrzeugmappe', { k, token, aktion: 'speichern', angaben: neu }).then((r) => setGespeichert(r.ok ? 'ok' : 'still'));
    }, 1200);
  }

  async function anlegen() {
    setBusy(true); setFehler(null);
    const r = await api('/api/oeffentlich/fahrzeugmappe/start', { k, wunsch: angaben.wunsch, gewerblich: angaben.gewerblich === true });
    setBusy(false);
    if (!r.ok || !tokenGueltig(r.j.token)) { setFehler(String(r.j.error ?? 'Die Mappe konnte nicht angelegt werden.')); return; }
    const t = r.j.token as string;
    speicherSetzen(k, t);
    setToken(t);
    setDateien([]);
    setPhase('mappe');
    setSchritt(0);
  }

  function neuBeginnen() {
    speicherSetzen(k, null);
    setToken(null); setDateien([]); setAngaben({ wunsch: 'verkauf' }); setSchritt(0); setPhase('start');
  }

  // --- Dateien -----------------------------------------------------------------------------
  function waehlen(fach: Fach, kamera: boolean) {
    setFehler(null);
    if (fach.art === 'video' && kamera && aufnahmeMoeglich()) { setAufnahme(fach); return; }
    ziel.current = { fach, kamera, mehr: !kamera && fach.max > 1 };
    const el = eingabe.current;
    if (!el) return;
    el.value = '';
    el.accept = fach.art === 'video' ? 'video/*' : fach.art === 'dokument' || fach.art === 'schein' ? (kamera ? 'image/*' : 'image/*,application/pdf') : 'image/*';
    if (kamera) el.setAttribute('capture', fach.key === 'botschaft' ? 'user' : 'environment'); else el.removeAttribute('capture');
    el.multiple = !kamera && fach.max > 1;
    el.click();
  }

  async function dateienGewaehlt(liste: FileList | null) {
    const z = ziel.current;
    if (!z || !liste || !liste.length) return;
    const files = Array.from(liste).slice(0, z.fach.max);
    const text = z.fach.art === 'schaden' ? schadenText.trim() : '';
    if (z.fach.art === 'schaden') setSchadenText('');
    for (const f of files) await hochladen(z.fach, f, text || null);
  }

  async function hochladen(fach: Fach, file: File, beschreibung: string | null, ersetzt?: string) {
    if (!token) return;
    const tmp = `tmp-${Math.random().toString(36).slice(2)}`;
    const lokal = istBild(file.type) || istVideo(file.type) ? URL.createObjectURL(file) : undefined;
    setDateien((d) => [...d.filter((x) => x.id !== ersetzt), { id: tmp, fach: fach.key, mime: file.type, bytes: file.size, url: null, beschreibung, pruefung: {}, lokal, laeuft: true, fortschritt: 0, roh: file }]);
    const setz = (teil: Partial<Datei>) => setDateien((d) => d.map((x) => (x.id === tmp ? { ...x, ...teil } : x)));

    let blob: Blob = file; let mime = file.type; let mess: { schaerfe: number; helligkeit: number } | null = null;
    if (istBild(file.type)) {
      const v = await bildVorbereiten(file, fach.art === 'dokument' || fach.art === 'schein' ? 2600 : 2048);
      blob = v.blob; mime = v.mime; mess = v.mess;
      setz({ pruefung: mess ? { ...mess, stufe: bildUrteil(mess)?.stufe } : {} });
    }
    const zr = await api('/api/oeffentlich/fahrzeugmappe', {
      k, token, aktion: 'ziel', fach: fach.key, mime, bytes: blob.size, name: file.name, beschreibung, pruefung: mess ?? {},
    });
    if (!zr.ok || typeof zr.j.url !== 'string') { setz({ laeuft: false, fehler: String(zr.j.error ?? 'Hochladen nicht möglich.') }); return; }
    const id = String(zr.j.id);
    const endung = (String(zr.j.mime || mime).split('/')[1] || 'bin').replace('quicktime', 'mov').replace('jpeg', 'jpg');
    const ok = await hochladenXhr(zr.j.url, blob, `datei.${endung}`, (p) => setz({ fortschritt: p }));
    if (!ok) {
      await api('/api/oeffentlich/fahrzeugmappe', { k, token, aktion: 'loeschen', id });
      setz({ laeuft: false, fehler: 'Übertragung abgebrochen. Bitte noch einmal versuchen.' });
      return;
    }
    const fr = await api('/api/oeffentlich/fahrzeugmappe', { k, token, aktion: 'fertig', id });
    if (!fr.ok) { setz({ laeuft: false, fehler: String(fr.j.error ?? 'Die Datei ist nicht angekommen.') }); return; }
    setDateien((d) => {
      const rest = fach.max === 1 ? d.filter((x) => x.fach !== fach.key || x.id === tmp) : d;
      return rest.map((x) => (x.id === tmp ? { ...x, id, url: (fr.j.url as string | null) ?? null, laeuft: false, fortschritt: 100, roh: undefined, neu: true, bytes: Number(fr.j.bytes) || x.bytes } : x));
    });
  }

  async function loeschen(d: Datei) {
    if (d.id.startsWith('tmp-')) { setDateien((x) => x.filter((y) => y.id !== d.id)); return; }
    setDateien((x) => x.map((y) => (y.id === d.id ? { ...y, laeuft: true } : y)));
    const r = await api('/api/oeffentlich/fahrzeugmappe', { k, token, aktion: 'loeschen', id: d.id });
    if (!r.ok) { setDateien((x) => x.map((y) => (y.id === d.id ? { ...y, laeuft: false, fehler: String(r.j.error ?? 'Löschen hat nicht geklappt.') } : y))); return; }
    if (d.lokal) URL.revokeObjectURL(d.lokal);
    setDateien((x) => x.filter((y) => y.id !== d.id));
    setGross(null);
  }

  async function nochmalVersuchen(d: Datei) {
    const fach = fachZu(d.fach);
    if (!fach || !d.roh) { void loeschen(d); return; }
    await hochladen(fach, d.roh, d.beschreibung, d.id);
  }

  // --- Paket 307: Fahrzeugschein automatisch auslesen ----------------------------------------
  async function scheinLesen(id: string) {
    if (!token) return;
    setLiest(true); setLeseFehler(null); setErkannt(null);
    const r = await api('/api/oeffentlich/fahrzeugmappe/schein', { k, token, id });
    setLiest(false);
    if (!r.ok) { setLeseFehler(String(r.j.error ?? 'Automatisches Lesen hat nicht geklappt. Bitte tragen Sie die Angaben selbst ein.')); return; }
    const e = (r.j.erkannt as Erkannt) ?? {};
    if (!Object.keys(e).length) { setLeseFehler('Auf dem Foto war nichts sicher lesbar. Bitte tragen Sie die Angaben selbst ein — oder fotografieren Sie den Schein noch einmal gerade und ohne Spiegelung.'); return; }
    setErkannt(e);
    setErkanntAuswahl(vorschlaege(e, angaben).filter((v) => v.vorgewaehlt).map((v) => v.key));
  }

  function erkanntUebernehmen() {
    if (!erkannt) return;
    setzeAlle(uebernehmen(angaben, erkannt, erkanntAuswahl));
    setErkannt(null);
  }

  // --- Absenden -----------------------------------------------------------------------------
  const fertigeDateien = dateien.filter((d) => !d.laeuft && !d.fehler && !d.id.startsWith('tmp-'));
  const voll = useMemo(() => vollstaendigkeit(fertigeDateien.map((d) => ({ fach: d.fach }))), [fertigeDateien]);
  const laufend = dateien.some((d) => d.laeuft);

  async function absenden() {
    setFehler(null);
    if (laufend) { setFehler('Bitte warten Sie, bis alle Dateien hochgeladen sind.'); return; }
    if (voll.fehlend.length) { setFehler(`Es fehlt noch: ${voll.fehlend.map((f) => f.titel).join(', ')}.`); return; }
    if (!einwilligung) { setFehler('Bitte bestätigen Sie die Einwilligung.'); return; }
    setBusy(true);
    const r = await api('/api/oeffentlich/fahrzeugmappe/absenden', { k, token, angaben, einwilligung: true, firma_hp: hp });
    setBusy(false);
    if (!r.ok) { setFehler(String(r.j.error ?? 'Senden fehlgeschlagen. Bitte versuchen Sie es erneut.')); return; }
    setNr(typeof r.j.nr === 'string' ? r.j.nr : null);
    setPhase('gesendet');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function standSenden(art: 'antwort' | 'termin_ok' | 'nachgereicht', text?: string) {
    setFehler(null); setStandOk(null);
    if (art === 'antwort' && !(text ?? '').trim()) { setFehler('Bitte eine Nachricht eingeben.'); return; }
    if (art === 'nachgereicht' && laufend) { setFehler('Bitte warten Sie, bis alle Dateien hochgeladen sind.'); return; }
    setBusy(true);
    const r = await api('/api/oeffentlich/fahrzeugmappe', { k, token, aktion: art === 'nachgereicht' ? 'nachgereicht' : 'antworten', art, text });
    setBusy(false);
    if (!r.ok) { setFehler(String(r.j.error ?? 'Senden fehlgeschlagen.')); return; }
    setStandOk(art === 'termin_ok' ? 'Danke — Ihre Bestätigung ist beim Autohaus.' : art === 'nachgereicht' ? 'Danke — das Autohaus ist benachrichtigt.' : 'Ihre Nachricht ist beim Autohaus.');
    setNachricht('');
    if (token) await laden(token);
  }

  function geheZu(i: number) {
    setFehler(null);
    setSchritt(Math.max(0, Math.min(SCHRITTE.length - 1, i)));
    oben.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const css = useMemo(() => mappeCss(akzent, vorne), [akzent, vorne]);

  // --- Darstellung ----------------------------------------------------------------------------
  const kachel = (fach: Fach, d: Datei | null, i?: number) => {
    const u: Urteil | null = d ? bildUrteil(d.pruefung?.schaerfe !== undefined && d.pruefung?.helligkeit !== undefined ? { schaerfe: d.pruefung.schaerfe, helligkeit: d.pruefung.helligkeit } : null) : null;
    const quelle = d ? d.lokal ?? d.url : null;
    if (!d) {
      return (
        <div className="fm-kachel leer" key={`${fach.key}-leer-${i ?? 0}`}>
          <div className="fm-kachel-kopf"><span className="fm-kachel-titel">{fach.titel}</span>{fach.pflicht && <span className="fm-pflicht">Pflicht</span>}</div>
          <div className="fm-kachel-hinweis">{fach.hinweis}</div>
          <div className="fm-kachel-knoepfe">
            <button className="fm-knopf klein" onClick={() => waehlen(fach, true)}><Symbol name={fach.art === 'video' ? 'video' : 'kamera'} groesse={18} />{fach.art === 'video' ? 'Aufnehmen' : 'Foto machen'}</button>
            <button className="fm-knopf klein zweit" onClick={() => waehlen(fach, false)} aria-label={`${fach.titel}: Datei wählen`}><Symbol name="hochladen" groesse={18} />Wählen</button>
          </div>
        </div>
      );
    }
    return (
      <div className={`fm-kachel voll${d.fehler ? ' fehlerhaft' : ''}`} key={d.id}>
        <button className="fm-vorschau" onClick={() => !d.laeuft && !d.fehler && setGross(d)} aria-label={`${fach.titel} groß ansehen`}>
          {quelle && istBild(d.mime) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={quelle} alt="" />}
          {quelle && istVideo(d.mime) && <video src={quelle} muted playsInline preload="metadata" />}
          {(!quelle || istPdf(d.mime)) && <div className="fm-doc"><Symbol name="dokument" groesse={34} /><span>{istPdf(d.mime) ? 'PDF' : 'Datei'}{d.bytes ? ` · ${mbText(d.bytes)}` : ''}</span></div>}
          {d.laeuft && <div className="fm-lade"><div className="fm-lade-balken"><span style={{ width: `${d.fortschritt ?? 0}%` }} /></div><span>{(d.fortschritt ?? 0) < 100 ? `${d.fortschritt ?? 0} %` : 'Prüfen …'}</span></div>}
          {istVideo(d.mime) && !d.laeuft && <span className="fm-play"><Symbol name="video" groesse={16} /></span>}
        </button>
        <div className="fm-kachel-unten">
          <div className="fm-kachel-name">
            <span className="fm-kachel-titel">{fach.titel}{fach.max > 1 && i !== undefined ? ` ${i + 1}` : ''}</span>
            {d.fehler ? <span className="fm-marke schlecht">{d.fehler}</span>
              : d.laeuft ? <span className="fm-marke">wird hochgeladen</span>
                : u ? <span className={`fm-marke ${u.stufe === 'gut' ? 'gut' : 'warn'}`}>{u.stufe === 'gut' ? <Symbol name="haken" groesse={13} /> : <Symbol name="achtung" groesse={13} />}{u.text}</span>
                  : <span className="fm-marke gut"><Symbol name="haken" groesse={13} />Hochgeladen</span>}
            {d.beschreibung && <span className="fm-kachel-hinweis">{d.beschreibung}</span>}
          </div>
          <div className="fm-kachel-aktion">
            {d.fehler && d.roh && <button className="fm-rund" onClick={() => void nochmalVersuchen(d)} aria-label="Noch einmal versuchen"><Symbol name="neu" groesse={18} /></button>}
            {!d.laeuft && !d.fehler && fach.max === 1 && phase !== 'stand' && <button className="fm-rund" onClick={() => waehlen(fach, true)} aria-label="Neu aufnehmen"><Symbol name="neu" groesse={18} /></button>}
            {!d.laeuft && (phase !== 'stand' || d.neu) && <button className="fm-rund" onClick={() => void loeschen(d)} aria-label="Löschen"><Symbol name="muell" groesse={18} /></button>}
          </div>
        </div>
      </div>
    );
  };

  const fach = (key: string) => FAECHER.find((f) => f.key === key) as Fach;
  const vonFach = (key: string) => dateien.filter((d) => d.fach === key);
  const einzel = (key: string) => kachel(fach(key), vonFach(key)[0] ?? null);
  const sammel = (key: string, mitText = false) => {
    const f = fach(key);
    const liste = vonFach(key);
    return (
      <div className="fm-sammel">
        <div className="fm-sammel-kopf">
          <div><div className="fm-h3">{f.titel}</div><div className="fm-klein">{f.hinweis} · {liste.length} von {f.max}</div></div>
        </div>
        <div className="fm-raster">
          {liste.map((d, i) => kachel(f, d, i))}
          {liste.length < f.max && (
            <div className="fm-kachel leer neu">
              {mitText && <input className="fm-eingabe" placeholder="Kurz beschreiben, z. B. Delle Tür hinten links" maxLength={200} value={schadenText} onChange={(e) => setSchadenText(e.target.value)} />}
              <div className="fm-kachel-knoepfe">
                <button className="fm-knopf klein" onClick={() => waehlen(f, true)}><Symbol name="kamera" groesse={18} />Foto machen</button>
                <button className="fm-knopf klein zweit" onClick={() => waehlen(f, false)}><Symbol name="hochladen" groesse={18} />{f.art === 'dokument' ? 'Dateien' : 'Wählen'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const feld = (key: string, label: string, extra?: { typ?: string; ph?: string; mode?: 'numeric' | 'decimal' | 'email' | 'tel' | 'text'; auto?: string; pflicht?: boolean; max?: number }) => (
    <label className="fm-feld">
      <span>{label}{extra?.pflicht && <b> *</b>}</span>
      <input className="fm-eingabe" type={extra?.typ ?? 'text'} placeholder={extra?.ph} inputMode={extra?.mode} autoComplete={extra?.auto} maxLength={extra?.max ?? 120}
        value={typeof angaben[key] === 'string' ? (angaben[key] as string) : ''} onChange={(e) => setze(key, e.target.value)} />
    </label>
  );

  return (
    <div className="fm" ref={oben}>
      <style>{css}</style>
      <input ref={eingabe} type="file" hidden onChange={(e) => void dateienGewaehlt(e.currentTarget.files)} />

      {phase === 'laedt' && <div className="fm-karte"><div className="fm-klein">Lädt …</div></div>}

      {phase === 'start' && (
        <>
          <section className="fm-hero">
            <div className="fm-hero-eyebrow">{firmaName}</div>
            <h1 className="fm-h1">Ihr Fahrzeug bewerten lassen. Ohne Anfahrt.</h1>
            <p className="fm-hero-text">Schicken Sie uns Fotos, ein kurzes Video und Ihre Unterlagen. Wir sehen uns alles an und melden uns mit einer Einschätzung und einem Termin.</p>
            <div className="fm-vorteile">
              <span><Symbol name="uhr" groesse={18} />etwa 10 Minuten</span>
              <span><Symbol name="schloss" groesse={18} />nur {firmaName} sieht Ihre Mappe</span>
              <span><Symbol name="haken" groesse={18} />unverbindlich</span>
            </div>
          </section>
          <section className="fm-karte">
            <div className="fm-h2">Was möchten Sie?</div>
            <div className="fm-wahl">
              <button className={`fm-wahl-karte${angaben.wunsch !== 'inzahlungnahme' ? ' an' : ''}`} onClick={() => setAngaben({ ...angaben, wunsch: 'verkauf' })} aria-pressed={angaben.wunsch !== 'inzahlungnahme'}>
                <Symbol name="auto" groesse={28} /><b>Verkaufen</b><span>Sie verkaufen Ihr Fahrzeug an {firmaName}.</span>
              </button>
              <button className={`fm-wahl-karte${angaben.wunsch === 'inzahlungnahme' ? ' an' : ''}`} onClick={() => setAngaben({ ...angaben, wunsch: 'inzahlungnahme' })} aria-pressed={angaben.wunsch === 'inzahlungnahme'}>
                <Symbol name="tausch" groesse={28} /><b>In Zahlung geben</b><span>Beim Kauf eines Fahrzeugs bei {firmaName}.</span>
              </button>
            </div>
            <div className="fm-h2" style={{ marginTop: 22 }}>Das Fahrzeug gehört</div>
            <div className="fm-schalter">
              <button className={angaben.gewerblich !== true ? 'an' : ''} onClick={() => setAngaben({ ...angaben, gewerblich: false })}><Symbol name="person" groesse={18} />einer Privatperson</button>
              <button className={angaben.gewerblich === true ? 'an' : ''} onClick={() => setAngaben({ ...angaben, gewerblich: true })}><Symbol name="firma" groesse={18} />einer Firma</button>
            </div>
            {fehler && <div className="fm-fehler" role="alert">{fehler}</div>}
            <button className="fm-knopf gross" onClick={() => void anlegen()} disabled={busy}>{busy ? 'Einen Moment …' : <>Mappe anlegen <Symbol name="weiter" /></>}</button>
            <div className="fm-klein fm-mitte">Ihre Angaben werden zwischengespeichert. Sie können jederzeit unterbrechen und später weitermachen.</div>
          </section>
        </>
      )}

      {phase === 'mappe' && (
        <>
          <div className="fm-leiste">
            <div className="fm-leiste-oben">
              <div className="fm-leiste-titel">Fahrzeugmappe für {firmaName}</div>
              <div className="fm-klein">{gespeichert === 'speichert' ? 'Speichert …' : gespeichert === 'ok' ? 'Gespeichert' : `${voll.erledigt} von ${voll.pflicht} Pflichtteilen`}</div>
            </div>
            <div className="fm-balken"><span style={{ width: `${voll.prozent}%` }} /></div>
            <nav className="fm-schritte" aria-label="Schritte">
              {SCHRITTE.map((s, i) => (
                <button key={s.key} className={i === schritt ? 'an' : ''} onClick={() => geheZu(i)} aria-current={i === schritt ? 'step' : undefined}>
                  <span className="fm-nr">{i + 1}</span>{s.titel}
                </button>
              ))}
            </nav>
          </div>

          {schritt === 0 && (
            <section className="fm-karte">
              <div className="fm-h2">Fahrzeugschein und Fahrzeug</div>
              <p className="fm-klein">Fotografieren Sie die Vorderseite des Fahrzeugscheins. Die Angaben darunter übernehmen Sie bitte daraus — die FIN finden Sie im Feld E.</p>
              <div className="fm-raster eins">{einzel('schein')}</div>
              {(() => {
                const schein = vonFach('schein').find((d) => !d.laeuft && !d.fehler && !d.id.startsWith('tmp-'));
                if (!schein) return null;
                if (!LESEN_MIME.includes(schein.mime)) return <div className="fm-klein">Dieses Format kann nicht automatisch gelesen werden — bitte tragen Sie die Angaben selbst ein.</div>;
                const liste = erkannt ? vorschlaege(erkannt, angaben) : [];
                return (
                  <div className="fm-lesen">
                    {!erkannt && (
                      <>
                        <button className="fm-knopf zweit" onClick={() => void scheinLesen(schein.id)} disabled={liest}>
                          <Symbol name="haken" groesse={18} />{liest ? 'Liest den Fahrzeugschein …' : 'Angaben automatisch ausfüllen'}
                        </button>
                        <div className="fm-klein">Liest Marke, Modell, FIN, Erstzulassung, Leistung und Kraftstoff vom Foto. Namen und Anschrift werden nicht gelesen. Sie prüfen und übernehmen selbst.</div>
                      </>
                    )}
                    {leseFehler && <div className="fm-fehler" role="alert">{leseFehler}</div>}
                    {erkannt && (
                      <div className="fm-erkannt" role="region" aria-label="Automatisch erkannt">
                        <div className="fm-h3">Automatisch erkannt</div>
                        <div className="fm-klein">{ERKANNT_HINWEIS}</div>
                        {liste.map((v) => (
                          <label key={v.key} className="fm-erkannt-zeile">
                            <input type="checkbox" checked={erkanntAuswahl.includes(v.key)} disabled={v.gleich}
                              onChange={(e) => setErkanntAuswahl((a) => (e.target.checked ? [...a, v.key] : a.filter((x) => x !== v.key)))} />
                            <span className="fm-erkannt-titel">{v.titel} <span className="fm-klein">(Feld {v.feld})</span></span>
                            <b>{v.wert}</b>
                            {v.gleich ? <span className="fm-marke gut">stimmt mit Ihrer Eingabe überein</span>
                              : v.aktuell ? <span className="fm-marke warn">Ihre Eingabe: {v.aktuell}</span> : null}
                          </label>
                        ))}
                        <div className="fm-kachel-knoepfe">
                          <button className="fm-knopf klein" onClick={erkanntUebernehmen} disabled={!erkanntAuswahl.length}>Ausgewählte übernehmen</button>
                          <button className="fm-knopf klein zweit" onClick={() => setErkannt(null)}>Verwerfen</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="fm-felder">
                {feld('marke', 'Marke', { pflicht: true, ph: 'z. B. Volkswagen', max: 60 })}
                {feld('modell', 'Modell', { pflicht: true, ph: 'z. B. Golf', max: 80 })}
                {feld('variante', 'Ausführung / Motor', { ph: 'z. B. 1.5 TSI Life', max: 80 })}
                {feld('erstzulassung', 'Erstzulassung', { ph: 'MM/JJJJ', max: 10 })}
                {feld('km', 'Kilometerstand', { pflicht: true, mode: 'numeric', ph: 'z. B. 68.400', max: 12 })}
                {feld('leistung', 'Leistung in kW (Feld P.2)', { mode: 'numeric', ph: 'z. B. 110', max: 6 })}
                {feld('kraftstoff', 'Kraftstoff', { ph: 'Benzin, Diesel, Elektro …', max: 40 })}
                {feld('fin', 'FIN (Feld E)', { ph: '17 Zeichen', max: 30 })}
                <label className="fm-feld"><span>Unfälle oder Vorschäden</span>
                  <select className="fm-eingabe" value={typeof angaben.unfall === 'string' ? angaben.unfall : 'unbekannt'} onChange={(e) => setze('unfall', e.target.value)}>
                    <option value="unbekannt">weiß ich nicht</option><option value="keine_bekannt">keine bekannt</option><option value="ja">ja</option>
                  </select>
                </label>
              </div>
              {angaben.unfall === 'ja' && <div className="fm-felder eins">{feld('unfall_text', 'Welche? (kurz)', { max: 300 })}</div>}
            </section>
          )}

          {schritt === 1 && (
            <section className="fm-karte">
              <div className="fm-h2">Fotos</div>
              <p className="fm-klein">Acht Ansichten genügen für eine erste Einschätzung. Am besten bei Tageslicht und mit etwas Abstand. {FOTO_HINWEIS}</p>
              <div className="fm-raster">{['vorne_links', 'hinten_rechts', 'seite_links', 'seite_rechts', 'innen_vorne', 'tacho', 'reifen', 'kofferraum'].map((key) => einzel(key))}</div>
              {sammel('weitere')}
              {sammel('schaden', true)}
              <div className="fm-klein">Schäden ehrlich zu zeigen lohnt sich: Dann gibt es beim Termin keine Überraschungen und keine Nachverhandlung.</div>
            </section>
          )}

          {schritt === 2 && (
            <section className="fm-karte">
              <div className="fm-h2">Videos</div>
              <p className="fm-klein">Das Kaltstart-Video sagt viel über Motor und Zustand. 20 bis 40 Sekunden genügen. Rundgang und Videobotschaft sind freiwillig.</p>
              <div className="fm-raster">{['kaltstart', 'rundgang', 'botschaft'].map((key) => einzel(key))}</div>
            </section>
          )}

          {schritt === 3 && (
            <section className="fm-karte">
              <div className="fm-h2">Unterlagen und Preis</div>
              <p className="fm-klein">Belege machen Ihr Fahrzeug mehr wert. Fotos der Seiten oder PDF-Dateien — alles freiwillig.</p>
              {sammel('tuev')}{sammel('service')}{sammel('rechnung')}{sammel('sonstiges')}
              <div className="fm-felder">
                {feld('preis', 'Ihre Preisvorstellung in €', { mode: 'decimal', ph: 'z. B. 14.500', max: 20 })}
              </div>
              <label className="fm-feld"><span>Nachricht an {firmaName}</span>
                <textarea className="fm-eingabe" rows={4} maxLength={1500} placeholder="z. B. Winterräder auf Felgen sind dabei, Nichtraucher, Zahnriemen 2024 neu"
                  value={typeof angaben.beschreibung === 'string' ? angaben.beschreibung : ''} onChange={(e) => setze('beschreibung', e.target.value)} />
              </label>
            </section>
          )}

          {schritt === 4 && (
            <section className="fm-karte">
              <div className="fm-h2">Fast geschafft</div>
              <p className="fm-klein">Wie erreicht {firmaName} Sie? E-Mail oder Telefon genügt.</p>
              <div className="fm-felder">
                {feld('name', 'Name', { pflicht: true, auto: 'name' })}
                {feld('email', 'E-Mail', { typ: 'email', mode: 'email', auto: 'email', max: 160 })}
                {feld('telefon', 'Telefon', { typ: 'tel', mode: 'tel', auto: 'tel', max: 40 })}
                {feld('plz', 'PLZ', { mode: 'numeric', auto: 'postal-code', max: 10 })}
                {feld('ort', 'Ort', { auto: 'address-level2', max: 80 })}
              </div>
              <div className="fm-pruefliste">
                {FAECHER.filter((f) => f.pflicht).map((f) => {
                  const da = !voll.fehlend.some((x) => x.key === f.key);
                  return <button key={f.key} className={da ? 'da' : ''} onClick={() => !da && geheZu(f.gruppe === 'schein' ? 0 : f.gruppe === 'videos' ? 2 : 1)}><Symbol name={da ? 'haken' : 'kreuz'} groesse={15} />{f.titel}</button>;
                })}
              </div>
              <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} className="fm-falle" />
              <label className="fm-haken">
                <input type="checkbox" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} />
                <span>{einwilligungText(firmaName)}</span>
              </label>
              <details className="fm-klein"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Hinweise zum Datenschutz</summary><p style={{ margin: '6px 0 0' }}>{datenschutz}</p></details>
              <div className="fm-klein">Unverbindlich: Ein verbindliches Angebot erhalten Sie erst nach der Besichtigung des Fahrzeugs.</div>
              {fehler && <div className="fm-fehler" role="alert">{fehler}</div>}
              <button className="fm-knopf gross" onClick={() => void absenden()} disabled={busy}>{busy ? 'Wird gesendet …' : <>Mappe an {firmaName} senden <Symbol name="weiter" /></>}</button>
            </section>
          )}

          {fehler && schritt !== 4 && <div className="fm-fehler" role="alert">{fehler}</div>}

          <div className="fm-fussleiste">
            <button className="fm-knopf zweit" onClick={() => geheZu(schritt - 1)} style={{ visibility: schritt === 0 ? 'hidden' : 'visible' }}><Symbol name="zurueck" />Zurück</button>
            {schritt < SCHRITTE.length - 1 && <button className="fm-knopf" onClick={() => geheZu(schritt + 1)}>Weiter <Symbol name="weiter" /></button>}
          </div>

          {qr && (
            <details className="fm-karte fm-qr">
              <summary><Symbol name="handy" />Am Handy weitermachen</summary>
              <div className="fm-qr-innen">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR-Code zu Ihrer Mappe" width={180} height={180} />
                <div className="fm-klein">Mit der Handy-Kamera scannen: Ihre Mappe öffnet sich dort, und Sie können direkt fotografieren und filmen. Den Code nicht weitergeben — er öffnet Ihre Mappe.</div>
              </div>
            </details>
          )}
          <div className="fm-klein fm-mitte"><button className="fm-link" onClick={neuBeginnen}>Neue Mappe beginnen</button></div>
        </>
      )}

      {phase === 'stand' && (() => {
        const st = standFuerKunde(verlauf, nachreichenBis, Date.now());
        const letzte = [...verlauf].filter((n) => n.von === 'haendler').pop() ?? null;
        const termin = letzte?.art === 'einladung' ? letzte : null;
        const angebot = [...verlauf].filter((n) => n.art === 'angebot').pop() ?? null;
        const bestaetigt = termin ? verlauf.some((n) => n.art === 'termin_ok' && n.erstellt_am > termin.erstellt_am) : false;
        return (
          <>
            <section className="fm-hero">
              <div className="fm-hero-eyebrow">{firmaName} · Ihre Fahrzeugmappe</div>
              <h1 className="fm-h1">{st.text}</h1>
              {st.stufe === 'pruefung' && <p className="fm-hero-text">Sie bekommen eine E-Mail, sobald es Neuigkeiten gibt. Diese Seite zeigt immer den aktuellen Stand.</p>}
            </section>

            {st.stufe !== 'absage' && angebot && (
              <section className="fm-karte">
                <div className="fm-klein">Angebot unter Vorbehalt · gültig bis {tagText(angebot.gueltig_bis)}</div>
                <div className="fm-preis">{euroText(Number(angebot.betrag))}</div>
                {angebot.text && <p className="fm-text">{angebot.text}</p>}
                <p className="fm-klein">{VORBEHALT_TEXT}</p>
              </section>
            )}

            {termin && (
              <section className="fm-karte">
                <div className="fm-h2">Termin zur Besichtigung</div>
                <div className="fm-termin"><Symbol name="uhr" groesse={22} />{terminText(termin.termin)}</div>
                {termin.text && <p className="fm-text">{termin.text}</p>}
                {bestaetigt ? <div className="fm-marke gut"><Symbol name="haken" groesse={14} />Von Ihnen bestätigt</div>
                  : <button className="fm-knopf gross" disabled={busy} onClick={() => void standSenden('termin_ok')}><Symbol name="haken" />Termin passt</button>}
                <div className="fm-klein">Passt es nicht? Schreiben Sie unten einen anderen Vorschlag.</div>
              </section>
            )}

            {st.stufe === 'rueckfrage' && letzte && (
              <section className="fm-karte">
                <div className="fm-h2">Rückfrage von {firmaName}</div>
                {letzte.text && <p className="fm-text">{letzte.text}</p>}
                <p className="fm-klein">Sie können bis {terminText(nachreichenBis)} Fotos und Unterlagen nachreichen.</p>
                {sammel('weitere')}{sammel('schaden', true)}{sammel('sonstiges')}
                <button className="fm-knopf gross" disabled={busy} onClick={() => void standSenden('nachgereicht')}>Fertig — {firmaName} benachrichtigen <Symbol name="weiter" /></button>
              </section>
            )}

            <section className="fm-karte">
              <div className="fm-h2">Nachricht an {firmaName}</div>
              <textarea className="fm-eingabe" rows={3} maxLength={1500} value={nachricht} onChange={(e) => setNachricht(e.target.value)} placeholder="z. B. Dienstag passt leider nicht, ginge Mittwoch ab 16 Uhr?" />
              <button className="fm-knopf" disabled={busy} onClick={() => void standSenden('antwort', nachricht)}>Nachricht senden <Symbol name="weiter" /></button>
              {fehler && <div className="fm-fehler" role="alert">{fehler}</div>}
              {standOk && <div className="fm-marke gut" role="status"><Symbol name="haken" groesse={14} />{standOk}</div>}
            </section>

            {verlauf.length > 0 && (
              <section className="fm-karte">
                <div className="fm-h2">Verlauf</div>
                <div className="fm-verlauf">
                  {[...verlauf].reverse().map((n, i) => {
                    const inh = nachrichtInhalt(n, firmaName);
                    return (
                      <div key={i} className={`fm-eintrag${n.von === 'kunde' ? ' ich' : ''}`}>
                        <div className="fm-klein">{n.von === 'kunde' ? 'Sie' : firmaName} · {terminText(n.erstellt_am)}</div>
                        <b>{inh.titel}</b>
                        {inh.zeilen.filter((z) => z !== VORBEHALT_TEXT).map((z, j) => <div key={j} className="fm-text">{z}</div>)}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            <div className="fm-klein fm-mitte"><button className="fm-link" onClick={neuBeginnen}>Weiteres Fahrzeug anbieten</button></div>
          </>
        );
      })()}

      {phase === 'gesendet' && (
        <section className="fm-karte fm-fertig">
          <div className="fm-fertig-haken"><Symbol name="haken" groesse={34} /></div>
          <h1 className="fm-h1">Vielen Dank, Ihre Mappe ist angekommen.</h1>
          {nr && <div className="fm-nummer">Ihre Nummer: <b>{nr}</b></div>}
          <p className="fm-hero-text">{firmaName} sieht sich Fotos, Video und Unterlagen an und meldet sich bei Ihnen. Ein verbindliches Angebot erhalten Sie erst nach der Besichtigung des Fahrzeugs.</p>
          <button className="fm-link" onClick={neuBeginnen}>Weiteres Fahrzeug anbieten</button>
        </section>
      )}

      {gross && (
        <div className="fm-overlay" role="dialog" aria-modal="true" aria-label="Datei ansehen" onClick={() => setGross(null)}>
          <div className="fm-gross" onClick={(e) => e.stopPropagation()}>
            <div className="fm-rec-kopf">
              <div className="fm-rec-titel">{fachZu(gross.fach)?.titel}</div>
              <button className="fm-rund" onClick={() => setGross(null)} aria-label="Schließen"><Symbol name="kreuz" /></button>
            </div>
            <div className="fm-gross-bild">
              {istBild(gross.mime) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={gross.lokal ?? gross.url ?? ''} alt="" />}
              {istVideo(gross.mime) && <video src={gross.lokal ?? gross.url ?? ''} controls playsInline autoPlay />}
              {istPdf(gross.mime) && gross.url && <a className="fm-knopf" href={gross.url} target="_blank" rel="noopener noreferrer"><Symbol name="dokument" />PDF öffnen</a>}
            </div>
            <div className="fm-zeile">
              {(fachZu(gross.fach)?.max ?? 0) === 1 && <button className="fm-knopf zweit" onClick={() => { const f = fachZu(gross.fach); setGross(null); if (f) waehlen(f, true); }}><Symbol name="neu" />Neu aufnehmen</button>}
              <button className="fm-knopf zweit gefahr" onClick={() => void loeschen(gross)}><Symbol name="muell" />Löschen</button>
            </div>
          </div>
        </div>
      )}

      {aufnahme && (
        <VideoAufnahme titel={aufnahme.titel} hinweis={aufnahme.hinweis} vorne={aufnahme.key === 'botschaft'} akzent={akzent} vorneText={vorne}
          onAbbruch={() => setAufnahme(null)}
          onGehtNicht={() => { const f = aufnahme; setAufnahme(null); if (f) { ziel.current = { fach: f, kamera: true, mehr: false }; const el = eingabe.current; if (el) { el.value = ''; el.accept = 'video/*'; el.setAttribute('capture', f.key === 'botschaft' ? 'user' : 'environment'); el.multiple = false; el.click(); } } }}
          onFertig={(file) => { const f = aufnahme; setAufnahme(null); void hochladen(f, file, null); }} />
      )}
    </div>
  );
}

function mappeCss(a: string, v: string): string {
  return `
.fm{color-scheme:light;--a:${a};--v:${v};--t:#111827;--d:#5B6676;--l:#E2E7EE;--k:#fff;--h:#F4F6F9;--ok:#1F8A5B;--okb:#E6F5EE;--w:#9A6A00;--wb:#FFF4D6;--s:#B42318;--sb:#FDECEA;max-width:880px;margin:0 auto;display:grid;gap:16px;color:var(--t)}
.fm *{box-sizing:border-box}
.fm button{font:inherit;cursor:pointer}
.fm-hero{background:var(--a);color:var(--v);border-radius:22px;padding:28px 22px}
.fm-hero-eyebrow{font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:.85}
.fm-h1{font-size:clamp(24px,5vw,34px);line-height:1.15;font-weight:800;margin:8px 0 10px;letter-spacing:-.01em}
.fm-hero-text{font-size:16px;line-height:1.55;margin:0;opacity:.92;max-width:620px}
.fm-vorteile{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:18px;font-size:14px;font-weight:600}
.fm-vorteile span{display:inline-flex;gap:6px;align-items:center}
.fm-karte{background:var(--k);border:1px solid var(--l);border-radius:20px;padding:22px 18px;display:grid;gap:14px}
.fm-h2{font-size:20px;font-weight:800;letter-spacing:-.005em}
.fm-h3{font-size:16px;font-weight:700}
.fm-klein{font-size:13.5px;color:var(--d);line-height:1.5;margin:0}
.fm-mitte{text-align:center}
.fm-wahl{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.fm-wahl-karte{display:grid;gap:6px;justify-items:start;text-align:left;border:1.5px solid var(--l);background:var(--k);border-radius:16px;padding:18px;color:var(--t);transition:border-color .15s,box-shadow .15s}
.fm-wahl-karte b{font-size:17px}
.fm-wahl-karte span{font-size:13.5px;color:var(--d)}
.fm-wahl-karte.an{border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 18%,transparent)}
.fm-schalter{display:flex;gap:6px;background:var(--h);padding:5px;border-radius:14px;width:fit-content;max-width:100%;flex-wrap:wrap}
.fm-schalter button{display:inline-flex;gap:6px;align-items:center;border:0;background:transparent;padding:10px 14px;border-radius:10px;color:var(--d);font-weight:600}
.fm-schalter button.an{background:var(--k);color:var(--t);box-shadow:0 1px 3px rgba(17,24,39,.12)}
.fm-knopf{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;background:var(--a);color:var(--v);border-radius:14px;padding:13px 18px;font-weight:700;font-size:15px;text-decoration:none;min-height:48px;transition:transform .1s,opacity .15s}
.fm-knopf:active{transform:scale(.98)}
.fm-knopf:disabled{opacity:.6}
.fm-knopf.gross{width:100%;font-size:17px;min-height:56px;border-radius:16px}
.fm-knopf.klein{padding:9px 10px;font-size:14px;min-height:42px;border-radius:12px;width:100%;white-space:nowrap}
.fm-knopf.zweit{background:var(--k);color:var(--t);border:1.5px solid var(--l)}
.fm-knopf.gefahr{color:var(--s)}
.fm-link{border:0;background:none;color:var(--d);text-decoration:underline;font-size:13.5px;padding:6px}
.fm-rund{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:999px;border:1.5px solid var(--l);background:var(--k);color:var(--t)}
.fm-leiste{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--h) 88%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:10px 2px 8px;display:grid;gap:8px}
.fm-leiste-oben{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap}
.fm-leiste-titel{font-weight:800;font-size:15px}
.fm-balken{height:6px;background:var(--l);border-radius:99px;overflow:hidden}
.fm-balken span{display:block;height:100%;background:var(--a);border-radius:99px;transition:width .3s}
.fm-schritte{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.fm-schritte::-webkit-scrollbar{display:none}
.fm-schritte button{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border:1.5px solid var(--l);background:var(--k);color:var(--d);border-radius:999px;padding:7px 12px 7px 7px;font-size:13.5px;font-weight:600}
.fm-schritte button.an{border-color:var(--a);color:var(--t)}
.fm-nr{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:99px;background:var(--h);font-size:12px;font-weight:800}
.fm-schritte button.an .fm-nr{background:var(--a);color:var(--v)}
.fm-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.fm-raster.eins{grid-template-columns:minmax(0,420px)}
@media (max-width:520px){.fm-raster{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fm-raster.eins{grid-template-columns:minmax(0,1fr)}.fm-karte{padding:18px 14px}.fm-kachel.neu{grid-column:span 2}}
.fm-kachel{border-radius:16px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.fm-kachel.leer{border:1.5px dashed #C5CEDA;background:var(--h);padding:12px;gap:6px;justify-content:space-between;min-height:168px}
.fm-kachel.neu{justify-content:center}
.fm-kachel.voll{border:1px solid var(--l);background:var(--k);position:relative}
.fm-kachel.fehlerhaft{border-color:var(--s)}
.fm-kachel-kopf{display:flex;gap:6px;justify-content:space-between;align-items:center}
.fm-kachel-titel{font-weight:700;font-size:14.5px}
.fm-kachel-hinweis{font-size:12.5px;color:var(--d);line-height:1.4}
.fm-kachel-knoepfe{display:flex;flex-direction:column;gap:6px;margin-top:auto}
.fm-pflicht{font-size:11px;font-weight:700;color:var(--a);background:color-mix(in srgb,var(--a) 10%,#fff);border-radius:99px;padding:2px 8px}
.fm-vorschau{position:relative;display:block;width:100%;aspect-ratio:4/3;border:0;padding:0;background:#E9EDF2;overflow:hidden}
.fm-vorschau img,.fm-vorschau video{width:100%;height:100%;object-fit:cover;display:block}
.fm-doc{display:grid;place-items:center;align-content:center;gap:6px;height:100%;color:var(--d);font-size:13px;font-weight:600}
.fm-lade{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:8px;background:rgba(17,24,39,.55);color:#fff;font-size:13px;font-weight:700}
.fm-lade-balken{width:70%;height:6px;background:rgba(255,255,255,.3);border-radius:99px;overflow:hidden}
.fm-lade-balken span{display:block;height:100%;background:#fff;transition:width .2s}
.fm-play{position:absolute;right:8px;bottom:8px;background:rgba(17,24,39,.7);color:#fff;border-radius:99px;padding:5px;display:grid}
.fm-kachel-unten{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;padding:10px}
.fm-kachel-name{display:grid;gap:4px;min-width:0}
.fm-kachel-aktion{position:absolute;top:8px;right:8px;display:flex;gap:6px}
.fm-kachel-aktion .fm-rund{width:36px;height:36px;border:0;background:rgba(255,255,255,.92);box-shadow:0 1px 4px rgba(17,24,39,.25)}
.fm-marke{display:inline-flex;gap:4px;align-items:center;font-size:12px;font-weight:600;color:var(--d)}
.fm-marke.gut{color:var(--ok)}
.fm-marke.warn{color:var(--w)}
.fm-marke.schlecht{color:var(--s)}
.fm-sammel{display:grid;gap:10px;border-top:1px solid var(--l);padding-top:14px}
.fm-sammel-kopf{display:flex;justify-content:space-between;gap:10px;align-items:flex-end}
.fm-felder{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.fm-felder.eins{grid-template-columns:1fr}
.fm-feld{display:grid;gap:6px;font-size:13.5px;color:var(--d);font-weight:600}
.fm-feld b{color:var(--a)}
.fm-eingabe{width:100%;border:1.5px solid var(--l);border-radius:12px;padding:12px 13px;font:inherit;font-size:16px;font-weight:500;color:var(--t);background:var(--k);min-width:0}
.fm-eingabe:focus{outline:none;border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 15%,transparent)}
textarea.fm-eingabe{resize:vertical}
.fm-fussleiste{position:sticky;bottom:0;z-index:5;display:flex;justify-content:space-between;gap:10px;padding:12px 0 calc(12px + env(safe-area-inset-bottom));background:linear-gradient(to top,var(--h) 70%,transparent)}
.fm-fussleiste .fm-knopf{flex:1;max-width:260px}
.fm-pruefliste{display:flex;flex-wrap:wrap;gap:6px}
.fm-pruefliste button{display:inline-flex;gap:5px;align-items:center;border:1px solid var(--l);background:var(--sb);color:var(--s);border-radius:99px;padding:5px 10px;font-size:12.5px;font-weight:600}
.fm-pruefliste button.da{background:var(--okb);color:var(--ok);cursor:default}
.fm-haken{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5;color:var(--t)}
.fm-haken input{width:20px;height:20px;margin-top:2px;flex:none;accent-color:var(--a)}
.fm-lesen{display:grid;gap:8px;margin:4px 0 6px}
.fm-erkannt{border:1.5px solid var(--a);border-radius:16px;padding:14px;display:grid;gap:8px;background:var(--h)}
.fm-erkannt-zeile{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center;padding:8px 0;border-top:1px solid var(--l);cursor:pointer}
.fm-erkannt-zeile input{width:20px;height:20px;grid-row:span 3}
.fm-erkannt-zeile b{font-size:16px;word-break:break-all}
.fm-erkannt-titel{font-size:13px;color:var(--d)}
.fm-fehler{background:var(--sb);color:var(--s);border-radius:12px;padding:10px 13px;font-size:14px;font-weight:600}
.fm-falle{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.fm-qr summary{display:flex;gap:8px;align-items:center;font-weight:700;cursor:pointer;list-style:none}
.fm-qr-innen{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:12px}
.fm-qr-innen img{border-radius:12px;border:1px solid var(--l)}
.fm-fertig{text-align:center;justify-items:center;padding:36px 20px}
.fm-fertig-haken{width:68px;height:68px;border-radius:99px;display:grid;place-items:center;background:var(--okb);color:var(--ok)}
.fm-nummer{font-size:16px}
.fm-preis{font-size:clamp(30px,7vw,42px);font-weight:800;letter-spacing:-.02em;color:var(--a)}
.fm-text{margin:0;font-size:15px;line-height:1.55;white-space:pre-wrap}
.fm-termin{display:flex;gap:10px;align-items:center;font-size:18px;font-weight:700}
.fm-verlauf{display:grid;gap:12px}
.fm-eintrag{border-left:3px solid var(--a);padding-left:12px;display:grid;gap:3px}
.fm-eintrag.ich{border-left-color:#C5CEDA}
.fm-overlay{position:fixed;inset:0;z-index:50;background:rgba(10,14,22,.78);display:grid;place-items:center;padding:12px}
.fm-rec,.fm-gross{width:min(720px,100%);max-height:100%;overflow:auto;background:#fff;border-radius:20px;padding:14px;display:grid;gap:12px;color:var(--t)}
.fm-rec-kopf{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.fm-rec-titel{font-weight:800;font-size:17px}
.fm-rec-hinweis{font-size:13px;color:var(--d)}
.fm-rec-bild{position:relative;background:#000;border-radius:14px;overflow:hidden;aspect-ratio:16/9;display:grid;place-items:center}
@media (max-width:520px){.fm-rec-bild{aspect-ratio:3/4}}
.fm-rec-video{width:100%;height:100%;object-fit:cover}
.fm-rec-zeit{position:absolute;top:10px;left:10px;display:inline-flex;gap:8px;align-items:center;background:rgba(0,0,0,.6);color:#fff;border-radius:99px;padding:5px 11px;font-size:13px;font-weight:700}
.fm-rec-punkt{width:9px;height:9px;border-radius:99px;background:#F04438;animation:fmblink 1s infinite}
@keyframes fmblink{50%{opacity:.25}}
.fm-rec-mitte{position:absolute;inset:0;display:grid;place-items:center;color:#fff;padding:20px;text-align:center;font-size:14px}
.fm-rec-fuss{display:flex;justify-content:center}
.fm-rec-klein{font-size:12px;color:var(--d);text-align:center}
.fm-aufnahme{width:72px;height:72px;border-radius:99px;border:4px solid #D0D5DD;background:#fff;display:grid;place-items:center;padding:0}
.fm-aufnahme span{width:52px;height:52px;border-radius:99px;background:#F04438;transition:all .2s}
.fm-aufnahme.an span{width:28px;height:28px;border-radius:7px}
.fm-zeile{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.fm-gross-bild{display:grid;place-items:center;background:#0B0F17;border-radius:14px;overflow:hidden;min-height:200px}
.fm-gross-bild img,.fm-gross-bild video{max-width:100%;max-height:70vh;display:block}
`;
}
