'use client';

// ============================================================
// ARGONAUT OS · G3a · Filial-Umschalter (Header)
// Zeigt oben im Dashboard, in welchem Standort man gerade arbeitet, und
// lässt zwischen den Standorten (oder „Alle") umschalten. Rein additiv:
// erscheint nur bei ≥2 aktiven Standorten und speichert die Wahl im Cookie
// (lib/aktiverStandort). Der Daten-Zuschnitt hängt sich Schritt für Schritt
// daran — dieser Umschalter allein ändert am Zugriff nichts.
// Pfad: app/dashboard/_components/FilialUmschalter.tsx
// ============================================================

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseStandortCookie, setzeStandortCookie, ALLE_STANDORTE } from '../../../lib/aktiverStandort';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Standort = { id: string; name: string; ist_hauptsitz: boolean };

export default function FilialUmschalter() {
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [sel, setSel] = useState<string>(ALLE_STANDORTE);
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('standorte')
        .select('id, name, ist_hauptsitz')
        .eq('aktiv', true)
        .order('ist_hauptsitz', { ascending: false })
        .order('name', { ascending: true });
      if (!error) {
        const st = (data as Standort[]) ?? [];
        setStandorte(st);
        const c = leseStandortCookie();
        // Cookie nur übernehmen, wenn der Standort noch existiert.
        if (c === ALLE_STANDORTE || st.some((s) => s.id === c)) setSel(c);
        else setSel(ALLE_STANDORTE);
      }
      setBereit(true);
    })();
  }, []);

  // Rein additiv: bei weniger als 2 Standorten gibt es nichts umzuschalten.
  if (!bereit || standorte.length < 2) return null;

  function wechsel(v: string) {
    setSel(v);
    setzeStandortCookie(v);
    // Neu laden, damit standort-abhängige Ansichten die Wahl übernehmen.
    if (typeof window !== 'undefined') window.location.reload();
  }

  return (
    <div
      title="Aktiver Standort"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.35)',
        borderRadius: 10, padding: '6px 10px', flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1 }}>🏢</span>
      <select
        value={sel}
        onChange={(e) => wechsel(e.target.value)}
        aria-label="Standort wechseln"
        style={{
          background: 'transparent', color: '#C9A84C', border: 'none', outline: 'none',
          fontSize: 'clamp(13px, 1vw, 15px)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 200,
        }}
      >
        <option value={ALLE_STANDORTE} style={{ color: '#0A1628' }}>Alle Standorte</option>
        {standorte.map((s) => (
          <option key={s.id} value={s.id} style={{ color: '#0A1628' }}>
            {s.name}{s.ist_hauptsitz ? ' (Hauptsitz)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
