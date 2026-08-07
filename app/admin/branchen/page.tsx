'use client';

// ============================================================================
// ARGONAUT OS · app/admin/branchen/page.tsx  (Control-Room · Branchen-Katalog)
//
// OPERATOR-Sicht: alle 698 Branchen nach 19 Kategorien. Je Branche das fertige
// Paket (Kategorie-Modul-Set + branchentypisches Wording + Standard-Automation).
// Ein Klick → Kunde einladen: E-Mail-Login raus, Kunde setzt Passwort, ist sofort
// online mit genau diesem Branchen-Set (tenant_module scharf).
//
// Liegt unter /admin -> hinter dem Admin-Schloss (app/admin/layout.tsx).
// Datenquelle Branchen/Wording: app/vorschau/_lib/branchen-web (dieselbe wie die
// Website). Modul-Set: lib/branchenkatalog (Kategorie → Module). Einladen:
// bestehende Route /api/admin/kunde-einladen (um module/branche/kategorie erweitert).
// Tron-Look passend zu Tenants & Command-Center.
// ============================================================================

import { useMemo, useState } from 'react';
import { websiteKategorien, type WebBranche } from '../../vorschau/_lib/branchen-web';
import { kategorieModule, kategorieZusatz } from '../../../lib/branchenkatalog';
import { ALLE_MODULE } from '../../../lib/rechte';

const CYAN = '#00e5ff';
const GOLD = '#C9A84C';
const GRUEN = '#4CAF7D';
const mono = "var(--font-dm-sans), system-ui, sans-serif";

const LABEL: Record<string, string> = Object.fromEntries(ALLE_MODULE.map((m) => [m.key, m.label]));
LABEL['automatisierungen'] = LABEL['automatisierungen'] || '⚙️ Automatisierungen';
function modLabel(key: string): string { return LABEL[key] ?? key; }

type Sel = { name: string; kategorie: string; slug: string } | null;

export default function AdminBranchen() {
  const kategorien = useMemo(() => websiteKategorien(), []);
  const gesamt = useMemo(() => kategorien.reduce((s, k) => s + k.branchen.length, 0), [kategorien]);

  const [q, setQ] = useState('');
  const [offeneKat, setOffeneKat] = useState<Set<string>>(new Set());
  const [offeneBranche, setOffeneBranche] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(null);

  const [email, setEmail] = useState('');
  const [firma, setFirma] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const suche = q.trim().toLowerCase();
  const gefiltert = useMemo(() => {
    if (!suche) return kategorien;
    return kategorien
      .map((k) => ({ kategorie: k.kategorie, branchen: k.branchen.filter((b) => b.name.toLowerCase().includes(suche)) }))
      .filter((k) => k.branchen.length > 0);
  }, [kategorien, suche]);

  function katOffen(kat: string): boolean { return Boolean(suche) || offeneKat.has(kat); }
  function toggleKat(kat: string) {
    setOffeneKat((s) => { const n = new Set(s); if (n.has(kat)) n.delete(kat); else n.add(kat); return n; });
  }

  function waehlen(b: WebBranche) {
    setSel({ name: b.name, kategorie: b.kategorie, slug: b.slug });
    setMeldung(null); setFehler(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function einladen() {
    setFehler(null); setMeldung(null);
    if (!sel) { setFehler('Bitte zuerst unten eine Branche wählen.'); return; }
    if (!email.trim()) { setFehler('Bitte eine E-Mail angeben.'); return; }
    setLaeuft(true);
    try {
      const res = await fetch('/api/admin/kunde-einladen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(), firma: firma.trim(),
          module: kategorieModule(sel.kategorie), branche: sel.name, kategorie: sel.kategorie,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) { setFehler(json.error || 'Einladung fehlgeschlagen.'); }
      else {
        const mailHinweis = json.mailVersandt ? 'Einladungs-Mail verschickt.' : `angelegt, aber Mail-Fehler: ${json.mailFehler || 'unbekannt'}`;
        setMeldung(`✓ ${email.trim()} eingeladen · Branche „${sel.name}" (${json.freigeschaltet ?? kategorieModule(sel.kategorie).length} Module scharf). ${mailHinweis}`);
        setEmail(''); setFirma('');
      }
    } catch { setFehler('Netzwerkfehler bei der Einladung.'); }
    finally { setLaeuft(false); }
  }

  const feldInput: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(201,168,76,0.16)`, borderRadius: 14, padding: '10px 12px', color: '#E8EDF4', fontSize: 14, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', outline: 'none', boxSizing: 'border-box', width: '100%' };
  const feldLabel: React.CSSProperties = { fontFamily: mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' };

  const selModule = sel ? kategorieModule(sel.kategorie) : [];
  const selZusatz = sel ? kategorieZusatz(sel.kategorie) : [];

  return (
    <main style={{ minHeight: '100vh', background: '#0A1628', color: '#E8EDF4', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: '32px 28px' }}>
      {/* Kopf */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', fontFamily: mono }}>ARGONAUT · OPERATOR</div>
          <h1 style={{ fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)', fontWeight: 700, margin: '4px 0 0', letterSpacing: '-0.01em', color: '#E8EDF4', fontFamily: 'var(--font-syne), sans-serif' }}>Branchen-Katalog</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href="/admin/tenants" style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', border: `1px solid rgba(201,168,76,0.16)`, borderRadius: 14, padding: '8px 16px', textDecoration: 'none', background: 'rgba(255,255,255,0.04)' }}>TENANTS</a>
          <a href="/admin/command-center" style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', border: `1px solid rgba(201,168,76,0.16)`, borderRadius: 14, padding: '8px 16px', textDecoration: 'none', background: 'rgba(255,255,255,0.04)' }}>COMMAND CENTER</a>
        </div>
      </div>

      {/* Einlade-Panel (ausgewählte Branche) */}
      <section style={{ border: `1px solid rgba(201,168,76,0.16)`, background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '18px 20px', marginBottom: 18 }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 12 }}>
          ＋ Kunde einladen — mit Branchen-Paket
        </div>
        {!sel ? (
          <div style={{ fontFamily: mono, fontSize: 12.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
            Unten eine Branche wählen (Knopf „Wählen"). Dann E-Mail eintragen → der Kunde bekommt seinen Login, setzt sein Passwort selbst und ist sofort mit genau diesem Branchen-Set online.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 700, fontSize: 16, color: '#E8EDF4' }}>{sel.name}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: `${CYAN}cc`, border: `1px solid ${CYAN}44`, borderRadius: 999, padding: '2px 10px' }}>{sel.kategorie}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: GRUEN }}>{selModule.length} Module scharf</span>
              <button onClick={() => setSel(null)} style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 11, color: 'rgba(255,255,255,0.45)', background: 'transparent', border: `1px solid rgba(201,168,76,0.16)`, borderRadius: 14, padding: '4px 10px', cursor: 'pointer' }}>abwählen</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {selZusatz.map((k) => <span key={k} style={{ fontFamily: mono, fontSize: 10.5, color: '#E8EDF4', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.16)', borderRadius: 14, padding: '3px 8px' }}>{modLabel(k)}</span>)}
              <span style={{ fontFamily: mono, fontSize: 10.5, color: `${GOLD}cc` }}>+ 12 Kernbausteine</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 230px' }}>
                <label style={feldLabel}>E-Mail *</label>
                <input style={feldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kunde@firma.de" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 190px' }}>
                <label style={feldLabel}>Firma</label>
                <input style={feldInput} value={firma} onChange={(e) => setFirma(e.target.value)} placeholder="Musterbetrieb GmbH" />
              </div>
              <button onClick={einladen} disabled={laeuft} style={{ border: `1px solid ${GOLD}`, background: GOLD, color: '#0A1628', fontFamily: 'var(--font-syne), sans-serif', fontSize: 14, fontWeight: 700, padding: '11px 20px', borderRadius: 14, cursor: laeuft ? 'wait' : 'pointer', opacity: laeuft ? 0.55 : 1 }}>
                {laeuft ? 'lädt …' : 'Einladen & freischalten'}
              </button>
            </div>
          </>
        )}
        {meldung && <div style={{ marginTop: 12, fontFamily: mono, fontSize: 13, color: GRUEN, lineHeight: 1.5 }}>{meldung}</div>}
        {fehler && <div style={{ marginTop: 12, fontFamily: mono, fontSize: 13, color: '#e0a066' }}>{fehler}</div>}
      </section>

      {/* Suche + Summe */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <input style={{ ...feldInput, maxWidth: 340 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Branche suchen …" />
        <span style={{ fontFamily: mono, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
          <span style={{ color: GOLD, fontWeight: 700, fontFamily: 'var(--font-syne), sans-serif' }}>{gesamt}</span> Branchen · <span style={{ color: GOLD, fontWeight: 700, fontFamily: 'var(--font-syne), sans-serif' }}>{kategorien.length}</span> Kategorien
        </span>
      </div>

      {/* Kategorien */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gefiltert.map((k) => {
          const auf = katOffen(k.kategorie);
          const zusatz = kategorieZusatz(k.kategorie);
          return (
            <div key={k.kategorie} style={{ border: `1px solid rgba(201,168,76,0.16)`, borderRadius: 16, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
              <div onClick={() => toggleKat(k.kategorie)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', background: auf ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
                <span style={{ color: CYAN, fontFamily: mono }}>{auf ? '▾' : '▸'}</span>
                <span style={{ fontWeight: 700, color: GOLD, fontSize: 15, fontFamily: 'var(--font-syne), sans-serif' }}>{k.kategorie}</span>
                <span style={{ fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{k.branchen.length} Branchen</span>
                <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Set: {kategorieModule(k.kategorie).length} Module</span>
              </div>

              {auf && (
                <div style={{ padding: '4px 18px 18px' }}>
                  {/* Modul-Set der Kategorie (einmal) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 14px' }}>
                    <span style={{ fontFamily: mono, fontSize: 10.5, color: `${GOLD}cc`, marginRight: 4 }}>PAKET:</span>
                    <span style={{ fontFamily: mono, fontSize: 10.5, color: `${GOLD}cc` }}>12 Kern</span>
                    {zusatz.map((m) => <span key={m} style={{ fontFamily: mono, fontSize: 10.5, color: '#E8EDF4', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.16)', borderRadius: 14, padding: '2px 7px' }}>{modLabel(m)}</span>)}
                  </div>

                  {/* Branchen */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {k.branchen.map((b) => {
                      const bAuf = offeneBranche === b.slug;
                      const gewaehlt = sel?.slug === b.slug;
                      return (
                        <div key={b.slug} style={{ border: `1px solid ${gewaehlt ? `${GRUEN}66` : 'rgba(201,168,76,0.16)'}`, borderRadius: 14, background: gewaehlt ? `${GRUEN}0e` : 'rgba(255,255,255,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: '#E8EDF4' }}>{b.name}</span>
                            <button onClick={() => setOffeneBranche(bAuf ? null : b.slug)} style={{ fontFamily: mono, fontSize: 11, color: `${CYAN}cc`, background: 'transparent', border: `1px solid ${CYAN}44`, borderRadius: 14, padding: '3px 9px', cursor: 'pointer' }}>{bAuf ? '▾ Wording' : '▸ Wording'}</button>
                            <button onClick={() => waehlen(b)} style={{ marginLeft: 'auto', fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 12.5, color: gewaehlt ? '#0A1628' : '#E8EDF4', background: gewaehlt ? GRUEN : 'rgba(255,255,255,0.04)', border: `1px solid ${GRUEN}88`, borderRadius: 14, padding: '6px 14px', cursor: 'pointer' }}>{gewaehlt ? '✓ gewählt' : 'Wählen'}</button>
                          </div>
                          {bAuf && (
                            <div style={{ padding: '2px 14px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                              <div>
                                <div style={{ fontFamily: mono, fontSize: 10.5, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', marginBottom: 4 }}>SCHMERZEN</div>
                                {(b.schmerzen || []).map((s, i) => <div key={i} style={{ fontSize: 12.5, color: '#E8EDF4', lineHeight: 1.5 }}>• {s}</div>)}
                              </div>
                              <div>
                                <div style={{ fontFamily: mono, fontSize: 10.5, color: GRUEN, letterSpacing: '0.06em', marginBottom: 4 }}>ERGEBNISSE</div>
                                {(b.ergebnisse || []).map((s, i) => <div key={i} style={{ fontSize: 12.5, color: '#E8EDF4', lineHeight: 1.5 }}>✓ {s}</div>)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 18, fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,0.45)', maxWidth: 820, lineHeight: 1.6 }}>
        Ein Modul-Set je Kategorie, Wording je Branche. Wählen → Einladen → der Kunde ist sofort online mit genau diesem Set (Kern + Branchenmodule + Standard-Automation). Feinschliff je Kunde weiter unter „Tenants".
      </p>
    </main>
  );
}
