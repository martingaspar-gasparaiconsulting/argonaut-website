'use client';

// ============================================================
// ARGONAUT OS · Paket 294 · V2b — Schalter „Online-Anfrage" (Reiter Mietbedingungen)
// Chef schaltet die öffentliche Seite /mieten/<kennung> ein/aus und entscheidet,
// ob Google sie finden darf (Standard: nein). Einstellung in modul_einstellung,
// Modul „miet-online" (Chef schreibt, RLS aus Paket 259).
// Die Seite nimmt nur UNVERBINDLICHE Anfragen an — keine Buchung, keine Zahlung.
// ============================================================

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { neueKennung } from '@/lib/kfzBoerse';
import { MIET_ONLINE_MODUL, einstellungLesen, mietPfad } from '@/lib/mietOnline';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { gold: '#C9A84C', navy: '#0A1628', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', bad: '#E06666' };

export default function MietOnlineEinstellung({ betrieb }: { betrieb: string }) {
  const [roh, setRoh] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  const lade = useCallback(async () => {
    const { data } = await supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', MIET_ONLINE_MODUL).maybeSingle();
    const e = (data as { einstellung?: unknown } | null)?.einstellung;
    setRoh(e && typeof e === 'object' ? (e as Record<string, unknown>) : {});
  }, [betrieb]);
  useEffect(() => { void lade(); }, [lade]);

  const einst = einstellungLesen(roh);
  const link = einst.kennung && typeof window !== 'undefined' ? `${window.location.origin}${mietPfad(einst.kennung)}` : '';

  async function speichern(neu: { aktiv: boolean; google: boolean }) {
    let kennung = einst.kennung;
    if (!kennung) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      kennung = neueKennung(Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''));
    }
    if (!kennung) { setFehler('Kennung konnte nicht erzeugt werden.'); return; }
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: betrieb, modul: MIET_ONLINE_MODUL, einstellung: { ...roh, kennung, aktiv: neu.aktiv, google: neu.aktiv && neu.google }, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'owner_user_id,modul' });
      if (error) { setFehler('Die Online-Anfrage ließ sich nicht umschalten.'); return; }
      await lade();
    } finally { setBusy(false); }
  }

  return (
    <div style={s.box}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ color: C.gold }}>🌐 Online-Anfrage</b>
        <span style={{ ...s.pill, color: einst.aktiv ? C.ok : C.dim }}>{einst.aktiv ? 'online' : 'aus'}</span>
        {einst.aktiv && <span style={{ ...s.pill, color: einst.google ? C.gold : C.dim }}>{einst.google ? 'bei Google auffindbar' : 'nur per Link'}</span>}
        {einst.aktiv && link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: C.gold, fontSize: 13.5 }}>Ansehen ↗</a>}
      </div>
      <p style={s.dim}>
        Eine öffentliche Seite mit Ihrer Mietflotte (nur Fahrzeuge „in der Mietflotte"), Endpreisen inkl. MwSt. und den Fahrer-Bedingungen. Interessenten wählen Fahrzeug und Zeitraum und
        senden eine <b>unverbindliche Anfrage</b> — keine Buchung, keine Zahlung. Ist das Fahrzeug im Zeitraum vergeben, sieht der Interessent nur „vergeben", nie bei wem.
        Anfragen landen im Reiter „📨 Anfragen"; dort übernehmen Sie sie als Reservierung. Kennzeichen, km-Stand und Notizen erscheinen nie.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {einst.aktiv
          ? <button type="button" style={s.btn} disabled={busy} onClick={() => void speichern({ aktiv: false, google: false })}>Online-Anfrage ausschalten</button>
          : <button type="button" style={s.gold} disabled={busy} onClick={() => void speichern({ aktiv: true, google: false })}>Online-Anfrage einschalten</button>}
        {einst.aktiv && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: C.text }}>
            <input type="checkbox" checked={einst.google} disabled={busy} onChange={(e) => void speichern({ aktiv: true, google: e.target.checked })} />
            Bei Google finden lassen
          </label>
        )}
      </div>
      {einst.aktiv && link && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <input readOnly value={link} aria-label="Link zur Seite Fahrzeuge mieten" onFocus={(e) => e.currentTarget.select()} style={{ ...s.inp, flex: '1 1 320px' }} />
          <button type="button" style={s.btn} onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 1800); }); }}>{kopiert ? '✓ Kopiert' : '📋 Kopieren'}</button>
        </div>
      )}
      <p style={{ ...s.dim, fontSize: 12.5 }}>Den Link können Sie auf Ihrer Webseite, in Mails und in sozialen Netzwerken teilen. Firmendaten fürs Impressum kommen aus „Webauftritt" bzw. Ihrem Profil.</p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  box: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', margin: '12px 0' },
  dim: { color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: '8px 0' },
  pill: { border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  btn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  gold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },
  inp: { background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
};
