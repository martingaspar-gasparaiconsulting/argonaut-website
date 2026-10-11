'use client';

// ============================================================
// ARGONAUT OS · Kontakte (CRM) · Ansicht anpassen (Paket 312, BV2 Kunden)
// Die Branchen-Vorlage gibt Status-Namen, Spalten, das Wort für die
// eigenen Kunden und das Betreuungs-Intervall für neue Kontakte vor —
// die Geschäftsleitung darf alles anpassen. Gespeichert in
// modul_einstellung „kontakte" (Chef schreibt, Mitarbeiter lesen).
// Status-Schlüssel bleiben fest.
// Pfad: app/dashboard/crm/KontaktAnsicht.tsx
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Vorlage, KundenEinstellung } from '@/lib/branchenVorlage';
import { leseZahlOder } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', green: '#4CAF7D' };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, minWidth: 0 };
const knopf = (farbe: string, voll = false): CSSProperties => ({ background: voll ? farbe : 'transparent', color: voll ? C.navy : farbe, border: `1px solid ${farbe}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 14 });
const BEDEUTUNG: Record<string, string> = { interessent: 'erste Anfrage', aktiv: 'im Gespräch', kunde: 'Kunde', inaktiv: 'ruht' };
export const KONTAKT_MODUL = 'kontakte';

export default function KontaktAnsicht({ vorlage, einstellung, betrieb, istChef, fein, onGespeichert, onSchliessen }: {
  vorlage: Vorlage; einstellung: KundenEinstellung | null; betrieb: string; istChef: boolean; fein: string | null;
  onGespeichert: (e: KundenEinstellung) => void; onSchliessen: () => void;
}) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [felder, setFelder] = useState<Record<string, boolean>>({});
  const [tage, setTage] = useState('');
  const [wort, setWort] = useState('');
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; gut: boolean } | null>(null);

  useEffect(() => {
    setLabels(Object.fromEntries(vorlage.status.map((s) => [s.key, s.label])));
    setFelder(Object.fromEntries(vorlage.spalten.map((s) => [s.key, s.sichtbar])));
    setTage(String(vorlage.intervallTage ?? 30));
    setWort(vorlage.kundenWort ?? 'Kunden');
  }, [vorlage]);

  async function speichern(neu: KundenEinstellung | null) {
    setBusy(true); setMeldung(null);
    try {
      const r0 = await supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', KONTAKT_MODUL).maybeSingle();
      const alt = ((r0.data as { einstellung?: Record<string, unknown> } | null)?.einstellung ?? {}) as Record<string, unknown>;
      // Nur die Ansicht-Schlüssel ersetzen, alles andere in der Einstellung bleibt
      const { statusLabels: _a, spaltenSichtbar: _b, intervallTage: _c, kundenWort: _d, ...rest } = alt as KundenEinstellung & Record<string, unknown>;
      void _a; void _b; void _c; void _d;
      const ziel = { ...rest, ...(neu ?? {}) };
      const { error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: betrieb, modul: KONTAKT_MODUL, einstellung: ziel, aktualisiert_am: new Date().toISOString() },
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
    const t = Math.trunc(leseZahlOder(tage, NaN));
    if (!Number.isFinite(t) || t < 1 || t > 730) { setMeldung({ text: 'Intervall bitte zwischen 1 und 730 Tagen.', gut: false }); return; }
    const w = wort.trim();
    if (!w) { setMeldung({ text: 'Bitte ein Wort für die eigenen Kunden eintragen.', gut: false }); return; }
    const statusLabels: Record<string, string> = {};
    for (const [k, v] of Object.entries(labels)) if (v.trim()) statusLabels[k] = v.trim().slice(0, 40);
    void speichern({ statusLabels, spaltenSichtbar: felder, intervallTage: t, kundenWort: w.slice(0, 30) });
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
        <b>Spalten in der Liste</b>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
          {vorlage.spalten.map((s) => (
            <label key={s.key} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: istChef ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={!!felder[s.key]} disabled={!istChef} onChange={(e) => setFelder({ ...felder, [s.key]: e.target.checked })} style={{ width: 17, height: 17 }} />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <b>Wörter und Betreuung</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 14 }}>
          Ihre Kunden heißen
          <input style={{ ...feld, width: 180 }} value={wort} maxLength={30} disabled={!istChef} onChange={(e) => setWort(e.target.value)} />
          — neue Kontakte werden alle
          <input style={{ ...feld, width: 70 }} inputMode="numeric" value={tage} disabled={!istChef} onChange={(e) => setTage(e.target.value)} />
          Tage gepflegt.
        </div>
        <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>Ampel je Kontakt: grün im Takt, gelb bis zum doppelten Intervall, danach rot. Ein am Kontakt eingetragenes Intervall bleibt unverändert.</div>
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
