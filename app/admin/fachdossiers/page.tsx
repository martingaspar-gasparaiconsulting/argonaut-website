'use client';

// ============================================================================
// ARGONAUT OS · app/admin/fachdossiers/page.tsx  (Paket 214, 05.10.2026 · B11a)
//
// Der Fachdossier-Generator nach dem Elektro-Richtwert: Branche wählen,
// Vorschau ansehen, PDF herunterladen. Übersicht, für wie viele der 698
// Branchen schon geprüfte Branchentexte vorliegen.
//
// Vor der Abnahme durch den Anwalt trägt jedes Dossier das Wasserzeichen
// „ENTWURF – nicht zur Weitergabe". Erzeugt werden die echten Dossiers erst
// in B11b. Liegt unter /admin -> hinter dem Admin-Schloss; die Route prüft
// zusätzlich selbst.
// ============================================================================

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type Zeile = { slug: string; name: string; kategorie: string; fertig: boolean };
type Stand = { gesamt: number; fertig: number; entwurf: number; jeKategorie: Record<string, { gesamt: number; fertig: number }> };

const C = { navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', warn: '#E0A24C', danger: '#E06666', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.2)' };

export default function Fachdossiers() {
  const [liste, setListe] = useState<Zeile[]>([]);
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [wahl, setWahl] = useState('elektriker');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/fachdossier');
        const d = await r.json();
        if (d?.ok) { setListe(d.branchen); setStand(d.stand); } else setFehler(d?.error || 'Übersicht nicht lesbar.');
      } catch { setFehler('Verbindung fehlgeschlagen.'); }
    })();
  }, []);

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return (s ? liste.filter((b) => b.name.toLowerCase().includes(s) || b.slug.includes(s)) : liste).slice(0, 60);
  }, [liste, suche]);
  const aktuell = liste.find((b) => b.slug === wahl);

  return (
    <div style={st.seite}>
      <h1 style={st.h1}>Fachdossiers je Branche</h1>
      <p style={st.sub}>
        Generator nach dem Elektro-Richtwert: Grundausstattung und Branchenpaket kommen aus der echten Modul-Freischaltung,
        „Was wir gerade noch bauen“ mit Begründung, QR-Code auf die Branchenseite. Jedes Dossier trägt bis zur Abnahme
        durch den Anwalt das Wasserzeichen <b style={{ color: C.warn }}>ENTWURF – nicht zur Weitergabe</b>.
      </p>
      {fehler && <div style={st.fehler}>{fehler}</div>}

      {stand && (
        <div style={st.karte}>
          <b style={{ color: C.gold }}>{stand.fertig} von {stand.gesamt}</b> Branchen haben geprüfte Branchentexte · {stand.entwurf} sind Entwürfe
          (Alltag, Ablauf und Schwerpunkt folgen in B11b).
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {Object.entries(stand.jeKategorie).sort((a, b) => b[1].gesamt - a[1].gesamt).map(([k, v]) => (
              <span key={k} style={st.chip}>{k}: {v.fertig}/{v.gesamt}</span>
            ))}
          </div>
        </div>
      )}

      <div style={st.raster}>
        <div style={st.karte}>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Branche suchen …" style={st.input} />
          <div style={{ marginTop: 8, maxHeight: 520, overflowY: 'auto' }}>
            {treffer.map((b) => (
              <button key={b.slug} type="button" onClick={() => setWahl(b.slug)}
                style={{ ...st.zeile, ...(b.slug === wahl ? { borderColor: C.gold } : {}) }}>
                <span>{b.name}</span>
                <span style={{ color: b.fertig ? C.green : C.dim, fontSize: 11 }}>{b.fertig ? 'Texte geprüft' : 'Entwurf'}</span>
              </button>
            ))}
            {liste.length > 0 && treffer.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>Keine Branche gefunden.</div>}
          </div>
        </div>
        <div style={st.karte}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <b>{aktuell?.name ?? wahl} <span style={{ color: C.dim, fontWeight: 400 }}>· {aktuell?.kategorie}</span></b>
            <a href={`/api/admin/fachdossier?slug=${encodeURIComponent(wahl)}&format=pdf`} style={st.knopf}>PDF herunterladen</a>
          </div>
          <iframe title="Vorschau Fachdossier" src={`/api/admin/fachdossier?slug=${encodeURIComponent(wahl)}`} style={st.vorschau} />
        </div>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: C.navy, color: C.text, padding: '32px 24px', fontFamily: 'DM Sans, system-ui, sans-serif' },
  h1: { color: C.gold, margin: 0, fontSize: 'clamp(1.4rem, 2.4vw, 2rem)' },
  sub: { color: C.dim, maxWidth: '75ch', lineHeight: 1.6 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 8, padding: '10px 14px', margin: '12px 0' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 14 },
  chip: { fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 10px', color: C.dim },
  raster: { display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16, alignItems: 'start' },
  input: { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 14 },
  zeile: { width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, textAlign: 'left', background: 'transparent', border: `1px solid transparent`, borderRadius: 8, padding: '7px 9px', color: C.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  knopf: { padding: '8px 14px', borderRadius: 8, background: C.gold, color: C.navy, fontWeight: 700, textDecoration: 'none', fontSize: 13 },
  vorschau: { width: '100%', height: '78vh', border: 'none', borderRadius: 8, background: '#fff' },
};
