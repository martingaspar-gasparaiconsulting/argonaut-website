'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL PROJEKTE · P3 — Projekt-Detailseite
// Kopf + Reiter-Geruest (Aufgaben/Kalender folgen additiv)
// ============================================================

const BRAND = {
  navy: '#0A1628',
  navy2: '#0F1F33',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  danger: '#E06666',
  warn: '#E0A24C',
  textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

const STATUS_META: Record<string, { label: string; farbe: string }> = {
  aktiv: { label: 'Aktiv', farbe: '#4CAF7D' },
  pausiert: { label: 'Pausiert', farbe: '#E0A24C' },
  abgeschlossen: { label: 'Abgeschlossen', farbe: '#5A8DEE' },
  abgebrochen: { label: 'Abgebrochen', farbe: '#E06666' },
};

const PRIO_META: Record<string, { label: string; farbe: string }> = {
  niedrig: { label: 'Niedrig', farbe: '#8FA3BE' },
  normal: { label: 'Normal', farbe: '#8FA3BE' },
  hoch: { label: 'Hoch', farbe: '#E0A24C' },
  dringend: { label: 'Dringend', farbe: '#E06666' },
};

const REITER = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'aufgaben', label: 'Aufgaben' },
  { key: 'kalender', label: 'Kalender' },
  { key: 'einstellungen', label: 'Einstellungen' },
];

function dStr(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
}

type Projekt = any;
type Aufgabe = any;

export default function ProjektDetailPage() {
  const params = useParams();
  const projektId = String(params?.id || '');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState('');
  const [projekt, setProjekt] = useState<Projekt | null>(null);
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [reiter, setReiter] = useState('uebersicht');

  const ladeDaten = useCallback(async () => {
    setLaden(true);
    setFehler('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }

      const [projRes, aufgRes] = await Promise.all([
        supabase.from('projekte').select('*').eq('id', projektId).eq('owner_user_id', uid).maybeSingle(),
        supabase.from('aufgaben').select('id,projekt_id,status,erledigt,faellig_am,prioritaet').eq('projekt_id', projektId).eq('owner_user_id', uid),
      ]);
      if (!projRes.data) { setFehler('Projekt nicht gefunden.'); setLaden(false); return; }
      setProjekt(projRes.data);
      setAufgaben(aufgRes.data || []);
    } catch (e: any) {
      setFehler(e?.message || 'Fehler beim Laden.');
    } finally {
      setLaden(false);
    }
  }, [supabase, projektId]);

  useEffect(() => { void ladeDaten(); }, [ladeDaten]);

  // --- Styles ---
  const card: React.CSSProperties = {
    background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18,
  };
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: BRAND.textDim, border: `1px solid ${BRAND.border}`,
    borderRadius: 10, padding: '8px 14px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif', textDecoration: 'none', display: 'inline-block',
  };

  if (laden) {
    return (
      <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ ...card, color: BRAND.textDim }}>Lade Projekt…</div>
      </div>
    );
  }

  if (fehler || !projekt) {
    return (
      <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
        <a href="/dashboard/projekte" style={{ ...btnGhost, marginBottom: 16 }}>← Zur Übersicht</a>
        <div style={{ ...card, borderColor: BRAND.danger, color: BRAND.danger, marginTop: 16 }}>{fehler || 'Projekt nicht gefunden.'}</div>
      </div>
    );
  }

  const sm = STATUS_META[projekt.status] || STATUS_META.aktiv;
  const pm = PRIO_META[projekt.prioritaet] || PRIO_META.normal;

  const gesamt = aufgaben.length;
  const erledigt = aufgaben.filter((a) => a.erledigt || a.status === 'fertig').length;
  const offen = gesamt - erledigt;
  const pct = gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0;
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const ueberfaellig = aufgaben.filter((a) => !a.erledigt && a.status !== 'fertig' && a.faellig_am && new Date(a.faellig_am) < heute).length;

  return (
    <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
      <a href="/dashboard/projekte" style={{ ...btnGhost, marginBottom: 16 }}>← Zur Übersicht</a>

      {/* Projekt-Kopf */}
      <div style={{ ...card, borderLeft: `4px solid ${projekt.farbe || BRAND.cyan}`, marginTop: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800 }}>{projekt.name}</h1>
              <span style={{ fontSize: 11, fontWeight: 700, color: sm.farbe, background: sm.farbe + '22', border: `1px solid ${sm.farbe}55`, borderRadius: 999, padding: '3px 10px' }}>{sm.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: pm.farbe, background: pm.farbe + '22', border: `1px solid ${pm.farbe}55`, borderRadius: 999, padding: '3px 10px' }}>{pm.label}</span>
            </div>
            {projekt.beschreibung && (
              <p style={{ margin: '0 0 10px', color: BRAND.textDim, fontSize: 14, lineHeight: 1.5 }}>{projekt.beschreibung}</p>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: BRAND.textDim }}>
              <span>📅 {dStr(projekt.start_datum)} – {dStr(projekt.end_datum)}</span>
              {projekt.verantwortlich && <span>👤 {projekt.verantwortlich}</span>}
              {projekt.budget != null && <span>💶 {Number(projekt.budget).toLocaleString('de-DE')} €</span>}
            </div>
          </div>
        </div>

        {/* Fortschritt */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: BRAND.textDim, marginBottom: 5 }}>
            <span>Fortschritt</span>
            <span>{erledigt}/{gesamt} Aufgaben · {pct}%</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? BRAND.green : BRAND.cyan, borderRadius: 999, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      </div>

      {/* Reiter-Leiste */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18, borderBottom: `1px solid ${BRAND.border}`, paddingBottom: 0 }}>
        {REITER.map((r) => {
          const aktiv = reiter === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setReiter(r.key)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '10px 16px', fontSize: 14, fontWeight: 700,
                fontFamily: 'DM Sans, sans-serif',
                color: aktiv ? BRAND.cyan : BRAND.textDim,
                borderBottom: `2px solid ${aktiv ? BRAND.cyan : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Reiter-Inhalt */}
      {reiter === 'uebersicht' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <StatKachel label="Aufgaben gesamt" wert={String(gesamt)} farbe={BRAND.cyan} />
          <StatKachel label="Offen" wert={String(offen)} farbe={BRAND.warn} />
          <StatKachel label="Erledigt" wert={String(erledigt)} farbe={BRAND.green} />
          <StatKachel label="Überfällig" wert={String(ueberfaellig)} farbe={ueberfaellig > 0 ? BRAND.danger : BRAND.textDim} />
        </div>
      )}

      {reiter === 'aufgaben' && (
        <div style={{ ...card, color: BRAND.textDim, textAlign: 'center', padding: 40 }}>
          Aufgaben & Kanban-Board folgen im nächsten Schritt.
        </div>
      )}

      {reiter === 'kalender' && (
        <div style={{ ...card, color: BRAND.textDim, textAlign: 'center', padding: 40 }}>
          Kalenderansicht folgt.
        </div>
      )}

      {reiter === 'einstellungen' && (
        <div style={{ ...card, color: BRAND.textDim }}>
          Projekt-Einstellungen (bearbeiten/archivieren) folgen. Bis dahin: zurück zur Übersicht, dort „Bearbeiten".
        </div>
      )}
    </div>
  );
}

function StatKachel({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: '20px 18px' }}>
      <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 800, color: farbe }}>{wert}</div>
      <div style={{ fontSize: 13, color: BRAND.textDim, marginTop: 4 }}>{label}</div>
    </div>
  );
}
