'use client';

// ============================================================
// ARGONAUT OS · Dispo-Board · Ansicht anpassen (Paket 313, BV2 Einsätze)
// Die Branchen-Vorlage gibt Status-Namen und das Wort für die Person vor,
// die einen Einsatz fährt („Monteur", „Reinigungskraft") — die
// Geschäftsleitung darf beides anpassen. Gespeichert in modul_einstellung
// „einsaetze" (Chef schreibt, Mitarbeiter lesen). Status-Schlüssel bleiben fest.
// Pfad: app/dashboard/dispo/EinsatzAnsicht.tsx
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Vorlage, KundenEinstellung } from '@/lib/branchenVorlage';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', green: '#4CAF7D' };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, minWidth: 0 };
const knopf = (farbe: string, voll = false): CSSProperties => ({ background: voll ? farbe : 'transparent', color: voll ? C.navy : farbe, border: `1px solid ${farbe}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 14 });
const BEDEUTUNG: Record<string, string> = { geplant: 'geplant', unterwegs: 'unterwegs', vor_ort: 'vor Ort', erledigt: 'erledigt', abgesagt: 'abgesagt' };
export const EINSATZ_MODUL = 'einsaetze';

export default function EinsatzAnsicht({ vorlage, einstellung, betrieb, istChef, fein, onGespeichert, onSchliessen }: {
  vorlage: Vorlage; einstellung: KundenEinstellung | null; betrieb: string; istChef: boolean; fein: string | null;
  onGespeichert: (e: KundenEinstellung) => void; onSchliessen: () => void;
}) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [wort, setWort] = useState('');
  const [mehrzahl, setMehrzahl] = useState('');
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; gut: boolean } | null>(null);

  useEffect(() => {
    setLabels(Object.fromEntries(vorlage.status.map((s) => [s.key, s.label])));
    setWort(vorlage.personWort ?? 'Mitarbeiter');
    setMehrzahl(vorlage.personPlural ?? 'Mitarbeiter');
  }, [vorlage]);

  async function speichern(neu: KundenEinstellung | null) {
    setBusy(true); setMeldung(null);
    try {
      const r0 = await supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', EINSATZ_MODUL).maybeSingle();
      const alt = ((r0.data as { einstellung?: Record<string, unknown> } | null)?.einstellung ?? {}) as Record<string, unknown>;
      // Nur die Ansicht-Schlüssel ersetzen, alles andere in der Einstellung bleibt
      const { statusLabels: _a, personWort: _b, personPlural: _c, ...rest } = alt as KundenEinstellung & Record<string, unknown>;
      void _a; void _b; void _c;
      const ziel = { ...rest, ...(neu ?? {}) };
      const { error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: betrieb, modul: EINSATZ_MODUL, einstellung: ziel, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'owner_user_id,modul' },
      );
      if (error) throw error;
      onGespeichert(ziel as KundenEinstellung);
      setMeldung({ text: neu ? 'Ansicht gespeichert — gilt für alle im Betrieb.' : 'Auf die Branchen-Vorlage zurückgesetzt.', gut: true });
    } catch (e) {
      setMeldung({ text: 'Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'), gut: false });
    } finally { setBusy(false); }
  }

  function speichernKlick() {
    const w = wort.trim();
    const m = mehrzahl.trim();
    if (!w || !m) { setMeldung({ text: 'Bitte beide Wörter eintragen (eine Person und mehrere).', gut: false }); return; }
    const statusLabels: Record<string, string> = {};
    for (const [k, v] of Object.entries(labels)) if (v.trim()) statusLabels[k] = v.trim().slice(0, 40);
    void speichern({ statusLabels, personWort: w.slice(0, 30), personPlural: m.slice(0, 30) });
  }

  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.gold}`, borderRadius: 12, padding: 16, marginBottom: 18, color: C.text, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>⚙️ Ansicht anpassen{fein ? ` · Vorlage ${fein}` : ''}</strong>
        <button style={knopf(C.dim)} onClick={onSchliessen}>Schließen</button>
      </div>
      {!istChef && <div style={{ color: C.dim }}>Die Ansicht legt die Geschäftsleitung für den ganzen Betrieb fest. Sie sehen hier, was eingestellt ist.</div>}

      <div>
        <b>Status-Namen</b>
        <div style={{ color: C.dim, fontSize: 13, margin: '2px 0 8px' }}>Nur die Wörter ändern sich — die Bedeutung bleibt (auch für Auswertungen und Abläufe).</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          {vorlage.status.map((s) => (
            <label key={s.key} style={{ display: 'grid', gap: 3, fontSize: 13, color: C.dim }}>
              {BEDEUTUNG[s.key] ?? s.key}
              <input style={feld} value={labels[s.key] ?? ''} maxLength={40} disabled={!istChef} onChange={(e) => setLabels({ ...labels, [s.key]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>

      <div>
        <b>Wer fährt die Einsätze?</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 14 }}>
          Eine Person heißt
          <input style={{ ...feld, width: 180 }} value={wort} maxLength={30} disabled={!istChef} onChange={(e) => setWort(e.target.value)} />
          , mehrere heißen
          <input style={{ ...feld, width: 180 }} value={mehrzahl} maxLength={30} disabled={!istChef} onChange={(e) => setMehrzahl(e.target.value)} />
        </div>
        <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>Gilt im Dispo-Board und bei „Meine Einsätze“.</div>
      </div>

      {meldung && <div style={{ color: meldung.gut ? C.green : C.danger }}>{meldung.text}</div>}
      {istChef && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={knopf(C.gold, true)} disabled={busy} onClick={speichernKlick}>Speichern</button>
          {einstellung && <button style={knopf(C.dim)} disabled={busy} onClick={() => speichern(null)}>Auf Vorlage zurücksetzen</button>}
        </div>
      )}
    </div>
  );
}
