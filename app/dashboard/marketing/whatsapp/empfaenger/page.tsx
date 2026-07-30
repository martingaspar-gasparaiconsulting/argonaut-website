'use client';

import { useEffect, useState, useMemo } from 'react';
import { zaehleKontakte } from '@/lib/whatsapp';

// ============================================================
// ARGONAUT OS · MARKETING · WhatsApp-Empfänger (Paket 2)
// Öffentliches Opt-in-Formular konfigurieren + Empfänger verwalten.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

type Kontakt = {
  id: string; telefon: string; name: string | null; status: string;
  quelle: string | null; einwilligung_am: string | null; created_at: string;
};

export default function WhatsappEmpfaengerSeite() {
  const [liste, setListe] = useState<Kontakt[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [slug, setSlug] = useState('');
  const [aktiv, setAktiv] = useState(false);
  const [titel, setTitel] = useState('');
  const [text, setText] = useState('');
  const [cfgBusy, setCfgBusy] = useState(false);
  const [cfgMeldung, setCfgMeldung] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  const [nTelefon, setNTelefon] = useState('');
  const [nName, setNName] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addMeldung, setAddMeldung] = useState<string | null>(null);

  async function laden() {
    setLoading(true); setFehler(null);
    try {
      const [rC, rK] = await Promise.all([
        fetch('/api/marketing/whatsapp-optin-einstellungen'),
        fetch('/api/marketing/whatsapp-kontakte'),
      ]);
      const jC = await rC.json();
      const jK = await rK.json();
      if (jC?.ok) { setSlug(jC.whatsapp_optin_slug || ''); setAktiv(!!jC.whatsapp_optin_aktiv); setTitel(jC.whatsapp_optin_titel || ''); setText(jC.whatsapp_optin_text || ''); }
      if (!rK.ok || !jK?.ok) { setFehler(jK?.error || 'Laden fehlgeschlagen.'); }
      else { setListe(jK.liste as Kontakt[]); }
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { laden(); }, []);

  const kpi = useMemo(() => zaehleKontakte(liste), [liste]);
  const link = slug ? `https://argonaut-os.com/whatsapp-anmelden/${slug}` : '';

  async function speichereKonfig() {
    setCfgBusy(true); setCfgMeldung(null);
    try {
      const res = await fetch('/api/marketing/whatsapp-optin-einstellungen', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ whatsapp_optin_slug: slug, whatsapp_optin_aktiv: aktiv, whatsapp_optin_titel: titel, whatsapp_optin_text: text }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setCfgMeldung(j?.error || 'Speichern fehlgeschlagen.'); }
      else { setCfgMeldung('✓ Gespeichert.'); setSlug(j.whatsapp_optin_slug || slug); }
    } catch { setCfgMeldung('Speichern fehlgeschlagen.'); }
    finally { setCfgBusy(false); }
  }

  async function hinzufuegen() {
    if (!nTelefon.trim()) { setAddMeldung('Bitte eine Handynummer eingeben.'); return; }
    setAddBusy(true); setAddMeldung(null);
    try {
      const res = await fetch('/api/marketing/whatsapp-kontakte', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ telefon: nTelefon.trim(), name: nName.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setAddMeldung(j?.error || 'Hinzufügen fehlgeschlagen.'); }
      else { setNTelefon(''); setNName(''); laden(); }
    } catch { setAddMeldung('Hinzufügen fehlgeschlagen.'); }
    finally { setAddBusy(false); }
  }

  async function loeschen(k: Kontakt) {
    if (!confirm(`Empfänger „${k.telefon}" wirklich löschen?`)) return;
    const res = await fetch(`/api/marketing/whatsapp-kontakte?id=${encodeURIComponent(k.id)}`, { method: 'DELETE' });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) { alert('Löschen fehlgeschlagen.'); return; }
    laden();
  }

  async function kopieren() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setKopiert(true); setTimeout(() => setKopiert(false), 2000); } catch { /* ignore */ }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>💬 WhatsApp-Empfänger</h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>Anmeldeformular teilen und Empfänger mit Einwilligung sammeln.</p>
          </div>
          <a href="/dashboard/marketing/whatsapp" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zu WhatsApp</a>
        </div>

        {/* So geht's */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: `1px solid ${C.gold}`, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 8 }}>So geht&apos;s</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 'clamp(14px, 1.2vw, 19px)', lineHeight: 1.6 }}>
            Formular aktivieren → Link teilen (z. B. auf Website, Kassenbon, Flyer). Wer sich einträgt, gibt die <strong style={{ color: '#fff' }}>Einwilligung</strong> für WhatsApp-Nachrichten — nachweisbar mit Zeitpunkt gespeichert. Der eigentliche Versand kommt, sobald Ihr WhatsApp-Zugang verbunden ist.
          </p>
        </div>

        {/* Opt-in-Formular Konfiguration */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 12 }}>Öffentliches Anmeldeformular</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.green }} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff' }}>Formular ist <strong style={{ color: aktiv ? C.green : C.textDim }}>{aktiv ? 'aktiv' : 'inaktiv'}</strong></span>
          </label>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Link-Name</label>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 17px)', padding: '10px 4px 10px 0' }}>argonaut-os.com/whatsapp-anmelden/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mein-shop" style={{ ...input, flex: '1 1 160px', width: 'auto' }} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Überschrift</label>
            <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="WhatsApp-Neuigkeiten erhalten" style={input} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Text</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Angebote und Neuigkeiten direkt per WhatsApp." style={{ ...input, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={speichereKonfig} disabled={cfgBusy} style={{ ...btnGold, opacity: cfgBusy ? 0.7 : 1, cursor: cfgBusy ? 'wait' : 'pointer' }}>{cfgBusy ? 'Speichere…' : 'Speichern'}</button>
            {link && <button onClick={kopieren} style={btn(C.cyan)}>{kopiert ? '✓ Kopiert' : 'Link kopieren'}</button>}
            {link && aktiv && <a href={link} target="_blank" rel="noopener noreferrer" style={{ ...btn(C.textDim), textDecoration: 'none' }}>Vorschau</a>}
            {cfgMeldung && <span style={{ fontFamily: 'DM Sans, sans-serif', color: cfgMeldung.startsWith('✓') ? C.green : C.danger, fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{cfgMeldung}</span>}
          </div>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Empfänger', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Aktiv', wert: kpi.aktiv, farbe: C.green },
          ].map((kp) => (
            <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(34px, 3vw, 48px)', fontWeight: 700, color: kp.farbe }}>{kp.wert}</div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>{kp.label}</div>
            </div>
          ))}
        </div>

        {/* Manuell hinzufügen */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(15px, 1.3vw, 20px)', marginBottom: 10 }}>Empfänger manuell hinzufügen</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={lbl}>Handynummer</label>
              <input value={nTelefon} onChange={(e) => setNTelefon(e.target.value)} placeholder="+49 170 1234567" style={input} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label style={lbl}>Name (optional)</label>
              <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Name" style={input} />
            </div>
            <button onClick={hinzufuegen} disabled={addBusy} style={{ ...btnGold, opacity: addBusy ? 0.7 : 1, cursor: addBusy ? 'wait' : 'pointer' }}>{addBusy ? '…' : 'Hinzufügen'}</button>
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '8px 0 0', fontSize: 'clamp(11px, 1vw, 14px)' }}>Nur Nummern hinzufügen, für die eine Einwilligung vorliegt — die Verantwortung liegt beim Betrieb.</p>
          {addMeldung && <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.danger, margin: '8px 0 0', fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{addMeldung}</p>}
        </div>

        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Empfänger…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : liste.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 'clamp(38px, 4vw, 56px)', marginBottom: 12 }}>📇</div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)', margin: 0 }}>Noch keine Empfänger. Teilen Sie Ihren Anmelde-Link oder fügen Sie oben manuell hinzu.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {liste.map((k) => (
              <div key={k.id} style={{ background: C.navy2, borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(15px, 1.25vw, 19px)' }}>{k.telefon}</span>
                    {k.name && <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim }}>{k.name}</span>}
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(11px, 1vw, 14px)', color: k.status === 'aktiv' ? C.green : C.textDim, border: `1px solid ${k.status === 'aktiv' ? C.green : C.textDim}`, borderRadius: 10, padding: '1px 8px' }}>{k.status === 'aktiv' ? 'Aktiv' : 'Abgemeldet'}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(11px, 1vw, 14px)', color: C.textDim }}>{k.quelle === 'manuell' ? 'manuell' : 'Formular'}</span>
                  </div>
                </div>
                <button onClick={() => loeschen(k)} style={btn(C.danger)}>Löschen</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#8FA3BE', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', background: '#0F1F33', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '10px 12px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)', boxSizing: 'border-box' };
const btnGold: React.CSSProperties = { background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700 };
function btn(farbe: string): React.CSSProperties {
  return { background: 'transparent', color: farbe, border: `1px solid ${farbe}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer' };
}
