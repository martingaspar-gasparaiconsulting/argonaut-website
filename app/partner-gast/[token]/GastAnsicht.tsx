'use client';

// ============================================================
// ARGONAUT OS · Paket 279 · K18b Ansicht für den Gast (Partner ohne ARGONAUT)
// Auftrag, Fahrzeug (Positivliste), annehmen/ablehnen/fertig melden, Einträge mit
// Fotos (nicht änderbar), Rechnung einreichen. Alles über die Gast-Tür.
// ============================================================

import { useCallback, useEffect, useState, CSSProperties } from 'react';
import { artName } from '@/lib/netzwerk';
import { aktionen, fahrzeugZeilen, grundPruefen, statusName, type Aktion, type PartnerFahrzeug } from '@/lib/partnerNetzwerk';
import PartnerVerlauf, { type VerlaufEintrag } from '../../dashboard/kfz/partner/PartnerVerlauf';
import RechnungEinreichen, { type EingereichteRechnung } from '../../dashboard/kfz/partner/RechnungEinreichen';

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', bad: '#E06666' };
const TUER = '/api/oeffentlich/partner-gast';

type Auftrag = {
  id: string; nummer: string; titel: string; beschreibung: string | null; faellig_am: string | null; status: string; status_grund: string | null;
  fahrzeug_titel: string | null; bezug_typ?: string; bezug_titel?: string | null; aktiv: boolean; auftraggeber: string; gast_name: string; gast_bis: string;
  fahrzeug?: PartnerFahrzeug; fotos?: string[]; eintraege?: VerlaufEintrag[]; rechnung_erlaubt: boolean; rechnungen: EingereichteRechnung[];
};

function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }

export default function GastAnsicht({ token }: { token: string }) {
  const [a, setA] = useState<Auftrag | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [grund, setGrund] = useState<{ aktion: Aktion; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const lade = useCallback(async () => {
    if (!token) { setFehler('Der Link ist ungültig oder abgelaufen.'); return; }
    const r = await fetch(`${TUER}?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setFehler(j?.error || 'Der Link ist ungültig oder abgelaufen.'); setA(null); return; }
    setFehler(null); setA(j as Auftrag);
  }, [token]);

  useEffect(() => { void lade(); }, [lade]);

  async function status(akt: Aktion, text: string) {
    const g = grundPruefen(akt, text);
    if (!g.ok) { setMeldung({ ok: false, text: g.fehler }); return; }
    if (akt.rueckfrage && !window.confirm(akt.rueckfrage)) return;
    setBusy(true); setMeldung(null);
    const r = await fetch(TUER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, aktion: 'status', neu: akt.neu, grund: g.grund }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMeldung({ ok: false, text: j?.error || 'Das hat nicht geklappt.' }); return; }
    setGrund(null); setMeldung({ ok: true, text: statusName(akt.neu) });
    await lade();
  }

  if (fehler) return <main style={s.seite}><div style={s.karte}><h1 style={s.h1}>Partner-Auftrag</h1><p style={{ color: C.dim }}>{fehler}</p><p style={s.dim}>Bitte wenden Sie sich an den Betrieb, der Ihnen den Link geschickt hat.</p></div></main>;
  if (!a) return <main style={s.seite}><div style={s.karte}>Lädt …</div></main>;

  return (
    <main style={s.seite}>
      <div style={s.karte}>
        <div style={s.dim}>Auftrag von <b style={{ color: C.text }}>{a.auftraggeber}</b> · für {a.gast_name} · Link gültig bis {de(a.gast_bis)}</div>
        <h1 style={s.h1}>{a.nummer} · {a.titel}</h1>
        <div style={s.dim}>{(a.bezug_typ ?? 'kfz_bestand') === 'kfz_bestand' ? (a.fahrzeug_titel || 'Fahrzeug') : `${artName(a.bezug_typ)} · ${a.bezug_titel || 'ohne Titel'}`} · fertig bis {de(a.faellig_am)} · <b style={{ color: C.gold }}>{statusName(a.status)}</b></div>
        {a.beschreibung && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 10 }}>{a.beschreibung}</div>}
        {a.status_grund && <div style={{ ...s.dim, marginTop: 6 }}>Grund: {a.status_grund}</div>}

        {a.aktiv ? (
          <>
            {a.fahrzeug && <div style={s.tabelle}>
              {fahrzeugZeilen(a.fahrzeug).map(([x, y]) => <div key={x} style={{ display: 'contents' }}><span style={s.dim}>{x}</span><span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{y}</span></div>)}
            </div>}
            {(a.fotos ?? []).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {(a.fotos ?? []).map((m) => (
                  <a key={m} href={`${TUER}/bild?t=${token}&m=${m}`} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${TUER}/bild?t=${token}&m=${m}`} alt="Fahrzeugfoto" style={s.bild} loading="lazy" referrerPolicy="no-referrer" />
                  </a>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {aktionen('partner', a.status, true).map((akt) => (
                <button key={akt.neu} style={akt.neu === 'abgelehnt' ? s.aus : s.gold} disabled={busy}
                  onClick={() => (akt.grund === 'nein' ? void status(akt, '') : setGrund({ aktion: akt, text: '' }))}>{akt.text}</button>
              ))}
            </div>
            {grund && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <input style={{ ...s.inp, flex: '1 1 220px' }} value={grund.text} maxLength={300} placeholder={grund.aktion.grund === 'pflicht' ? 'Grund (Pflicht)' : 'Notiz (optional)'} onChange={(e) => setGrund({ ...grund, text: e.target.value })} />
                <button style={s.gold} disabled={busy} onClick={() => void status(grund.aktion, grund.text)}>{grund.aktion.text}</button>
                <button style={s.aus} onClick={() => setGrund(null)}>Abbrechen</button>
              </div>
            )}
            {meldung && <div style={{ marginTop: 8, fontSize: 13.5, color: meldung.ok ? C.ok : C.bad }}>{meldung.text}</div>}
            <PartnerVerlauf auftragId={a.id} eintraege={a.eintraege ?? []} eigeneSeite="partner" darfSchreiben onNeu={() => void lade()}
              gast={{
                bildUrl: (e, i) => `${TUER}/bild?t=${token}&e=${e}&i=${i}`,
                hochladen: async (datei, name) => {
                  const fd = new FormData();
                  fd.append('t', token); fd.append('aktion', 'foto'); fd.append('datei', datei, name);
                  const r = await fetch(TUER, { method: 'POST', body: fd });
                  const j = await r.json().catch(() => ({}));
                  if (!r.ok || typeof j?.pfad !== 'string') throw new Error(j?.error || 'Foto konnte nicht hochgeladen werden.');
                  return j.pfad as string;
                },
                speichern: async (text, pfade) => {
                  const r = await fetch(TUER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, aktion: 'eintrag', text, fotos: pfade }) });
                  const j = await r.json().catch(() => ({}));
                  if (!r.ok) throw new Error(j?.error || 'Eintrag konnte nicht gespeichert werden.');
                },
              }} />
          </>
        ) : (
          <div style={{ ...s.dim, marginTop: 10 }}>Dieser Auftrag ist abgeschlossen. Fahrzeugdaten und Verlauf sind nicht mehr sichtbar.</div>
        )}

        {(a.rechnung_erlaubt || a.rechnungen.length > 0) && (
          <RechnungEinreichen rechnungen={a.rechnungen} erlaubt={a.rechnung_erlaubt} onNeu={() => void lade()}
            senden={async (fd) => {
              fd.append('t', token); fd.append('aktion', 'rechnung');
              const r = await fetch(TUER, { method: 'POST', body: fd });
              const j = await r.json().catch(() => ({}));
              return r.ok ? { ok: true, text: 'Rechnung eingereicht. Der Auftraggeber prüft sie.' } : { ok: false, text: j?.error || 'Die Rechnung wurde nicht angenommen.' };
            }} />
        )}
      </div>
      <div style={{ ...s.dim, textAlign: 'center', marginTop: 14 }}>Bereitgestellt mit ARGONAUT OS · Bitte geben Sie diesen Link nicht weiter.</div>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: C.navy, color: C.text, padding: '24px 16px 60px', fontFamily: 'var(--font-dm-sans), "DM Sans", system-ui, sans-serif', boxSizing: 'border-box' },
  karte: { maxWidth: 820, margin: '0 auto', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 },
  h1: { fontSize: 20, fontWeight: 800, margin: '6px 0 4px' },
  dim: { color: C.dim, fontSize: 12.5 },
  tabelle: { display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '4px 12px', background: C.navy, borderRadius: 8, padding: '8px 10px', marginTop: 12 },
  bild: { width: 110, height: 80, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}`, background: C.navy },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13.5 },
  aus: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13.5 },
};
