'use client';

// ============================================================
// ARGONAUT OS · Welle 2 · Kunde-360°-Akte (Hub)
// EINE Seite je Kontakt mit allem: Umsatz, offene Posten, Rechnungen,
// Angebote, Termine — über kontakt_id bzw. Kunden-E-Mail zusammengezogen.
// Kein neues SQL — liest die vorhandenen Tabellen. Kunden-Suche oben,
// damit die große CRM-Seite unberührt bleibt.
// Pfad: app/dashboard/kunde-akte/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kontakt = { id: string; anzeigename?: string | null; vorname?: string | null; nachname?: string | null; name?: string | null; email?: string | null; telefon?: string | null; firma_name?: string | null };
type Rechnung = { id: string; rechnungsnummer: string | null; titel: string | null; brutto_summe: number; zahlungsstatus: string; rechnungsdatum: string | null; faelligkeitsdatum: string | null; bezahlt_am: string | null };
type Angebot = { id: string; angebotsnummer: string | null; titel: string; brutto_summe: number; status: string; gueltig_bis: string | null };
type Termin = { titel: string | null; beginn_am: string | null; status: string | null };

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function name(k: Kontakt): string {
  if (k.anzeigename && k.anzeigename.trim()) return k.anzeigename.trim();
  const vn = `${k.vorname || ''} ${k.nachname || ''}`.trim();
  if (vn) return vn;
  if (k.name && k.name.trim()) return k.name.trim();
  return (k.email || '(ohne Namen)').trim();
}
function bezahlt(r: Rechnung) { return r.zahlungsstatus === 'bezahlt' || !!r.bezahlt_am; }
function ueberfaellig(r: Rechnung) { return !bezahlt(r) && r.zahlungsstatus !== 'storniert' && r.faelligkeitsdatum != null && new Date(r.faelligkeitsdatum) < new Date(new Date().toDateString()); }

export default function KundeAktePage() {
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState<Kontakt | null>(null);
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [angebote, setAngebote] = useState<Angebot[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [laden, setLaden] = useState(true);
  const [ladenAkte, setLadenAkte] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const { data: kd } = await supabase.from('kontakte').select('*').order('anzeigename', { ascending: true });
      setKontakte((kd as Kontakt[]) ?? []);
      setLaden(false);
    })();
  }, []);

  const akteLaden = useCallback(async (k: Kontakt) => {
    setAktiv(k); setLadenAkte(true);
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from('rechnungen').select('id, rechnungsnummer, titel, brutto_summe, zahlungsstatus, rechnungsdatum, faelligkeitsdatum, bezahlt_am').eq('kontakt_id', k.id).order('rechnungsdatum', { ascending: false }),
      supabase.from('angebote').select('id, angebotsnummer, titel, brutto_summe, status, gueltig_bis').eq('kontakt_id', k.id).order('erstellt_am', { ascending: false }),
    ]);
    setRechnungen((r as Rechnung[]) ?? []);
    setAngebote((a as Angebot[]) ?? []);
    const mail = (k.email || '').trim().toLowerCase();
    if (mail) {
      const { data: t } = await supabase.from('termine').select('titel, beginn_am, status, kunde_email').eq('kunde_email', mail).order('beginn_am', { ascending: false }).limit(30);
      setTermine((t as Termin[]) ?? []);
    } else setTermine([]);
    setLadenAkte(false);
  }, []);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const list = q ? kontakte.filter((k) => name(k).toLowerCase().includes(q) || (k.email || '').toLowerCase().includes(q)) : kontakte;
    return list.slice(0, 40);
  }, [kontakte, suche]);

  const umsatz = rechnungen.filter((r) => r.zahlungsstatus !== 'storniert').reduce((s, r) => s + (Number(r.brutto_summe) || 0), 0);
  const offen = rechnungen.filter((r) => !bezahlt(r) && r.zahlungsstatus !== 'storniert').reduce((s, r) => s + (Number(r.brutto_summe) || 0), 0);
  const naechsterTermin = termine.filter((t) => t.beginn_am && new Date(t.beginn_am) >= new Date()).sort((a, b) => (a.beginn_am || '').localeCompare(b.beginn_am || ''))[0];

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🧭 Kunden-Akte 360°</h1>
      <p style={styles.sub}>Alles zu einem Kunden auf einen Blick — Umsatz, offene Posten, Rechnungen, Angebote und Termine.</p>
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.split}>
        {/* Kunden-Suche links */}
        <div style={styles.spalte}>
          <input style={styles.suche} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="🔎 Kunde suchen …" />
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {gefiltert.map((k) => (
                <button key={k.id} style={{ ...styles.kItem, ...(aktiv?.id === k.id ? styles.kAktiv : {}) }} onClick={() => akteLaden(k)}>
                  <div style={{ fontWeight: 700 }}>{name(k)}</div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{k.email || k.telefon || '—'}</div>
                </button>
              ))}
              {!gefiltert.length && <p style={styles.dim}>Keine Kontakte gefunden.</p>}
            </div>
          )}
        </div>

        {/* Akte rechts */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!aktiv ? (
            <div style={styles.leer}>← Wähle links einen Kunden, um seine 360°-Akte zu öffnen.</div>
          ) : (
            <>
              <div style={styles.head}>
                <div>
                  <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 24, fontWeight: 800 }}>{name(aktiv)}</div>
                  <div style={{ color: C.textDim, fontSize: 14, marginTop: 4 }}>
                    {[aktiv.firma_name, aktiv.email, aktiv.telefon].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              </div>

              {/* KPI-Kacheln */}
              <div style={styles.kpis}>
                <div style={styles.kpi}><div style={styles.kLabel}>Umsatz gesamt</div><div style={styles.kWert}>{eur(umsatz)}</div></div>
                <div style={styles.kpi}><div style={styles.kLabel}>Offener Betrag</div><div style={{ ...styles.kWert, color: offen > 0 ? C.warn : C.green }}>{eur(offen)}</div></div>
                <div style={styles.kpi}><div style={styles.kLabel}>Rechnungen</div><div style={styles.kWert}>{rechnungen.length}</div></div>
                <div style={styles.kpi}><div style={styles.kLabel}>Angebote</div><div style={styles.kWert}>{angebote.length}</div></div>
                <div style={styles.kpi}><div style={styles.kLabel}>Nächster Termin</div><div style={{ ...styles.kWert, fontSize: 16 }}>{naechsterTermin ? d(naechsterTermin.beginn_am) : '—'}</div></div>
              </div>

              {ladenAkte ? <p style={styles.dim}>Lade Akte …</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 6 }}>
                  {/* Offene Posten zuerst */}
                  {rechnungen.some((r) => !bezahlt(r) && r.zahlungsstatus !== 'storniert') && (
                    <Sektion titel="⚠️ Offene Posten">
                      {rechnungen.filter((r) => !bezahlt(r) && r.zahlungsstatus !== 'storniert').map((r) => (
                        <Zeile key={r.id}
                          links={<><strong>{r.rechnungsnummer || '—'}</strong> · {r.titel || 'Rechnung'}</>}
                          mitte={`fällig ${d(r.faelligkeitsdatum)}`}
                          rechts={eur(r.brutto_summe)}
                          badge={ueberfaellig(r) ? { t: 'überfällig', f: C.danger } : { t: 'offen', f: C.warn }} />
                      ))}
                    </Sektion>
                  )}

                  <Sektion titel="🧾 Rechnungen">
                    {rechnungen.length === 0 ? <p style={styles.dim}>Keine Rechnungen.</p> : rechnungen.map((r) => (
                      <Zeile key={r.id}
                        links={<><strong>{r.rechnungsnummer || '—'}</strong> · {r.titel || 'Rechnung'}</>}
                        mitte={d(r.rechnungsdatum)}
                        rechts={eur(r.brutto_summe)}
                        badge={bezahlt(r) ? { t: 'bezahlt', f: C.green } : r.zahlungsstatus === 'storniert' ? { t: 'storniert', f: C.textDim } : { t: 'offen', f: C.warn }} />
                    ))}
                  </Sektion>

                  <Sektion titel="🗒 Angebote">
                    {angebote.length === 0 ? <p style={styles.dim}>Keine Angebote.</p> : angebote.map((a) => (
                      <Zeile key={a.id}
                        links={<><strong>{a.angebotsnummer || '—'}</strong> · {a.titel}</>}
                        mitte={a.gueltig_bis ? `gültig bis ${d(a.gueltig_bis)}` : ''}
                        rechts={eur(a.brutto_summe)}
                        badge={{ t: a.status, f: a.status === 'angenommen' ? C.green : a.status === 'abgelehnt' ? C.danger : C.cyan }} />
                    ))}
                  </Sektion>

                  <Sektion titel="🗓 Termine">
                    {termine.length === 0 ? <p style={styles.dim}>Keine Termine (Match über die Kunden-E-Mail).</p> : termine.map((t, i) => (
                      <Zeile key={i}
                        links={<strong>{t.titel || 'Termin'}</strong>}
                        mitte={d(t.beginn_am)}
                        rechts=""
                        badge={{ t: t.status || 'geplant', f: C.cyan }} />
                    ))}
                  </Sektion>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Sektion({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={styles.card}>
      <div style={styles.sTitel}>{titel}</div>
      <div>{children}</div>
    </div>
  );
}
function Zeile({ links, mitte, rechts, badge }: { links: React.ReactNode; mitte: string; rechts: string; badge: { t: string; f: string } }) {
  return (
    <div style={styles.zeile}>
      <div style={{ flex: 1, minWidth: 0 }}>{links}</div>
      <div style={{ color: C.textDim, fontSize: 13, minWidth: 100, textAlign: 'right' }}>{mitte}</div>
      {rechts && <div style={{ fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{rechts}</div>}
      <span style={{ ...styles.badge, color: badge.f, borderColor: badge.f }}>{badge.t}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1120, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, marginTop: 16, alignItems: 'start' },
  spalte: { display: 'flex', flexDirection: 'column', gap: 10 },
  suche: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', fontSize: 15, fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 620, overflowY: 'auto' },
  kItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  kAktiv: { borderColor: C.gold },
  leer: { color: C.textDim, fontSize: 15, background: C.navy2, border: `1px dashed ${C.border}`, borderRadius: 14, padding: 30, textAlign: 'center' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  kLabel: { color: C.textDim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kWert: { fontSize: 20, fontWeight: 800, marginTop: 3 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 },
  sTitel: { fontWeight: 800, fontSize: 15, marginBottom: 10 },
  zeile: { display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14, flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
