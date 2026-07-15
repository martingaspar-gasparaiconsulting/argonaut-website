'use client';

// ============================================================
// ARGONAUT OS · P47 · Zentrale Benachrichtigungs-Glocke
// Sitzt im Dashboard-Header. Zeigt ungelesene Benachrichtigungen aus
// der Tabelle public.benachrichtigungen (RLS: jeder nur seine eigenen).
// - roter Punkt mit Anzahl Ungelesener
// - Dropdown mit den neuesten, jede mit Sprung-Link
// - Öffnen markiert alle als gelesen
// Jeder künftige Auslöser schreibt via benachrichtigung_erstellen() rein —
// diese Glocke muss dafür NICHT geändert werden.
// Pfad: app/dashboard/Glocke.tsx
// ============================================================

import { useEffect, useState, useCallback, useRef, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  text: '#E8EDF4', textDim: '#8FA3BE', danger: '#E06666', border: 'rgba(201,168,76,0.18)',
};

type Nachricht = {
  id: string;
  typ: string;
  titel: string;
  nachricht: string | null;
  link: string | null;
  gelesen: boolean;
  created_at: string;
};

function zeitHer(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std`;
  const tage = Math.floor(std / 24);
  if (tage < 7) return `vor ${tage} Tg`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function Glocke() {
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<Nachricht[]>([]);
  const [ungelesen, setUngelesen] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const laden = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('benachrichtigungen')
        .select('id, typ, titel, nachricht, link, gelesen, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      const rows = (data as Nachricht[]) ?? [];
      setListe(rows);
      setUngelesen(rows.filter((n) => !n.gelesen).length);
    } catch {
      // still: keine Glocke ohne Daten stört den Header nicht
    }
  }, []);

  // Erstladen + sanftes Polling (alle 60s), damit neue Meldungen auftauchen
  useEffect(() => {
    void laden();
    const t = setInterval(() => void laden(), 60000);
    return () => clearInterval(t);
  }, [laden]);

  // Klick außerhalb schließt das Dropdown
  useEffect(() => {
    function aufKlick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOffen(false);
    }
    if (offen) document.addEventListener('mousedown', aufKlick);
    return () => document.removeEventListener('mousedown', aufKlick);
  }, [offen]);

  async function umschalten() {
    const neu = !offen;
    setOffen(neu);
    // Beim Öffnen alle Ungelesenen als gelesen markieren
    if (neu && ungelesen > 0) {
      const ids = liste.filter((n) => !n.gelesen).map((n) => n.id);
      setUngelesen(0);
      setListe((prev) => prev.map((n) => ({ ...n, gelesen: true })));
      try {
        await supabase.from('benachrichtigungen').update({ gelesen: true }).in('id', ids);
      } catch {
        // optimistisch bereits aktualisiert; bei Fehler lädt der nächste Poll neu
      }
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={umschalten} title="Benachrichtigungen" style={styles.knopf}>
        <span style={{ fontSize: 'clamp(18px, 1.56vw, 25px)', lineHeight: 1 }}>🔔</span>
        {ungelesen > 0 && (
          <span style={styles.badge}>{ungelesen > 9 ? '9+' : ungelesen}</span>
        )}
      </button>

      {offen && (
        <div style={styles.dropdown}>
          <div style={styles.kopf}>Benachrichtigungen</div>
          {liste.length === 0 ? (
            <div style={styles.leer}>Keine Benachrichtigungen.</div>
          ) : (
            <div style={styles.rollbereich}>
              {liste.map((n) => {
                const inhalt = (
                  <>
                    <div style={styles.titelZeile}>{n.titel}</div>
                    {n.nachricht && <div style={styles.nachricht}>{n.nachricht}</div>}
                    <div style={styles.zeit}>{zeitHer(n.created_at)}</div>
                  </>
                );
                return n.link ? (
                  <a key={n.id} href={n.link} style={styles.eintrag} onClick={() => setOffen(false)}>
                    {inhalt}
                  </a>
                ) : (
                  <div key={n.id} style={styles.eintrag}>{inhalt}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  knopf: {
    position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
  },
  badge: {
    position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, padding: '0 4px',
    background: C.danger, color: '#fff', borderRadius: 999, fontSize: 'clamp(10px, 0.88vw, 14px)', fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxWidth: '90vw',
    background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12,
    boxShadow: '0 20px 50px rgba(0,0,0,0.5)', zIndex: 200, overflow: 'hidden',
  },
  kopf: {
    padding: '12px 16px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 800, color: C.text,
    borderBottom: `1px solid ${C.border}`, letterSpacing: '0.03em',
  },
  leer: { padding: '20px 16px', color: C.textDim, fontSize: 'clamp(13.5px, 1.19vw, 19px)' },
  rollbereich: { maxHeight: 380, overflowY: 'auto' },
  eintrag: {
    display: 'block', padding: '12px 16px', borderBottom: '1px solid rgba(143,163,190,0.08)',
    textDecoration: 'none', color: C.text, cursor: 'pointer',
  },
  titelZeile: { fontSize: 'clamp(13.5px, 1.19vw, 19px)', fontWeight: 700, color: C.text, marginBottom: 3 },
  nachricht: { fontSize: 'clamp(12.5px, 1.13vw, 18px)', color: C.textDim, lineHeight: 1.45, marginBottom: 4 },
  zeit: { fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.cyan, fontWeight: 600 },
};
