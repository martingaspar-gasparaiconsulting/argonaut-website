'use client';

// ============================================================
// ARGONAUT OS · IMPORT-CENTER (Stufe 1) · /dashboard/import
// Eine Vordertuer fuer alle Importe: Vorlage laden + zum Modul-Import springen.
// Speist sich aus lib/importKatalog.ts. Kein SQL, keine neue Tabelle.
// Stufe 2 (zentraler Upload direkt hier) folgt spaeter.
// ============================================================

import { useMemo, useState, type CSSProperties } from 'react';
import { importQuellen, sucheImporte, gruppiereImporte, zaehleImporte } from '@/lib/importKatalog';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
};

export default function ImportCenterPage() {
  const [suche, setSuche] = useState('');
  const alle = useMemo(() => importQuellen(), []);
  const gefiltert = useMemo(() => sucheImporte(alle, suche), [alle, suche]);
  const gruppen = useMemo(() => gruppiereImporte(gefiltert), [gefiltert]);
  const kpi = useMemo(() => zaehleImporte(alle), [alle]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📥 Import-Center</h1>
      <p style={styles.sub}>
        Alle Importe an einem Ort. Vorlage herunterladen, ausfüllen, hochladen — oder direkt zum
        Import des Moduls springen. So bekommst du deine bestehenden Daten schnell ins System.
      </p>

      <div style={styles.kpiRow}>
        <Kpi wert={kpi.gesamt} label="Importquellen" farbe={C.cyan} />
        <Kpi wert={kpi.mitVorlage} label="mit CSV-Vorlage" farbe={C.gold} />
        <Kpi wert={kpi.gruppen} label="Bereiche" farbe={C.green} />
      </div>

      <input
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        placeholder="🔍 Suchen … (z. B. Kontakte, Lieferanten, Räume)"
        style={styles.suche}
      />

      {gruppen.length === 0 ? (
        <div style={styles.leer}>Keine Import-Quelle passt zur Suche.</div>
      ) : (
        gruppen.map((g) => (
          <div key={g.key} style={{ marginTop: 26 }}>
            <div style={styles.gruppeTitel}>{g.icon} {g.label}</div>
            <div style={styles.grid}>
              {g.quellen.map((s) => (
                <div key={s.key} style={styles.karte}>
                  <div style={styles.karteKopf}>
                    <span style={styles.karteIcon}>{s.icon}</span>
                    <span style={styles.karteTitel}>{s.label}</span>
                  </div>
                  <div style={styles.karteText}>{s.beschreibung}</div>
                  <div style={styles.karteAktionen}>
                    {s.vorlage ? (
                      <a href={s.vorlage} download style={styles.btnVorlage}>⬇ Vorlage</a>
                    ) : (
                      <span style={styles.keineVorlage}>eigener Import</span>
                    )}
                    <a href={s.zielHref} style={styles.btnZiel}>Zum Import ›</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div style={styles.hinweis}>
        <b>Tipp:</b> Lade zuerst die Vorlage, fülle sie mit deinen Daten und importiere sie dann im
        jeweiligen Modul. Ein zentraler Upload direkt hier im Import-Center folgt als nächster Ausbauschritt.
      </div>
    </div>
  );
}

function Kpi({ wert, label, farbe }: { wert: number; label: string; farbe: string }) {
  return (
    <div style={styles.kpi}>
      <div style={{ ...styles.kpiWert, color: farbe }}>{wert}</div>
      <div style={styles.kpiLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '8px 4px 64px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 28, fontWeight: 800, margin: 0, color: C.gold },
  sub: { color: C.dim, fontSize: 15, lineHeight: 1.55, margin: '8px 0 0', maxWidth: 820 },
  kpiRow: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 20 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 20px', minWidth: 150 },
  kpiWert: { fontSize: 34, fontWeight: 800, lineHeight: 1 },
  kpiLabel: { color: C.dim, fontSize: 13, marginTop: 4 },
  suche: { width: '100%', boxSizing: 'border-box', marginTop: 20, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit' },
  gruppeTitel: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
  karteKopf: { display: 'flex', alignItems: 'center', gap: 10 },
  karteIcon: { fontSize: 22, lineHeight: 1 },
  karteTitel: { fontWeight: 700, fontSize: 16 },
  karteText: { color: C.dim, fontSize: 13.5, lineHeight: 1.5, flex: 1 },
  karteAktionen: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 'auto' },
  btnVorlage: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 13, border: `1px solid ${C.gold}`, borderRadius: 9, padding: '7px 12px' },
  keineVorlage: { color: C.dim, fontSize: 12, fontStyle: 'italic' },
  btnZiel: { color: C.navy, background: C.cyan, textDecoration: 'none', fontWeight: 700, fontSize: 13, borderRadius: 9, padding: '7px 12px', marginLeft: 'auto' },
  leer: { marginTop: 24, background: C.navy2, border: `1px dashed ${C.border}`, borderRadius: 14, padding: '36px 20px', textAlign: 'center', color: C.dim },
  hinweis: { marginTop: 30, background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', color: C.dim, fontSize: 13.5, lineHeight: 1.55 },
};
