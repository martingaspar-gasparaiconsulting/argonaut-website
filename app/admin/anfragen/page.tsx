'use client';

// ============================================================
// ARGONAUT OS · Control Room · Website-Anfragen
// Zeigt alle über das Website-Formular eingegangenen Anfragen
// (Tabelle website_anfragen). Daten admin-geschützt aus
// /api/admin/anfragen. Pfad: app/admin/anfragen/page.tsx
// Look: Command-Center-Marken-Design (Navy/Gold, Syne + DM Sans).
// ============================================================

import { useState, useEffect, CSSProperties } from 'react';

const C = {
  navy: '#0A1628', navy2: 'rgba(255,255,255,0.04)', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)', danger: '#e06666',
};

type Anfrage = Record<string, string | null | undefined>;
type Daten = { anfragen?: Anfrage[]; error?: string; detail?: string };

function feld(a: Anfrage, ...keys: string[]): string {
  for (const k of keys) {
    const v = a[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

function datum(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AnfragenPage() {
  const [anfragen, setAnfragen] = useState<Anfrage[] | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/anfragen');
        if (res.status === 401 || res.status === 403) { setFehler('Kein Zugriff — nur für Admins.'); setLaden(false); return; }
        const j = (await res.json()) as Daten;
        if (j.error) { setFehler(j.error + (j.detail ? ` (${j.detail})` : '')); setLaden(false); return; }
        setAnfragen(j.anfragen ?? []);
      } catch {
        setFehler('Anfragen konnten nicht geladen werden.');
      } finally { setLaden(false); }
    })();
  }, []);

  const jetzt = Date.now();
  const woche = 7 * 24 * 60 * 60 * 1000;
  const liste = anfragen ?? [];
  const neueWoche = liste.filter((a) => {
    const d = new Date(feld(a, 'created_at', 'eingegangen_am', 'erstellt_am'));
    return !isNaN(d.getTime()) && jetzt - d.getTime() <= woche;
  }).length;
  const mitTermin = liste.filter((a) => feld(a, 'wunschtermin') !== '').length;

  return (
    <div style={styles.page}>
      <div style={styles.kopf}>
        <h1 style={styles.h1}>Website-Anfragen</h1>
        <a href="/admin/command-center" style={styles.back}>← Zurück zum Command Center</a>
      </div>
      <p style={styles.sub}>Alle über das Kontakt-/Demo-Formular der Website eingegangenen Anfragen. Quelle: <code>website_anfragen</code>. Neue Anfragen kommen zusätzlich per E-Mail an info@argonaut-os.com.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {laden ? <p style={styles.dim}>Lädt …</p> : anfragen && (
        <>
          <div style={styles.kpis}>
            <div style={styles.kpi}><div style={styles.kLabel}>Anfragen gesamt</div><div style={{ ...styles.kWert, color: C.gold }}>{liste.length.toLocaleString('de-DE')}</div></div>
            <div style={styles.kpi}><div style={styles.kLabel}>Neu (7 Tage)</div><div style={{ ...styles.kWert, color: C.cyan }}>{neueWoche.toLocaleString('de-DE')}</div></div>
            <div style={styles.kpi}><div style={styles.kLabel}>Mit Wunschtermin</div><div style={{ ...styles.kWert, color: C.green }}>{mitTermin.toLocaleString('de-DE')}</div></div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitel}>Alle Anfragen</div>
            {liste.length === 0 ? <p style={styles.dim}>Noch keine Anfragen eingegangen.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Eingegangen</th>
                      <th style={styles.th}>Name / Firma</th>
                      <th style={styles.th}>Kontakt</th>
                      <th style={styles.th}>Mitarbeiter</th>
                      <th style={styles.th}>Kontaktwunsch</th>
                      <th style={styles.th}>Wunschtermin</th>
                      <th style={styles.th}>Nachricht</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((a, i) => {
                      const email = feld(a, 'email');
                      const tel = feld(a, 'telefon', 'phone');
                      const branche = feld(a, 'branche');
                      return (
                        <tr key={i}>
                          <td style={styles.tdNo}>{datum(feld(a, 'created_at', 'eingegangen_am', 'erstellt_am')) || '—'}</td>
                          <td style={styles.td}>
                            <div style={{ fontWeight: 700 }}>{feld(a, 'name') || '—'}</div>
                            {feld(a, 'unternehmen', 'firma') && <div style={{ color: C.textDim, fontSize: 12 }}>{feld(a, 'unternehmen', 'firma')}</div>}
                            {branche && <div style={{ color: C.gold, fontSize: 12 }}>{branche}</div>}
                          </td>
                          <td style={styles.td}>
                            {email && <div><a href={`mailto:${email}`} style={styles.link}>{email}</a></div>}
                            {tel && <div><a href={`tel:${tel}`} style={styles.link}>{tel}</a></div>}
                            {!email && !tel && '—'}
                          </td>
                          <td style={styles.tdNo}>{feld(a, 'mitarbeiter') || '—'}</td>
                          <td style={styles.tdNo}>{feld(a, 'kontaktwunsch') || '—'}</td>
                          <td style={styles.tdNo}>{feld(a, 'wunschtermin') || '—'}</td>
                          <td style={styles.tdMsg} title={feld(a, 'nachricht', 'message')}>{feld(a, 'nachricht', 'message') || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={styles.info}>
            Diese Liste ist deine zentrale Eingangsstelle für alle Website-Leads — komplett autark, ohne n8n. Jede neue Anfrage landet hier <b style={{ color: C.text }}>und</b> parallel als E-Mail in deinem Postfach (info@argonaut-os.com). Eine Antwort auf diese E-Mail geht direkt an den Interessenten.
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1120, margin: '0 auto', padding: 'clamp(1rem, 3vw, 2.5rem)', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', minHeight: '100vh', background: C.navy },
  kopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' },
  back: { fontSize: 13, color: C.textDim, textDecoration: 'none' },
  sub: { color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 18px', maxWidth: 820 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  kLabel: { color: C.textDim, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kWert: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 30, fontWeight: 700, lineHeight: 1.1, marginTop: 6 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 10 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' },
  tdNo: { padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', whiteSpace: 'nowrap' },
  tdMsg: { padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  link: { color: C.cyan, textDecoration: 'none' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 6 },
  info: { marginTop: 18, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', color: C.textDim, fontSize: 12.5, lineHeight: 1.55 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
};
