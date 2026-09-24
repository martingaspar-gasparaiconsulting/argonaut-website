'use client';

// ============================================================
// ARGONAUT OS · Paket PN · Kunden-Portal plus (öffentlich, ohne Login)
// Baufortschritt, Fotos, Dokumente, Freigaben, „Monteur ist unterwegs".
// Liest nur über /api/oeffentlich/portal/baustelle (Token, Service-Key,
// hart gefiltert). Antwortet der Endpunkt nicht, erscheint dieser Teil
// einfach nicht — das übrige Portal läuft unverändert weiter.
// ============================================================

import { useCallback, useEffect, useState, CSSProperties } from 'react';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#c9a84c', text: '#EAF1F6', cyan: '#00e5ff',
  textDim: '#9fb3bd', border: 'rgba(122,163,179,0.18)', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C',
};

type Meldung = { text: string; datum: string; fortschritt: number | null };
type Projekt = { id: string; name: string; fortschritt: number | null; meldungen: Meldung[]; fotos: { url: string; datum: string | null }[] };
type Dokument = { titel: string; datum: string | null; url: string };
type Freigabe = {
  id: string; titel: string; text: string; frist: string | null; frist_abgelaufen: boolean; status: string; status_text: string;
  antwort_name: string | null; antwort_kommentar: string | null; beantwortet_am: string | null;
};
type Daten = { projekte: Projekt[]; allgemein: Meldung[]; dokumente: Dokument[]; freigaben: Freigabe[]; monteur: { art: string; satz: string } | null };

function datum(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

export default function PortalBaustelle({ token }: { token: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [gross, setGross] = useState<string | null>(null);
  const [antwort, setAntwort] = useState<Record<string, { name: string; kommentar: string; busy?: boolean; fehler?: string | null }>>({});

  const laden = useCallback(async () => {
    try {
      const res = await fetch(`/api/oeffentlich/portal/baustelle?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      setD({
        projekte: Array.isArray(j.projekte) ? j.projekte : [],
        allgemein: Array.isArray(j.allgemein) ? j.allgemein : [],
        dokumente: Array.isArray(j.dokumente) ? j.dokumente : [],
        freigaben: Array.isArray(j.freigaben) ? j.freigaben : [],
        monteur: j.monteur ?? null,
      });
    } catch { /* still: Teil erscheint nicht */ }
  }, [token]);

  useEffect(() => { if (token) void laden(); }, [token, laden]);

  // Monteur-Status alle 2 Minuten auffrischen, solange die Seite offen ist
  useEffect(() => {
    if (!d?.monteur || (d.monteur.art !== 'unterwegs' && d.monteur.art !== 'heute')) return;
    const t = setInterval(() => { void laden(); }, 120_000);
    return () => clearInterval(t);
  }, [d?.monteur, laden]);

  async function entscheiden(f: Freigabe, entscheidung: 'freigegeben' | 'abgelehnt') {
    const a = antwort[f.id] ?? { name: '', kommentar: '' };
    setAntwort((x) => ({ ...x, [f.id]: { ...a, busy: true, fehler: null } }));
    try {
      const res = await fetch('/api/oeffentlich/portal/freigabe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, id: f.id, entscheidung, name: a.name, kommentar: a.kommentar }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setAntwort((x) => ({ ...x, [f.id]: { ...a, busy: false, fehler: j?.error || 'Das hat nicht geklappt.' } })); return; }
      await laden();
    } catch {
      setAntwort((x) => ({ ...x, [f.id]: { ...a, busy: false, fehler: 'Keine Verbindung — bitte erneut versuchen.' } }));
    }
  }

  if (!d) return null;
  const leer = !d.monteur && d.projekte.length === 0 && d.allgemein.length === 0 && d.dokumente.length === 0 && d.freigaben.length === 0;
  if (leer) return null;

  const offene = d.freigaben.filter((f) => f.status === 'offen');
  const erledigte = d.freigaben.filter((f) => f.status !== 'offen');

  return (
    <>
      {d.monteur && (
        <div style={{ ...s.card, borderColor: d.monteur.art === 'unterwegs' ? C.cyan : C.border }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 30 }}>{d.monteur.art === 'unterwegs' ? '🚐' : d.monteur.art === 'vor_ort' ? '🔧' : d.monteur.art === 'erledigt' ? '✅' : '🗓'}</span>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{d.monteur.satz}</div>
          </div>
        </div>
      )}

      {offene.length > 0 && (
        <div style={{ ...s.card, borderColor: C.warn }}>
          <h2 style={s.h2}>✍️ Bitte um Ihre Freigabe</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {offene.map((f) => {
              const a = antwort[f.id] ?? { name: '', kommentar: '' };
              return (
                <div key={f.id} style={s.zeile}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{f.titel}</div>
                  <div style={{ whiteSpace: 'pre-wrap', color: C.text, lineHeight: 1.5, margin: '6px 0' }}>{f.text}</div>
                  {f.frist && <div style={{ color: f.frist_abgelaufen ? C.danger : C.textDim, fontSize: 13 }}>Bitte bis {datum(f.frist)}{f.frist_abgelaufen ? ' — Frist abgelaufen, eine Antwort ist trotzdem möglich' : ''}</div>}
                  <input value={a.name} onChange={(e) => setAntwort((x) => ({ ...x, [f.id]: { ...a, name: e.target.value } }))} placeholder="Ihr Name" style={s.feld} maxLength={120} />
                  <textarea value={a.kommentar} onChange={(e) => setAntwort((x) => ({ ...x, [f.id]: { ...a, kommentar: e.target.value } }))} placeholder="Anmerkung (bei Ablehnung bitte den Grund)" rows={2} style={s.feld} maxLength={1000} />
                  {a.fehler && <div style={{ color: C.danger, fontSize: 14 }}>{a.fehler}</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <button disabled={a.busy} style={{ ...s.knopf, background: C.green, color: C.navy }} onClick={() => entscheiden(f, 'freigegeben')}>Freigeben</button>
                    <button disabled={a.busy} style={{ ...s.knopf, background: 'transparent', color: C.danger, border: `1px solid ${C.danger}` }} onClick={() => entscheiden(f, 'abgelehnt')}>Ablehnen</button>
                  </div>
                  <div style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>Ihre Entscheidung wird mit Ihrem Namen und der Uhrzeit an den Betrieb übermittelt.</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(d.projekte.length > 0 || d.allgemein.length > 0) && (
        <div style={s.card}>
          <h2 style={s.h2}>🏗 Baufortschritt</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {d.projekte.map((p) => (
              <div key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</div>
                  {p.fortschritt !== null && <div style={{ color: C.gold, fontWeight: 800 }}>{p.fortschritt} %</div>}
                </div>
                {p.fortschritt !== null && (
                  <div style={{ height: 8, background: C.navy, borderRadius: 99, marginTop: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                    <div style={{ width: `${p.fortschritt}%`, height: '100%', background: C.gold }} />
                  </div>
                )}
                {p.meldungen.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.meldungen.slice(0, 5).map((m, i) => (
                      <div key={i} style={{ borderLeft: `3px solid ${C.gold}`, paddingLeft: 10 }}>
                        <div style={{ color: C.textDim, fontSize: 12 }}>{datum(m.datum)}</div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                {p.fotos.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 10 }}>
                    {p.fotos.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={f.url} alt={`Baustellenfoto ${datum(f.datum)}`} onClick={() => setGross(f.url)}
                        style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, cursor: 'zoom-in', border: `1px solid ${C.border}` }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {d.allgemein.map((m, i) => (
              <div key={`a${i}`} style={{ borderLeft: `3px solid ${C.gold}`, paddingLeft: 10 }}>
                <div style={{ color: C.textDim, fontSize: 12 }}>{datum(m.datum)}</div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.dokumente.length > 0 && (
        <div style={s.card}>
          <h2 style={s.h2}>📎 Ihre Dokumente</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.dokumente.map((dok, i) => (
              <a key={i} href={dok.url} target="_blank" rel="noreferrer" style={{ ...s.zeile, textDecoration: 'none', color: C.text, flexDirection: 'row', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>{dok.titel}</span>
                <span style={{ color: C.gold, fontSize: 13 }}>{datum(dok.datum)} · öffnen</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {erledigte.length > 0 && (
        <div style={s.card}>
          <h2 style={s.h2}>🗂 Ihre bisherigen Entscheidungen</h2>
          {erledigte.map((f) => (
            <div key={f.id} style={{ ...s.zeile, marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{f.titel}</div>
              <div style={{ color: f.status === 'freigegeben' ? C.green : C.danger, fontSize: 14 }}>
                {f.status_text}{f.antwort_name ? ` von ${f.antwort_name}` : ''}{f.beantwortet_am ? ` am ${datum(f.beantwortet_am)}` : ''}
              </div>
              {f.antwort_kommentar && <div style={{ color: C.textDim, fontSize: 14 }}>„{f.antwort_kommentar}"</div>}
            </div>
          ))}
        </div>
      )}

      {gross && (
        <div onClick={() => setGross(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gross} alt="Baustellenfoto groß" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} />
        </div>
      )}
    </>
  );
}

const s: Record<string, CSSProperties> = {
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 19, fontWeight: 700, margin: '0 0 14px' },
  zeile: { display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  feld: { width: '100%', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' },
  knopf: { border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
};
