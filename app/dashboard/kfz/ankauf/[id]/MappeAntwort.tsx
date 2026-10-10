'use client';

// ============================================================
// ARGONAUT OS · Paket 306 · FM2 — Fahrzeugmappe: Händler entscheidet
// Teil der Karte „📁 Fahrzeugmappe" in der Ankaufsakte:
//  1. Fahrzeughistorie: FIN kopieren, carVertical im eigenen Konto öffnen,
//     Bericht-Link einfügen, Befund ankreuzen (km, Unfall, Diebstahl) -> Ampel.
//     Der automatische Abruf per Knopf kommt mit K19 (Partner-Vertrag).
//  2. Antwort: Angebot unter Vorbehalt (fester Vorbehaltstext), Einladung zur
//     Besichtigung, Rückfrage (Verkäufer reicht 14 Tage nach), Absage.
//     Gespeichert mit dem Login der Person; die Datenbank zieht den Ankauf nach.
//  3. Verlauf mit beiden Seiten.
// ============================================================

import { useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  BEFUND_PUNKTE, BEFUND_WERTE, HAENDLER_ARTEN, VORBEHALT_TEXT, befundAmpel, befundBereinigen, nachrichtInhalt, tagText, type HaendlerArt,
} from '@/lib/fahrzeugMappeAntwort';
import { berichtUrlGueltig, partner } from '@/lib/partnerAnbindung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);
const C = { navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const TON: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, dim: C.dim };

export type Verlauf = { id: string; von: string; art: string; text: string | null; betrag: number | null; gueltig_bis: string | null; termin: string | null; erstellt_am: string };
export type AnkaufInfo = { fin: string | null; hat_email: boolean; historie_url: string | null; historie_anbieter: string | null; historie_am: string | null; historie_befund: unknown };

function zeit(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function inTagen(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 10);
}

export default function MappeAntwort({ ankaufId, ankauf, verlauf, nachreichenBis, firma, onNeu }: {
  ankaufId: string; ankauf: AnkaufInfo | null; verlauf: Verlauf[]; nachreichenBis: string | null; firma: string; onNeu: () => void;
}) {
  const cv = partner('carvertical');
  const [url, setUrl] = useState(ankauf?.historie_url ?? '');
  const [befund, setBefund] = useState<Record<string, string>>(befundBereinigen(ankauf?.historie_befund));
  const [hOk, setHOk] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [art, setArt] = useState<HaendlerArt | null>(null);
  const [f, setF] = useState({ text: '', betrag: '', gueltig_bis: inTagen(7), tag: inTagen(2), uhr: '10:00' });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function historieSpeichern() {
    setFehler(null); setHOk(null);
    const u = url.trim();
    if (u && !berichtUrlGueltig(u)) { setFehler('Bitte den vollständigen Link zum Bericht einfügen (beginnt mit https://).'); return; }
    setBusy(true);
    const { error } = await supabase.from('kfz_ankauf').update({
      historie_url: u || null, historie_anbieter: u ? (/carvertical\./i.test(u) ? 'carvertical' : 'sonstige') : null,
      historie_am: u ? new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 10) : null,
      historie_befund: befundBereinigen(befund), aktualisiert_am: new Date().toISOString(),
    }).eq('id', ankaufId).select('id');
    setBusy(false);
    if (error) { setFehler('Die Fahrzeughistorie ließ sich nicht speichern (Schreibrecht „KFZ“ nötig).'); return; }
    setHOk('Gespeichert.');
  }

  async function senden() {
    if (!art) return;
    setFehler(null); setOk(null); setBusy(true);
    try {
      const r = await fetch('/api/kfz/fahrzeugmappe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ankauf: ankaufId, art, ...f }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler(j.error || 'Die Antwort konnte nicht gesendet werden.'); return; }
      setOk(j.mail ? 'Gesendet — der Verkäufer hat eine E-Mail mit Knopf zu seiner Mappe bekommen.' : 'Im Verlauf gespeichert. Eine E-Mail ging nicht raus (keine Adresse) — bitte den Verkäufer anrufen.');
      setArt(null); setF({ ...f, text: '', betrag: '' });
      onNeu();
    } catch { setFehler('Keine Verbindung. Bitte erneut versuchen.'); }
    finally { setBusy(false); }
  }

  const ampel = befundAmpel(befund);
  const offenBis = nachreichenBis && Date.parse(nachreichenBis) > Date.now() ? nachreichenBis : null;

  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
      {/* 1) Fahrzeughistorie */}
      <div style={s.teil}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={s.h4}>🔎 Fahrzeughistorie</div>
          <span style={{ ...s.pill, color: TON[ampel] }}>{ampel === 'ok' ? 'unauffällig' : ampel === 'warn' ? 'auffällig' : ampel === 'bad' ? 'kritisch' : 'noch nicht geprüft'}</span>
        </div>
        <div style={s.reihe}>
          <span style={s.dim}>FIN: <b style={{ color: C.text, fontFamily: 'ui-monospace, monospace' }}>{ankauf?.fin || 'nicht angegeben — aus dem Fahrzeugschein-Foto übernehmen'}</b></span>
          {ankauf?.fin && <button style={s.btn} onClick={() => { void navigator.clipboard?.writeText(ankauf.fin as string).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 1600); }); }}>{kopiert ? '✓ Kopiert' : '📋 FIN kopieren'}</button>}
          {cv?.einzelUrl && <a href={cv.einzelUrl} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: 'none' }}>carVertical öffnen ↗</a>}
          {cv && <a href={cv.abschlussUrl} target="_blank" rel="noopener noreferrer" style={{ ...s.link }}>Noch kein Händlerkonto?</a>}
        </div>
        <label style={s.lab}>Link zum Bericht
          <input style={s.inp} value={url} placeholder="https://www.carvertical.com/…" onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          {BEFUND_PUNKTE.map((p) => (
            <label key={p.key} style={s.lab}>{p.label}
              <select style={{ ...s.inp, color: TON[BEFUND_WERTE.find((w) => w.key === befund[p.key])?.ton ?? 'dim'] }} value={befund[p.key] ?? 'offen'} onChange={(e) => setBefund({ ...befund, [p.key]: e.target.value })}>
                {BEFUND_WERTE.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <label style={s.lab}>Notiz zum Bericht
          <input style={s.inp} maxLength={300} value={befund.notiz ?? ''} onChange={(e) => setBefund({ ...befund, notiz: e.target.value })} placeholder="z. B. Hagelschaden 2022 repariert, km-Sprung nicht erkennbar" />
        </label>
        <div style={s.reihe}>
          <button style={{ ...s.btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void historieSpeichern()}>💾 Historie speichern</button>
          {hOk && <span style={{ color: C.ok, fontSize: 13 }}>{hOk}</span>}
          {ankauf?.historie_am && <span style={s.dim}>zuletzt {tagText(ankauf.historie_am)}</span>}
        </div>
        <div style={s.dim}>Den Bericht kaufen Sie über Ihr eigenes carVertical-Konto. Der Abruf per Knopf direkt hier kommt, sobald die Partner-Schnittstelle freigeschaltet ist.</div>
      </div>

      {/* 2) Antwort */}
      <div style={s.teil}>
        <div style={s.h4}>✉ Antwort an den Verkäufer</div>
        {!ankauf?.hat_email && <div style={{ ...s.dim, color: C.warn }}>Der Verkäufer hat keine E-Mail angegeben. Antworten stehen trotzdem im Verlauf und unter seinem Link — bitte zusätzlich anrufen.</div>}
        {offenBis && <div style={{ ...s.dim, color: C.info }}>Rückfrage offen: Der Verkäufer kann bis {zeit(offenBis)} Uhr Dateien nachreichen.</div>}
        <div style={s.reihe}>
          {HAENDLER_ARTEN.map((a) => (
            <button key={a.key} style={{ ...s.btn, ...(art === a.key ? { borderColor: C.gold, color: C.gold } : {}), ...(a.key === 'absage' ? { color: art === a.key ? C.bad : C.text } : {}) }} onClick={() => { setArt(art === a.key ? null : a.key); setFehler(null); setOk(null); }}>{a.symbol} {a.label}</button>
          ))}
        </div>
        {art && (
          <div style={{ display: 'grid', gap: 8 }}>
            {art === 'angebot' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                <label style={s.lab}>Betrag (€)<input style={s.inp} inputMode="decimal" value={f.betrag} onChange={(e) => setF({ ...f, betrag: e.target.value })} placeholder="z. B. 13.800" /></label>
                <label style={s.lab}>Gültig bis<input style={s.inp} type="date" value={f.gueltig_bis} onChange={(e) => setF({ ...f, gueltig_bis: e.target.value })} /></label>
              </div>
            )}
            {art === 'einladung' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                <label style={s.lab}>Datum<input style={s.inp} type="date" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} /></label>
                <label style={s.lab}>Uhrzeit<input style={s.inp} type="time" value={f.uhr} onChange={(e) => setF({ ...f, uhr: e.target.value })} /></label>
              </div>
            )}
            <label style={s.lab}>{art === 'rueckfrage' ? 'Was soll der Verkäufer nachreichen oder beantworten?' : 'Nachricht (freiwillig)'}
              <textarea style={{ ...s.inp, minHeight: 70 }} maxLength={1500} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })}
                placeholder={art === 'rueckfrage' ? 'z. B. Bitte noch ein Foto vom Unterboden und vom Reserverad.' : art === 'absage' ? 'z. B. Das Fahrzeug passt leider nicht in unser Programm.' : ''} />
            </label>
            {art === 'angebot' && <div style={{ ...s.dim, borderLeft: `3px solid ${C.gold}`, paddingLeft: 10 }}>Steht immer dabei: „{VORBEHALT_TEXT}“</div>}
            {art === 'absage' && <div style={s.dim}>Der Ankauf wird auf „Nicht angekauft“ gesetzt. Fotos und Unterlagen werden nach 90 Tagen automatisch gelöscht.</div>}
            <div style={s.reihe}>
              <button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void senden()}>{busy ? 'Wird gesendet …' : 'Senden'}</button>
              <button style={s.btn} onClick={() => setArt(null)}>Abbrechen</button>
            </div>
          </div>
        )}
        {fehler && <div style={{ color: C.bad, fontSize: 13.5 }} role="alert">{fehler}</div>}
        {ok && <div style={{ color: C.ok, fontSize: 13.5 }} role="status">{ok}</div>}
      </div>

      {/* 3) Verlauf */}
      {verlauf.length > 0 && (
        <div style={s.teil}>
          <div style={s.h4}>🗂 Verlauf</div>
          {verlauf.map((n) => {
            const i = nachrichtInhalt(n, firma);
            const kunde = n.von === 'kunde';
            return (
              <div key={n.id} style={{ borderLeft: `3px solid ${kunde ? C.info : C.gold}`, paddingLeft: 10, display: 'grid', gap: 2 }}>
                <div style={{ fontSize: 12, color: C.dim }}>{kunde ? 'Verkäufer' : 'Sie'} · {zeit(n.erstellt_am)}</div>
                <div style={{ fontWeight: 700, color: C.text }}>{i.titel}</div>
                {i.zeilen.filter((z) => z !== VORBEHALT_TEXT).map((z, k) => <div key={k} style={{ fontSize: 13.5, color: C.text, whiteSpace: 'pre-wrap' }}>{z}</div>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  teil: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 8 },
  h4: { fontWeight: 800, fontSize: 14.5, color: C.text },
  dim: { color: C.dim, fontSize: 12.5, lineHeight: 1.5 },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  pill: { border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0, fontFamily: 'inherit' },
  btn: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13.5 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 13.5 },
  link: { color: C.gold, fontSize: 12.5 },
};
