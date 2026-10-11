'use client';

// ============================================================
// ARGONAUT OS · Projekte · Ansicht anpassen (Paket 310, BV2a)
// Die Branchen-Vorlage gibt Wörter, Status-Namen, Kartenfelder und
// Warnschwellen vor — die Geschäftsleitung darf alles anpassen. Gespeichert
// in modul_einstellung „projekte" (Chef schreibt, Mitarbeiter lesen).
// Status-Schlüssel bleiben fest, nur die Namen ändern sich.
// Pfad: app/dashboard/projekte/ProjektAnsicht.tsx
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
const MODUL = 'projekte';

export default function ProjektAnsicht({ vorlage, einstellung, betrieb, istChef, fein, onGespeichert, onSchliessen }: {
  vorlage: Vorlage; einstellung: KundenEinstellung | null; betrieb: string; istChef: boolean; fein: string | null;
  onGespeichert: (e: KundenEinstellung) => void; onSchliessen: () => void;
}) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [felder, setFelder] = useState<Record<string, boolean>>({});
  const [tage, setTage] = useState('');
  const [prozent, setProzent] = useState('');
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; gut: boolean } | null>(null);

  useEffect(() => {
    setLabels(Object.fromEntries(vorlage.status.map((s) => [s.key, s.label])));
    setFelder(Object.fromEntries(vorlage.spalten.map((s) => [s.key, s.sichtbar])));
    setTage(String(vorlage.warnTage ?? 14));
    setProzent(String(vorlage.warnProzent ?? 70));
  }, [vorlage]);

  async function speichern(neu: KundenEinstellung | null) {
    setBusy(true); setMeldung(null);
    try {
      const r0 = await supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', MODUL).maybeSingle();
      const alt = ((r0.data as { einstellung?: Record<string, unknown> } | null)?.einstellung ?? {}) as Record<string, unknown>;
      // Nur die Ansicht-Schlüssel ersetzen, alles andere in der Einstellung bleibt
      const { statusLabels: _a, spaltenSichtbar: _b, warnTage: _c, warnProzent: _d, ...rest } = alt as KundenEinstellung & Record<string, unknown>;
      void _a; void _b; void _c; void _d;
      const ziel = { ...rest, ...(neu ?? {}) };
      const { error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: betrieb, modul: MODUL, einstellung: ziel, aktualisiert_am: new Date().toISOString() },
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
    const p = Math.trunc(leseZahlOder(prozent, NaN));
    if (!Number.isFinite(t) || t < 0 || t > 365) { setMeldung({ text: 'Tage bitte zwischen 0 und 365.', gut: false }); return; }
    if (!Number.isFinite(p) || p < 0 || p > 100) { setMeldung({ text: 'Prozent bitte zwischen 0 und 100.', gut: false }); return; }
    const statusLabels: Record<string, string> = {};
    for (const [k, v] of Object.entries(labels)) if (v.trim()) statusLabels[k] = v.trim().slice(0, 40);
    void speichern({ statusLabels, spaltenSichtbar: felder, warnTage: t, warnProzent: p });
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
        <div style={{ color: C.dim, fontSize: 13, margin: '2px 0 8px' }}>Nur die Wörter ändern sich — die Bedeutung bleibt (läuft, ruht, fertig, abgebrochen).</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {vorlage.status.map((s) => (
            <label key={s.key} style={{ display: 'grid', gap: 3, fontSize: 13, color: C.dim }}>
              {({ aktiv: 'läuft', pausiert: 'ruht', abgeschlossen: 'fertig', abgebrochen: 'abgebrochen' } as Record<string, string>)[s.key] ?? s.key}
              <input style={feld} value={labels[s.key] ?? ''} maxLength={40} disabled={!istChef} onChange={(e) => setLabels({ ...labels, [s.key]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>

      <div>
        <b>Angaben auf der Karte</b>
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
        <b>Ampel „Achtung"</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 14 }}>
          wenn höchstens
          <input style={{ ...feld, width: 70 }} inputMode="numeric" value={tage} disabled={!istChef} onChange={(e) => setTage(e.target.value)} />
          Tage bis zum Ende und weniger als
          <input style={{ ...feld, width: 70 }} inputMode="numeric" value={prozent} disabled={!istChef} onChange={(e) => setProzent(e.target.value)} />
          % der Aufgaben erledigt sind.
        </div>
        <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>„Kritisch" bleibt fest: eine Aufgabe ist überfällig oder das Enddatum ist vorbei.</div>
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
