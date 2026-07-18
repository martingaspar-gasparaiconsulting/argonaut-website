'use client';

// ============================================================
// ARGONAUT OS · Bündel 11 · Öffentliches Kunden-Portal (ohne Login)
// /portal/<token> — der Kunde sieht seine eigenen Rechnungen und Termine.
// Liest ausschließlich über /api/oeffentlich/portal (Service-Role, Token).
// Kein Supabase im Browser, keine fremden Daten.
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { useParams } from 'next/navigation';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#c9a84c', text: '#EAF1F6',
  textDim: '#9fb3bd', border: 'rgba(122,163,179,0.18)', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C',
};

type Rechnung = { id: string; nummer: string; titel: string; datum: string | null; faellig: string | null; betrag: number; status: string; bezahlt: boolean };
type Termin = { titel: string; beginn: string | null; ende: string | null; status: string };

// --- Kalender-Helfer: aus einem Termin eine .ics-Datei (Google/Apple/Outlook) ---
function utcStempel(iso: string | null, plusStunden = 0): string {
  const d = iso ? new Date(iso) : new Date();
  if (plusStunden) d.setTime(d.getTime() + plusStunden * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
function icsEscape(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function googleKalenderLink(t: Termin, betrieb: string): string {
  const start = utcStempel(t.beginn);
  const ende = t.ende ? utcStempel(t.ende) : utcStempel(t.beginn, 1);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: t.titel || 'Termin',
    dates: `${start}/${ende}`,
    details: `Termin bei ${betrieb}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
function icsHerunterladen(t: Termin, betrieb: string) {
  const start = utcStempel(t.beginn);
  const ende = t.ende ? utcStempel(t.ende) : utcStempel(t.beginn, 1);
  const uid = `${start}-${Math.abs((t.titel || 'termin').split('').reduce((a, c) => a + c.charCodeAt(0), 0))}@argonaut-os`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ARGONAUT OS//Kundenportal//DE', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcStempel(null)}`, `DTSTART:${start}`, `DTEND:${ende}`,
    `SUMMARY:${icsEscape(t.titel || 'Termin')}`, `DESCRIPTION:${icsEscape('Termin bei ' + betrieb)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Termin-${start.slice(0, 8)}.ics`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function datum(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function uhrzeit(iso: string | null): string {
  if (!iso || !iso.includes('T')) return '';
  const t = iso.split('T')[1] || ''; return t.slice(0, 5);
}

function statusText(r: Rechnung): { label: string; farbe: string } {
  if (r.bezahlt || r.status === 'bezahlt') return { label: 'Bezahlt', farbe: C.green };
  if (r.faellig && new Date(r.faellig) < new Date(new Date().toDateString())) return { label: 'Überfällig', farbe: C.danger };
  return { label: 'Offen', farbe: C.warn };
}

export default function PortalSeite() {
  const params = useParams();
  const token = String((params?.token as string) || '');

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState('');
  const [kunde, setKunde] = useState('');
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/oeffentlich/portal?token=${encodeURIComponent(token)}`);
        const j = await res.json();
        if (!res.ok) { setFehler(j?.error || 'Portal-Link ungültig.'); setLaden(false); return; }
        setBetrieb(j.betrieb || '');
        setKunde(j.kunde || '');
        setRechnungen(Array.isArray(j.rechnungen) ? j.rechnungen : []);
        setTermine(Array.isArray(j.termine) ? j.termine : []);
      } catch {
        setFehler('Verbindung fehlgeschlagen.');
      } finally { setLaden(false); }
    })();
  }, [token]);

  const offeneSumme = rechnungen.filter((r) => !(r.bezahlt || r.status === 'bezahlt')).reduce((s, r) => s + r.betrag, 0);

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.brand}>🔱 {betrieb || 'ARGONAUT OS'}</div>

        {laden ? (
          <div style={styles.card}><p style={styles.sub}>Lädt …</p></div>
        ) : fehler ? (
          <div style={styles.card}><p style={{ ...styles.sub, color: C.danger }}>{fehler}</p></div>
        ) : (
          <>
            <div style={styles.card}>
              <h1 style={styles.h1}>Willkommen{kunde ? <>, <span style={{ color: C.gold }}>{kunde}</span></> : ''}</h1>
              <p style={styles.sub}>Hier finden Sie Ihre Rechnungen und Termine bei {betrieb || 'uns'} — jederzeit, ohne Anmeldung.</p>
              {offeneSumme > 0 && (
                <div style={styles.summe}>Offener Betrag: <strong style={{ color: C.warn }}>{eur(offeneSumme)}</strong></div>
              )}
            </div>

            {/* --- Rechnungen --- */}
            <div style={styles.card}>
              <h2 style={styles.h2}>🧾 Ihre Rechnungen</h2>
              {rechnungen.length === 0 ? (
                <p style={styles.leer}>Aktuell liegen keine Rechnungen für Sie vor.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Nummer</th>
                        <th style={styles.th}>Datum</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Betrag</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Status</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rechnungen.map((r, i) => {
                        const st = statusText(r);
                        return (
                          <tr key={i}>
                            <td style={styles.td}>
                              <div style={{ fontWeight: 700 }}>{r.nummer}</div>
                              <div style={{ color: C.textDim, fontSize: 13 }}>{r.titel}</div>
                            </td>
                            <td style={styles.td}>
                              {datum(r.datum)}
                              {r.faellig && <div style={{ color: C.textDim, fontSize: 13 }}>fällig {datum(r.faellig)}</div>}
                            </td>
                            <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{eur(r.betrag)}</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>
                              <span style={{ ...styles.badge, color: st.farbe, borderColor: st.farbe }}>{st.label}</span>
                            </td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>
                              <a href={`/api/oeffentlich/portal/rechnung?token=${encodeURIComponent(token)}&id=${encodeURIComponent(r.id)}`}
                                target="_blank" rel="noreferrer" style={styles.dl}>⬇ PDF</a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* --- Termine --- */}
            <div style={styles.card}>
              <h2 style={styles.h2}>🗓 Ihre Termine</h2>
              {termine.length === 0 ? (
                <p style={styles.leer}>Aktuell sind keine kommenden Termine hinterlegt.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {termine.map((t, i) => (
                    <div key={i} style={styles.termin}>
                      <div style={styles.terminTag}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{datum(t.beginn)}</div>
                        <div style={{ color: C.gold, fontSize: 13 }}>{uhrzeit(t.beginn)}{uhrzeit(t.ende) ? `–${uhrzeit(t.ende)}` : ''}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{t.titel}</div>
                        <div style={{ color: C.textDim, fontSize: 13 }}>{t.status}</div>
                      </div>
                      <div style={styles.kalBtns}>
                        <button type="button" style={styles.kalBtn} onClick={() => icsHerunterladen(t, betrieb)}>📅 Zum Kalender</button>
                        <a href={googleKalenderLink(t, betrieb)} target="_blank" rel="noreferrer" style={styles.kalBtnGhost}>Google</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div style={styles.footer}>Kundenportal bereitgestellt über ARGONAUT OS</div>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100dvh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: '40px 16px 64px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' },
  wrap: { maxWidth: 720, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 },
  brand: { color: C.gold, letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: 14, fontWeight: 700, textAlign: 'center', marginBottom: 2 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 700, margin: 0, lineHeight: 1.15 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 19, fontWeight: 700, margin: '0 0 14px' },
  sub: { color: C.textDim, fontSize: 'clamp(14px, 1.3vw, 17px)', lineHeight: 1.5, margin: '10px 0 0' },
  summe: { marginTop: 16, padding: '12px 14px', background: 'rgba(224,162,76,0.08)', border: `1px solid ${C.warn}`, borderRadius: 12, fontSize: 16 },
  leer: { color: C.textDim, fontSize: 15, margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 15 },
  th: { textAlign: 'left', color: C.textDim, fontWeight: 600, fontSize: 13, padding: '0 12px 10px', borderBottom: `1px solid ${C.border}` },
  td: { padding: '12px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 12px', fontSize: 13, fontWeight: 700 },
  termin: { display: 'flex', gap: 14, alignItems: 'center', padding: '12px 14px', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, flexWrap: 'wrap' },
  terminTag: { minWidth: 96, textAlign: 'center', borderRight: `1px solid ${C.border}`, paddingRight: 12 },
  kalBtns: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  kalBtn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  kalBtnGhost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 700, textDecoration: 'none' },
  dl: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' },
  footer: { marginTop: 12, textAlign: 'center', color: C.textDim, fontSize: 12, opacity: 0.7 },
};
