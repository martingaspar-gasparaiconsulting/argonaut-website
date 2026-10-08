'use client';

// ============================================================
// ARGONAUT OS · Paket 270 · K9 Probefahrt und Vorführwagen (Reiter „Probefahrt" in der Handelsakte)
// Fahrten mit diesem Fahrzeug: Probefahrt, Vorführwagen, Ersatzwagen, Überführung.
// Fahrer, Führerschein (nur Haken, Klasse, Gültigkeit — keine Nummer), Kennzeichen
// (eigenes, rotes 06er oder Kurzzeit), Übergabe und Rückgabe mit km, Tank, Schäden,
// Vereinbarung und Rückgabeprotokoll als PDF und über ARGONAUT-Sign. Nach der
// Rückgabe einer Probefahrt startet der Nachfass automatisch (Datum + Erinnerung).
// Rechte: lesen mit „KFZ", schreiben mit Schreibrecht „KFZ", löschen nur der Chef.
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { signaturStarten } from '@/lib/signaturStart';
import { alsText, type Firmenkopf } from '@/lib/kfzVerkauf';
import { verkaufPdf } from '@/lib/kfzVerkaufPdf';
import {
  ARTEN, TANK, KZ_ARTEN, ERGEBNISSE, naechsteFahrtNr, artLabel, freieKennzeichen, startPruefen, rueckgabePruefen,
  gefahren, mehrKm, ueberfaellig, nachfassDatum, nachfassFaellig, fahrtDokument, fahrtDateiName, FAHRT_DOKS, kzNorm,
  type Fahrt, type RotesKz, type FahrzeugKurz, type FahrtDok,
} from '@/lib/kfzProbefahrt';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };

type Zeile = Fahrt & { id: string; owner_user_id: string; signaturen: Record<string, string> | null; erstellt_am: string };
export type ProbefahrtFahrzeug = { id: string; owner_user_id: string; fz: FahrzeugKurz };

function jetztIso(): string { return new Date().toISOString(); }
function heute(): string { return new Date().toISOString().slice(0, 10); }
/** ISO -> Wert für <input type="datetime-local"> in Ortszeit. */
function lokal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function vonLokal(v: string): string | null { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function t(v: number | null | undefined): string { return v === null || v === undefined ? '' : String(v).replace('.', ','); }
function ganz(v: string): number | null { const n = leseZahl(v); return n === null || n < 0 ? null : Math.round(n); }
function betrag(v: string): number | null { const n = leseZahl(v); return n === null || n < 0 ? null : n; }
function de(iso: string | null): string { return iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

type Entwurf = {
  art: string; fahrer_name: string; fahrer_anschrift: string; fahrer_tel: string; fahrer_email: string;
  fs_geprueft: boolean; fs_klasse: string; fs_gueltig_bis: string; begleitet: boolean;
  kennzeichen_art: string; kennzeichen: string; start_am: string; ende_geplant: string;
  km_start: string; km_frei: string; tank_start: string; schaeden_start: string; selbstbeteiligung: string;
  km_ende: string; tank_ende: string; schaeden_ende: string; notiz: string; ergebnis: string;
};
function ausZeile(z: Zeile): Entwurf {
  return {
    art: z.art, fahrer_name: z.fahrer_name ?? '', fahrer_anschrift: z.fahrer_anschrift ?? '', fahrer_tel: z.fahrer_tel ?? '', fahrer_email: z.fahrer_email ?? '',
    fs_geprueft: !!z.fs_geprueft, fs_klasse: z.fs_klasse ?? '', fs_gueltig_bis: z.fs_gueltig_bis ?? '', begleitet: !!z.begleitet,
    kennzeichen_art: z.kennzeichen_art, kennzeichen: z.kennzeichen ?? '', start_am: lokal(z.start_am), ende_geplant: lokal(z.ende_geplant),
    km_start: t(z.km_start), km_frei: t(z.km_frei), tank_start: z.tank_start ?? '', schaeden_start: z.schaeden_start ?? '', selbstbeteiligung: t(z.selbstbeteiligung),
    km_ende: t(z.km_ende), tank_ende: z.tank_ende ?? '', schaeden_ende: z.schaeden_ende ?? '', notiz: z.notiz ?? '', ergebnis: z.ergebnis ?? 'offen',
  };
}
function zuFeldern(e: Entwurf): Record<string, unknown> {
  const leer = (s: string, max: number) => (s.trim() ? s.trim().slice(0, max) : null);
  const eigen = e.kennzeichen_art === 'eigen';
  return {
    art: ARTEN.some((a) => a.key === e.art) ? e.art : 'probefahrt',
    fahrer_name: leer(e.fahrer_name, 120), fahrer_anschrift: leer(e.fahrer_anschrift, 300), fahrer_tel: leer(e.fahrer_tel, 40), fahrer_email: leer(e.fahrer_email, 160),
    fs_geprueft: e.fs_geprueft, fs_klasse: leer(e.fs_klasse, 20), fs_gueltig_bis: e.fs_gueltig_bis || null, begleitet: e.begleitet,
    kennzeichen_art: KZ_ARTEN.some((k) => k.key === e.kennzeichen_art) ? e.kennzeichen_art : 'eigen',
    kennzeichen: eigen ? leer(e.kennzeichen, 20) : (kzNorm(e.kennzeichen) || null),
    start_am: vonLokal(e.start_am), ende_geplant: vonLokal(e.ende_geplant),
    km_start: ganz(e.km_start), km_frei: ganz(e.km_frei), tank_start: (TANK as readonly string[]).includes(e.tank_start) ? e.tank_start : null,
    schaeden_start: leer(e.schaeden_start, 1000), selbstbeteiligung: betrag(e.selbstbeteiligung),
    km_ende: ganz(e.km_ende), tank_ende: (TANK as readonly string[]).includes(e.tank_ende) ? e.tank_ende : null, schaeden_ende: leer(e.schaeden_ende, 1000),
    notiz: leer(e.notiz, 2000), ergebnis: ERGEBNISSE.some((x) => x.key === e.ergebnis) ? e.ergebnis : null,
  };
}
function alsFahrt(z: Zeile, felder: Record<string, unknown>): Fahrt {
  return { ...z, ...(felder as Partial<Fahrt>) } as Fahrt;
}

export default function KfzProbefahrt({ f, onGeaendert }: { f: ProbefahrtFahrzeug; onGeaendert: () => void }) {
  const [istChef, setIstChef] = useState(false);
  const [liste, setListe] = useState<Zeile[]>([]);
  const [kz, setKz] = useState<RotesKz[]>([]);
  const [laufendAlle, setLaufendAlle] = useState<{ kennzeichen: string | null; kennzeichen_art: string; status: string }[]>([]);
  const [e, setE] = useState<Entwurf | null>(null);
  const [neuArt, setNeuArt] = useState('probefahrt');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fehlerListe, setFehlerListe] = useState<string[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [loeschFrage, setLoeschFrage] = useState(false);

  const aktiv = liste.find((x) => x.status === 'geplant' || x.status === 'unterwegs') ?? null;
  const offenerNachfass = liste.find((x) => x.status === 'zurueck' && !x.nachfass_erledigt && x.nachfass_am) ?? null;
  const fruehere = liste.filter((x) => x !== aktiv);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setIstChef(!!u?.user?.id && u.user.id === f.owner_user_id);
    const { data, error } = await supabase.from('kfz_probefahrt').select('*').eq('bestand_id', f.id).order('erstellt_am', { ascending: false });
    if (error) { setFehler('Fahrten lassen sich nicht laden. Ist SQL Paket 270 ausgeführt?'); return; }
    const zeilen = ((data as unknown) as Zeile[]) ?? [];
    setListe(zeilen);
    const a = zeilen.find((x) => x.status === 'geplant' || x.status === 'unterwegs') ?? null;
    setE(a ? ausZeile(a) : null);
    const [k, l] = await Promise.all([
      supabase.from('kfz_rote_kennzeichen').select('kennzeichen, art, gueltig_bis, aktiv').order('kennzeichen'),
      supabase.from('kfz_probefahrt').select('kennzeichen, kennzeichen_art, status').eq('status', 'unterwegs').limit(500),
    ]);
    setKz(((k.data as unknown) as RotesKz[]) ?? []);
    setLaufendAlle(((l.data as unknown) as { kennzeichen: string | null; kennzeichen_art: string; status: string }[]) ?? []);
  }, [f.id, f.owner_user_id]);

  useEffect(() => { void lade(); }, [lade]);

  function meld() { setFehler(null); setFehlerListe([]); setOk(null); setLink(null); }

  async function anlegen() {
    meld(); setBusy(true);
    try {
      for (let versuch = 0; versuch < 2; versuch++) {
        const { data: nrs } = await supabase.from('kfz_probefahrt').select('nr').limit(5000);
        const nr = naechsteFahrtNr((((nrs as unknown) as { nr: string | null }[]) ?? []).map((x) => x.nr));
        const start = new Date();
        const ende = new Date(start.getTime() + (neuArt === 'vorfuehrwagen' ? 2 * 86400000 : neuArt === 'ersatzwagen' ? 86400000 : 3600000));
        const { error } = await supabase.from('kfz_probefahrt').insert({
          owner_user_id: f.owner_user_id, bestand_id: f.id, nr, art: neuArt, status: 'geplant',
          km_start: f.fz.km_stand ?? null, start_am: start.toISOString(), ende_geplant: ende.toISOString(),
          begleitet: neuArt === 'probefahrt', fs_klasse: 'B',
        });
        if (!error) { setOk(`${artLabel(neuArt)} ${nr} angelegt.`); await lade(); return; }
        if (versuch === 1) { setFehler('Anlegen fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ" und ist SQL Paket 270 ausgeführt?'); return; }
      }
    } finally { setBusy(false); }
  }

  async function speichern(extra: Record<string, unknown> = {}, meldung = 'Gespeichert.'): Promise<boolean> {
    if (!aktiv || !e) return false;
    setBusy(true);
    try {
      const { error } = await supabase.from('kfz_probefahrt').update({ ...zuFeldern(e), ...extra, aktualisiert_am: jetztIso() }).eq('id', aktiv.id);
      if (error) {
        if (/kz_laufend/.test(error.message)) setFehler('Dieses Kennzeichen ist gerade an einer anderen laufenden Fahrt.');
        else if (/ein_laufender/.test(error.message)) setFehler('Mit diesem Fahrzeug läuft schon eine Fahrt.');
        else if (/km_check/.test(error.message)) setFehler('Der Kilometerstand bei Rückgabe liegt unter dem bei Übergabe.');
        else setFehler('Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ"?');
        return false;
      }
      setOk(meldung); await lade(); onGeaendert(); return true;
    } finally { setBusy(false); }
  }

  async function starten() {
    if (!aktiv || !e) return;
    meld();
    const felder = zuFeldern(e);
    const p = startPruefen(alsFahrt(aktiv, felder), f.fz, kz, heute());
    if (p.fehler.length) { setFehlerListe(p.fehler); return; }
    await speichern({ status: 'unterwegs', start_am: (felder.start_am as string | null) ?? jetztIso() }, 'Fahrzeug übergeben — die Fahrt läuft.' + (p.hinweise.length ? ' ' + p.hinweise.join(' ') : ''));
  }

  async function zuruecknehmen() {
    if (!aktiv || !e) return;
    meld();
    const felder = zuFeldern(e);
    const p = rueckgabePruefen(alsFahrt(aktiv, felder));
    if (p.fehler.length) { setFehlerListe(p.fehler); return; }
    const rueck = jetztIso();
    const nf = nachfassDatum(aktiv.art, rueck);
    const gut = await speichern({ status: 'zurueck', rueck_am: rueck, nachfass_am: nf, ergebnis: nf ? 'offen' : null },
      'Fahrzeug zurückgenommen.' + (p.hinweise.length ? ' ' + p.hinweise.join(' ') : '') + (nf ? ` Nachfass am ${nf.split('-').reverse().join('.')}.` : ''));
    if (!gut) return;
    // Kilometerstand in der Akte nachziehen (nur nach oben)
    const kmEnde = felder.km_ende as number | null;
    if (kmEnde !== null && (f.fz.km_stand === null || kmEnde > f.fz.km_stand)) {
      await supabase.from('kfz_bestand').update({ km_stand: kmEnde, aktualisiert_am: jetztIso() }).eq('id', f.id);
    }
    // Nachfass als Erinnerung (Modul „Erinnerungen", Kanal Telefon) — fehlt das Recht, bleibt er hier und unter „Probefahrten" sichtbar
    if (nf) {
      try {
        await supabase.from('erinnerung').insert({
          owner_user_id: f.owner_user_id, titel: `Nachfass ${artLabel(aktiv.art)} ${aktiv.nr ?? ''} · ${[f.fz.marke, f.fz.modell].filter(Boolean).join(' ')}`.trim().slice(0, 200),
          bezug_typ: 'frei', kanal: 'telefon', status: 'offen', faellig_am: `${nf}T09:00`,
          kunde_name: (felder.fahrer_name as string | null) ?? aktiv.fahrer_name ?? null,
          email: (felder.fahrer_email as string | null) ?? null,
          notiz: `${(felder.fahrer_tel as string | null) ? `Telefon ${felder.fahrer_tel as string}. ` : ''}Eindruck abfragen, Angebot oder Finanzierung anbieten.`,
        });
      } catch { /* Erinnerung optional */ }
    }
    onGeaendert();
  }

  async function stornieren() {
    if (!aktiv || aktiv.status !== 'geplant') return;
    meld();
    await speichern({ status: 'storniert' }, 'Fahrt storniert.');
  }

  async function nachfassAbschliessen(z: Zeile, ergebnis: string) {
    meld(); setBusy(true);
    try {
      const { error } = await supabase.from('kfz_probefahrt').update({ nachfass_erledigt: true, ergebnis, aktualisiert_am: jetztIso() }).eq('id', z.id);
      if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setOk('Nachfass erledigt.'); await lade();
    } finally { setBusy(false); }
  }

  async function firmaHolen(): Promise<Firmenkopf | null> {
    try {
      const r = await fetch('/api/betrieb-firmendaten', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = (await r.json()) as { firma?: Record<string, string | null> };
      const x = j.firma ?? {};
      return { name: x.firma_name ?? null, strasse: x.firma_strasse ?? null, plz: x.firma_plz ?? null, ort: x.firma_ort ?? null, telefon: x.firma_telefon ?? null, email: x.firma_email ?? null };
    } catch { return null; }
  }

  async function drucken(z: Zeile, art: FahrtDok) {
    meld();
    const firma = await firmaHolen();
    verkaufPdf(fahrtDokument(art, z, f.fz, firma, heute()), fahrtDateiName(art, z.nr));
    if (!firma?.name) setOk('PDF erstellt. Ihre Firmendaten fehlen darin (Einstellungen → Firmendaten).');
  }

  async function zurUnterschrift(z: Zeile, art: FahrtDok) {
    meld(); setBusy(true);
    try {
      const firma = await firmaHolen();
      const d = fahrtDokument(art, z, f.fz, firma, heute());
      const s = await signaturStarten(supabase, f.owner_user_id, {
        titel: `${d.titel} ${z.nr ?? ''}`.trim(), empfaenger_name: z.fahrer_name, empfaenger_email: z.fahrer_email,
        dokument: alsText(d), aufbewahrung_jahre: 6,
      });
      if (!s.ok || !s.token) { setFehler('Die Unterschrifts-Anfrage ließ sich nicht anlegen.'); return; }
      await supabase.from('kfz_probefahrt').update({ signaturen: { ...(z.signaturen ?? {}), [art]: s.token }, aktualisiert_am: jetztIso() }).eq('id', z.id);
      try { await navigator.clipboard.writeText(s.link || ''); } catch { /* egal */ }
      setLink(s.link || null);
      setOk('Unterschrifts-Link erstellt und kopiert — am Tablet öffnen oder dem Fahrer schicken.');
      await lade();
    } finally { setBusy(false); }
  }

  async function loeschen() {
    if (!aktiv || !istChef || aktiv.status !== 'geplant') return;
    setLoeschFrage(false); meld(); setBusy(true);
    try {
      const { error } = await supabase.from('kfz_probefahrt').delete().eq('id', aktiv.id);
      if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
      setOk('Fahrt gelöscht.'); await lade();
    } finally { setBusy(false); }
  }

  const freieKz = freieKennzeichen(kz, laufendAlle, heute());
  const kzAuswahl = e ? kz.filter((k) => k.art === e.kennzeichen_art && (freieKz.includes(k) || kzNorm(k.kennzeichen) === kzNorm(e.kennzeichen))) : [];
  const setz = (teil: Partial<Entwurf>) => setE((alt) => (alt ? { ...alt, ...teil } : alt));
  const unterwegs = aktiv?.status === 'unterwegs';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {fehler && <div style={s.fehler}>{fehler}</div>}
      {fehlerListe.length > 0 && <div style={s.fehler}><b>Vorher noch ergänzen:</b>{fehlerListe.map((x) => <div key={x}>• {x}</div>)}</div>}
      {ok && <div style={s.ok}>{ok}{link && <div style={{ ...s.mono, marginTop: 6, wordBreak: 'break-all' }}>{link}</div>}</div>}

      {offenerNachfass && (
        <div style={{ ...s.karte, borderColor: nachfassFaellig(offenerNachfass, heute()) ? C.warn : C.border }}>
          <h3 style={s.h3}>Nachfass {offenerNachfass.nr} · {offenerNachfass.fahrer_name ?? '—'}</h3>
          <div style={s.dim}>{artLabel(offenerNachfass.art)} zurück am {de(offenerNachfass.rueck_am)} · Nachfass {nachfassFaellig(offenerNachfass, heute()) ? 'ist fällig' : `am ${String(offenerNachfass.nachfass_am).split('-').reverse().join('.')}`}{offenerNachfass.fahrer_tel ? ` · ☎ ${offenerNachfass.fahrer_tel}` : ''}</div>
          <div style={{ ...s.reihe, marginTop: 8 }}>
            {ERGEBNISSE.filter((x) => x.key !== 'offen').map((x) => <button key={x.key} style={s.btn} disabled={busy} onClick={() => void nachfassAbschliessen(offenerNachfass, x.key)}>✓ {x.label}</button>)}
          </div>
        </div>
      )}

      {!aktiv && (
        <div style={s.karte}>
          <h3 style={s.h3}>Neue Fahrt</h3>
          <div style={{ ...s.reihe, marginBottom: 8 }}>
            {ARTEN.map((a) => <button key={a.key} title={a.text} style={{ ...s.chip, ...(neuArt === a.key ? { borderColor: C.gold, color: C.gold } : {}) }} onClick={() => setNeuArt(a.key)}>{a.label}</button>)}
          </div>
          <div style={s.dim}>{ARTEN.find((a) => a.key === neuArt)?.text}</div>
          <button style={{ ...s.gold, marginTop: 10 }} disabled={busy} onClick={() => void anlegen()}>＋ {artLabel(neuArt)} anlegen</button>
        </div>
      )}

      {aktiv && e && (
        <>
          <div style={s.karte}>
            <div style={{ ...s.reihe, justifyContent: 'space-between' }}>
              <h3 style={{ ...s.h3, margin: 0 }}>{artLabel(aktiv.art)} {aktiv.nr ?? ''} <span style={{ ...s.pill, color: unterwegs ? (ueberfaellig(aktiv, jetztIso()) ? C.bad : C.info) : C.dim, marginLeft: 6 }}>{unterwegs ? (ueberfaellig(aktiv, jetztIso()) ? 'überfällig' : 'unterwegs') : 'geplant'}</span></h3>
              <div style={s.reihe}>
                {!unterwegs && <button style={s.gold} disabled={busy} onClick={() => void starten()}>▶ Übergeben</button>}
                {unterwegs && <button style={s.gold} disabled={busy} onClick={() => void zuruecknehmen()}>■ Zurücknehmen</button>}
                {!unterwegs && <button style={s.btnRot} disabled={busy} onClick={() => void stornieren()}>✕ Stornieren</button>}
              </div>
            </div>
          </div>

          <div style={s.raster}>
            <div style={s.karte}>
              <h3 style={s.h3}>Fahrer</h3>
              <div style={s.feldRaster}>
                <label style={s.lab}>Name<input style={s.inp} value={e.fahrer_name} disabled={unterwegs} onChange={(x) => setz({ fahrer_name: x.target.value })} /></label>
                <label style={s.lab}>Telefon<input style={s.inp} value={e.fahrer_tel} onChange={(x) => setz({ fahrer_tel: x.target.value })} /></label>
                <label style={s.lab}>E-Mail<input style={s.inp} value={e.fahrer_email} onChange={(x) => setz({ fahrer_email: x.target.value })} /></label>
              </div>
              <label style={{ ...s.lab, marginTop: 10 }}>Anschrift<textarea style={{ ...s.inp, minHeight: 54 }} value={e.fahrer_anschrift} disabled={unterwegs} onChange={(x) => setz({ fahrer_anschrift: x.target.value })} /></label>
              <div style={{ ...s.tag, marginTop: 12 }}>Führerschein</div>
              <label style={s.haken}><input type="checkbox" checked={e.fs_geprueft} disabled={unterwegs} onChange={(x) => setz({ fs_geprueft: x.target.checked })} /> Führerschein im Original vorgelegt und geprüft</label>
              <div style={{ ...s.feldRaster, marginTop: 8 }}>
                <label style={s.lab}>Klasse<input style={s.inp} value={e.fs_klasse} disabled={unterwegs} onChange={(x) => setz({ fs_klasse: x.target.value })} /></label>
                <label style={s.lab}>Gültig bis (falls befristet)<input type="date" style={s.inp} value={e.fs_gueltig_bis} disabled={unterwegs} onChange={(x) => setz({ fs_gueltig_bis: x.target.value })} /></label>
              </div>
              <div style={{ ...s.dim, marginTop: 6 }}>Die Führerscheinnummer wird bewusst nicht gespeichert.</div>
              {e.art === 'probefahrt' && <label style={{ ...s.haken, marginTop: 8 }}><input type="checkbox" checked={e.begleitet} disabled={unterwegs} onChange={(x) => setz({ begleitet: x.target.checked })} /> Begleitet (Verkäufer fährt mit)</label>}
            </div>

            <div style={s.karte}>
              <h3 style={s.h3}>Kennzeichen und Zeit</h3>
              <div style={{ ...s.reihe, marginBottom: 8 }}>
                {KZ_ARTEN.map((k) => <button key={k.key} disabled={unterwegs} style={{ ...s.chip, ...(e.kennzeichen_art === k.key ? { borderColor: C.gold, color: C.gold } : {}) }} onClick={() => setz({ kennzeichen_art: k.key, kennzeichen: k.key === 'eigen' ? (f.fz.kennzeichen ?? '') : '' })}>{k.label}</button>)}
              </div>
              {e.kennzeichen_art === 'eigen'
                ? <label style={s.lab}>Kennzeichen<input style={s.inp} value={e.kennzeichen || f.fz.kennzeichen || ''} disabled={unterwegs} onChange={(x) => setz({ kennzeichen: x.target.value })} /></label>
                : (
                  <label style={s.lab}>{e.kennzeichen_art === 'rot' ? 'Rotes Kennzeichen' : 'Kurzzeitkennzeichen'}
                    <select style={s.inp} value={kzNorm(e.kennzeichen)} disabled={unterwegs} onChange={(x) => setz({ kennzeichen: x.target.value })}>
                      <option value="">— wählen —</option>
                      {kzAuswahl.map((k) => <option key={k.kennzeichen} value={kzNorm(k.kennzeichen)}>{kzNorm(k.kennzeichen)}{k.gueltig_bis ? ` (bis ${k.gueltig_bis.split('-').reverse().join('.')})` : ''}</option>)}
                    </select>
                    {kzAuswahl.length === 0 && <span style={s.dim}>Kein freies Kennzeichen. Die Geschäftsleitung hinterlegt sie unter „Probefahrten".</span>}
                  </label>
                )}
              <div style={{ ...s.feldRaster, marginTop: 10 }}>
                <label style={s.lab}>Übergabe<input type="datetime-local" style={s.inp} value={e.start_am} disabled={unterwegs} onChange={(x) => setz({ start_am: x.target.value })} /></label>
                <label style={s.lab}>Rückgabe spätestens<input type="datetime-local" style={s.inp} value={e.ende_geplant} onChange={(x) => setz({ ende_geplant: x.target.value })} /></label>
              </div>
            </div>

            <div style={s.karte}>
              <h3 style={s.h3}>Übergabe</h3>
              <div style={s.feldRaster}>
                <label style={s.lab}>km bei Übergabe<input style={s.inp} inputMode="numeric" value={e.km_start} disabled={unterwegs} onChange={(x) => setz({ km_start: x.target.value })} /></label>
                <label style={s.lab}>Tank<select style={s.inp} value={e.tank_start} disabled={unterwegs} onChange={(x) => setz({ tank_start: x.target.value })}><option value="">—</option>{TANK.map((x) => <option key={x}>{x}</option>)}</select></label>
                {e.art !== 'ueberfuehrung' && <label style={s.lab}>Freie km (optional)<input style={s.inp} inputMode="numeric" value={e.km_frei} disabled={unterwegs} onChange={(x) => setz({ km_frei: x.target.value })} /></label>}
                {e.art !== 'ueberfuehrung' && <label style={s.lab}>Selbstbeteiligung Ihrer Versicherung €<input style={s.inp} inputMode="decimal" value={e.selbstbeteiligung} disabled={unterwegs} onChange={(x) => setz({ selbstbeteiligung: x.target.value })} /></label>}
              </div>
              <label style={{ ...s.lab, marginTop: 10 }}>Vorhandene Schäden<textarea style={{ ...s.inp, minHeight: 54 }} value={e.schaeden_start} disabled={unterwegs} onChange={(x) => setz({ schaeden_start: x.target.value })} /></label>
            </div>

            {unterwegs && (
              <div style={{ ...s.karte, borderColor: C.gold }}>
                <h3 style={s.h3}>Rückgabe</h3>
                <div style={s.feldRaster}>
                  <label style={s.lab}>km bei Rückgabe<input style={s.inp} inputMode="numeric" value={e.km_ende} onChange={(x) => setz({ km_ende: x.target.value })} /></label>
                  <label style={s.lab}>Tank<select style={s.inp} value={e.tank_ende} onChange={(x) => setz({ tank_ende: x.target.value })}><option value="">—</option>{TANK.map((x) => <option key={x}>{x}</option>)}</select></label>
                </div>
                <label style={{ ...s.lab, marginTop: 10 }}>Neue Schäden<textarea style={{ ...s.inp, minHeight: 54 }} value={e.schaeden_ende} onChange={(x) => setz({ schaeden_ende: x.target.value })} /></label>
                {ganz(e.km_ende) !== null && ganz(e.km_start) !== null && <div style={{ ...s.dim, marginTop: 6 }}>Gefahren: {(gefahren({ km_start: ganz(e.km_start), km_ende: ganz(e.km_ende) }) ?? 0).toLocaleString('de-DE')} km{mehrKm({ km_start: ganz(e.km_start), km_ende: ganz(e.km_ende), km_frei: ganz(e.km_frei) }) > 0 ? ` · ${mehrKm({ km_start: ganz(e.km_start), km_ende: ganz(e.km_ende), km_frei: ganz(e.km_frei) }).toLocaleString('de-DE')} km über den freien` : ''}</div>}
              </div>
            )}
          </div>

          <label style={s.lab}>Notiz<textarea style={{ ...s.inp, minHeight: 44 }} value={e.notiz} onChange={(x) => setz({ notiz: x.target.value })} /></label>
          <div><button style={s.gold} disabled={busy} onClick={() => void speichern()}>💾 Speichern</button></div>

          <div style={s.karte}>
            <h3 style={s.h3}>Unterlagen</h3>
            <div style={{ ...s.dim, marginBottom: 8 }}>Die Unterlagen nutzen den <b>gespeicherten</b> Stand. Texte sind Vorlagen von ARGONAUT — bitte vor dem ersten Einsatz von Ihrem Anwalt prüfen lassen.</div>
            <div style={s.dokZeile}>
              <span style={{ fontWeight: 700, flex: 1 }}>{FAHRT_DOKS[0].label}</span>
              <button style={s.btn} onClick={() => void drucken(aktiv, 'vereinbarung')}>🖨 PDF</button>
              <button style={s.btn} disabled={busy} onClick={() => void zurUnterschrift(aktiv, 'vereinbarung')}>✍ Unterschrift</button>
            </div>
          </div>

          {istChef && aktiv.status === 'geplant' && (
            <div>{!loeschFrage ? <button style={s.btnRot} onClick={() => setLoeschFrage(true)}>🗑 Fahrt löschen</button> : (
              <div style={s.frage}>Fahrt {aktiv.nr} wirklich löschen?
                <div style={{ ...s.reihe, marginTop: 8 }}><button style={s.btnRot} disabled={busy} onClick={() => void loeschen()}>Ja, löschen</button><button style={s.btn} onClick={() => setLoeschFrage(false)}>Abbrechen</button></div>
              </div>
            )}</div>
          )}
        </>
      )}

      {fruehere.length > 0 && (
        <div style={s.karte}>
          <h3 style={s.h3}>Frühere Fahrten</h3>
          <table style={s.tab}><tbody>
            {fruehere.map((z) => (
              <tr key={z.id}>
                <td style={s.td}>{z.nr ?? '—'} · {artLabel(z.art)}</td>
                <td style={s.td}>{z.fahrer_name ?? '—'}</td>
                <td style={s.td}>{de(z.start_am)}</td>
                <td style={s.tdR}>{gefahren(z) === null ? '' : `${(gefahren(z) as number).toLocaleString('de-DE')} km`}</td>
                <td style={s.td}>{z.status === 'storniert' ? 'storniert' : ERGEBNISSE.find((x) => x.key === z.ergebnis)?.label ?? ''}</td>
                <td style={s.tdR}>{z.status === 'zurueck' && <><button style={s.btnKlein} onClick={() => void drucken(z, 'rueckgabe')}>🖨 Rückgabe</button> <button style={s.btnKlein} disabled={busy} onClick={() => void zurUnterschrift(z, 'rueckgabe')}>✍</button></>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  h3: { margin: '0 0 10px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 13 },
  mono: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  btn: { background: C.navy2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  btnKlein: { background: C.navy2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  btnRot: { background: 'transparent', border: `1px solid ${C.bad}`, color: C.bad, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  chip: { border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, borderRadius: 999, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer' },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px' },
  frage: { background: C.navy3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 },
  feldRaster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  tag: { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim, fontWeight: 700, marginBottom: 6 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 },
  tab: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 },
  tdR: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5, textAlign: 'right', whiteSpace: 'nowrap' },
  dokZeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0' },
};
