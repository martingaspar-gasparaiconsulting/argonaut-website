'use client';

// ============================================================================
// ARGONAUT OS · Karte „Zwei-Faktor für alle Pflicht" (Paket 190)
// Pfad: app/dashboard/_components/ZweiFaktorPflichtKarte.tsx
//
// Nur für die Geschäftsleitung (sonst erscheint nichts). Einschalten nur mit
// eigener, bestätigter Zwei-Faktor-Anmeldung und zwei Bestätigungen:
// Mitarbeiter informiert + Betriebsrat einbezogen bzw. keiner vorhanden.
// 7 Tage Übergangsfrist, jederzeit abschaltbar. Entscheidung am Server
// (/api/zwei-faktor/pflicht). Kundentext mit „Sie".
// Paket 203: darunter die Ausnahmen je Mitarbeiter (ZweiFaktorAusnahmen).
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { EINRICHT_PFAD } from '@/lib/zweiFaktor';
import { datumDe } from '@/lib/zweiFaktorPflicht';
import ZweiFaktorAusnahmen from './ZweiFaktorAusnahmen';

type Stand = {
  rolle: 'chef' | null; aal2?: boolean; uebergangTage?: number;
  stufe?: 'aus' | 'uebergang' | 'pflicht'; pflichtAb?: string | null; restTage?: number;
  eingeschaltetAm?: string | null; betriebsrat?: string | null;
  mitarbeiterGesamt?: number; mitarbeiterOhneFaktor?: number;
};

const knopf = { padding: '9px 14px', borderRadius: 9, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', border: 'none' } as const;

export default function ZweiFaktorPflichtKarte() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [offen, setOffen] = useState(false);
  const [informiert, setInformiert] = useState(false);
  const [betriebsrat, setBetriebsrat] = useState<'' | 'einbezogen' | 'keiner'>('');
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/zwei-faktor/pflicht');
      setStand(await r.json() as Stand);
    } catch { setStand(null); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  if (!stand || stand.rolle !== 'chef') return null;

  async function senden(body: Record<string, unknown>) {
    setBusy(true); setMeldung(null);
    try {
      const r = await fetch('/api/zwei-faktor/pflicht', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json() as { ok?: boolean; meldung?: string; error?: string };
      setMeldung({ ok: !!j.ok, text: j.ok ? (j.meldung ?? 'Erledigt.') : (j.error ?? 'Fehler.') });
      if (j.ok) { setOffen(false); setInformiert(false); setBetriebsrat(''); }
    } catch { setMeldung({ ok: false, text: 'Gerade nicht erreichbar.' }); }
    setBusy(false);
    await laden();
  }

  const an = stand.stufe === 'uebergang' || stand.stufe === 'pflicht';
  const ohne = stand.mitarbeiterOhneFaktor ?? 0;
  const tage = stand.uebergangTage ?? 7;

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${an ? 'rgba(201,168,76,0.55)' : 'rgba(143,163,190,0.18)'}`, borderRadius: 14, padding: '18px 20px', margin: '18px 0' }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>🛡️ Zwei-Faktor für alle Pflicht</div>
      <div style={{ color: '#8FA3BE', fontSize: 13.5, margin: '4px 0 10px', lineHeight: 1.5 }}>
        {stand.stufe === 'aus' && `Aus. Wer einen zweiten Faktor eingerichtet hat, nutzt ihn; alle anderen melden sich nur mit Passwort an. Eingeschaltet haben alle ${tage} Tage Zeit, danach geht es ohne Einrichtung nicht mehr ins Dashboard.`}
        {stand.stufe === 'uebergang' && `Eingeschaltet — Pflicht ab ${datumDe(stand.pflichtAb)} (noch ${stand.restTage} Tag${stand.restTage === 1 ? '' : 'e'}). Bis dahin geht es auch ohne; danach führt die Anmeldung ohne zweiten Faktor direkt zur Einrichtung.`}
        {stand.stufe === 'pflicht' && `Pflicht seit ${datumDe(stand.pflichtAb)}. Wer noch keinen zweiten Faktor hat, landet nach dem Passwort bei der Einrichtung — ausgesperrt wird niemand.`}
      </div>
      {(stand.mitarbeiterGesamt ?? 0) > 0 && (
        <div style={{ fontSize: 13.5, marginBottom: 10, color: ohne > 0 ? '#E0A24C' : '#4CAF7D' }}>
          {ohne > 0 ? `${ohne} von ${stand.mitarbeiterGesamt} Mitarbeiter-Zugängen haben noch keinen zweiten Faktor.` : `Alle ${stand.mitarbeiterGesamt} Mitarbeiter-Zugänge haben einen zweiten Faktor.`}
        </div>
      )}
      {an && stand.eingeschaltetAm && (
        <div style={{ color: '#8FA3BE', fontSize: 12.5, marginBottom: 10 }}>
          Nachweis: eingeschaltet am {datumDe(stand.eingeschaltetAm)} · Mitarbeiter informiert · Betriebsrat: {stand.betriebsrat === 'einbezogen' ? 'einbezogen' : 'keiner vorhanden'}
        </div>
      )}
      {!stand.aal2 && (
        <div style={{ color: '#E0A24C', fontSize: 13.5, marginBottom: 10 }}>
          Ein- und Ausschalten nur mit eigener, bestätigter Zwei-Faktor-Anmeldung. <a href={`${EINRICHT_PFAD}?weiter=/dashboard/einstellungen`} style={{ color: '#00e5ff' }}>Einrichten bzw. Code bestätigen</a>
        </div>
      )}
      {meldung && <div style={{ fontSize: 13.5, marginBottom: 8, color: meldung.ok ? '#4CAF7D' : '#E06666' }}>{meldung.text}</div>}

      {!an && !offen && (
        <button type="button" disabled={!stand.aal2 || busy} onClick={() => setOffen(true)} style={{ ...knopf, background: '#C9A84C', color: '#0A1628', opacity: stand.aal2 ? 1 : 0.5 }}>Für alle Pflicht machen …</button>
      )}

      {!an && offen && (
        <div style={{ borderTop: '1px solid rgba(143,163,190,0.15)', paddingTop: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={informiert} onChange={(e) => setInformiert(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Die Mitarbeiter sind informiert, dass die Anmeldung künftig einen Code aus einer Authenticator-App braucht.</span>
          </label>
          <div style={{ fontSize: 14, margin: '6px 0 4px' }}>Betriebsrat:</div>
          <label style={{ display: 'flex', gap: 8, fontSize: 14, marginBottom: 4, cursor: 'pointer' }}>
            <input type="radio" name="betriebsrat" checked={betriebsrat === 'einbezogen'} onChange={() => setBetriebsrat('einbezogen')} />
            <span>Einbezogen (Mitbestimmung geklärt)</span>
          </label>
          <label style={{ display: 'flex', gap: 8, fontSize: 14, marginBottom: 10, cursor: 'pointer' }}>
            <input type="radio" name="betriebsrat" checked={betriebsrat === 'keiner'} onChange={() => setBetriebsrat('keiner')} />
            <span>Kein Betriebsrat vorhanden</span>
          </label>
          <div style={{ color: '#8FA3BE', fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 }}>
            Wer die Pflicht einschaltet und wann, wird mit beiden Angaben gespeichert. Alle Mitarbeiter bekommen eine Meldung in der Glocke. Sie können die Pflicht jederzeit wieder ausschalten.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy || !informiert || !betriebsrat}
              onClick={() => senden({ an: true, mitarbeiterInformiert: informiert, betriebsrat })}
              style={{ ...knopf, background: '#C9A84C', color: '#0A1628', opacity: (!informiert || !betriebsrat) ? 0.5 : 1 }}>
              {busy ? 'Speichert …' : `Einschalten (Pflicht ab in ${tage} Tagen)`}
            </button>
            <button type="button" disabled={busy} onClick={() => setOffen(false)} style={{ ...knopf, background: 'transparent', color: '#E8EDF4', border: '1px solid rgba(143,163,190,0.3)' }}>Abbrechen</button>
          </div>
        </div>
      )}

      {an && (
        <button type="button" disabled={!stand.aal2 || busy}
          onClick={() => { if (window.confirm('Pflicht für alle ausschalten? Wer keinen zweiten Faktor hat, kommt dann wieder nur mit Passwort hinein.')) void senden({ an: false }); }}
          style={{ ...knopf, background: 'transparent', color: '#E06666', border: '1px solid rgba(224,102,102,0.5)', opacity: stand.aal2 ? 1 : 0.5 }}>
          Pflicht ausschalten
        </button>
      )}

      {an && <ZweiFaktorAusnahmen />}
    </div>
  );
}
