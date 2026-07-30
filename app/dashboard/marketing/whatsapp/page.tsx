'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  WHATSAPP_ANBIETER, WHATSAPP_KATEGORIEN, anbieterFuer, zaehleVorlagen,
  platzhalterFinden, vorschauMitBeispiel, vorlagenNameNormalisieren,
} from '@/lib/whatsapp';

// ============================================================
// ARGONAUT OS · MARKETING · WhatsApp (Paket 1 · Fundament)
// Transparenz-Box (Kosten) + Anbieter-Einstellung + Vorlagen-Verwaltung.
// Versand + Opt-in kommen in Paket 2, sobald der Zugang hinterlegt ist.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

type Vorlage = {
  id: string; name: string; kategorie: string; sprache: string;
  inhalt: string; status: string; created_at: string;
};

export default function WhatsappSeite() {
  const [infoOffen, setInfoOffen] = useState(false);

  const [anbieter, setAnbieter] = useState<string>('');
  const [absender, setAbsender] = useState('');
  const [einstBusy, setEinstBusy] = useState(false);
  const [einstMeldung, setEinstMeldung] = useState<string | null>(null);

  const [liste, setListe] = useState<Vorlage[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [editOffen, setEditOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eKategorie, setEKategorie] = useState('marketing');
  const [eInhalt, setEInhalt] = useState('');
  const [eBusy, setEBusy] = useState(false);
  const [eMeldung, setEMeldung] = useState<string | null>(null);

  // Verbindung (P3a)
  const [vVerbunden, setVVerbunden] = useState(false);
  const [vHatToken, setVHatToken] = useState(false);
  const [vPhoneId, setVPhoneId] = useState('');
  const [vToken, setVToken] = useState('');
  const [vEncKey, setVEncKey] = useState(true);
  const [vBusy, setVBusy] = useState(false);
  const [vMeldung, setVMeldung] = useState<string | null>(null);

  // Versand (P3b)
  const [aktiveEmpfaenger, setAktiveEmpfaenger] = useState(0);
  const [sendBusyId, setSendBusyId] = useState<string | null>(null);
  const [sendMeldung, setSendMeldung] = useState<string | null>(null);

  async function laden() {
    setLoading(true); setFehler(null);
    try {
      const [rE, rV, rB, rK] = await Promise.all([
        fetch('/api/marketing/whatsapp-einstellungen'),
        fetch('/api/marketing/whatsapp-vorlagen'),
        fetch('/api/marketing/whatsapp-verbindung'),
        fetch('/api/marketing/whatsapp-kontakte'),
      ]);
      const jE = await rE.json();
      const jV = await rV.json();
      const jB = await rB.json();
      const jK = await rK.json();
      if (jE?.ok) { setAnbieter(jE.anbieter || ''); setAbsender(jE.absender || ''); }
      if (jB?.ok) { setVVerbunden(!!jB.verbunden); setVHatToken(!!jB.hatToken); setVPhoneId(jB.meta_phone_number_id || ''); setVEncKey(jB.encKeyBereit !== false); setVToken(''); }
      if (jK?.ok) { setAktiveEmpfaenger((jK.liste as { status?: string }[]).filter((k) => k?.status === 'aktiv').length); }
      if (!rV.ok || !jV?.ok) { setFehler(jV?.error || 'Laden fehlgeschlagen.'); }
      else { setListe(jV.liste as Vorlage[]); }
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { laden(); }, []);

  async function sendeVorlage(v: Vorlage) {
    if (!vVerbunden) { setSendMeldung('Bitte zuerst die Verbindung oben herstellen.'); return; }
    if (aktiveEmpfaenger === 0) { setSendMeldung('Noch keine aktiven Empfänger — bitte zuerst unter „Empfänger" sammeln.'); return; }
    if (!confirm(`Vorlage „${v.name}" jetzt an ${aktiveEmpfaenger} aktive Empfänger senden?`)) return;
    setSendBusyId(v.id); setSendMeldung(null);
    try {
      const res = await fetch('/api/marketing/whatsapp-senden', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vorlage_id: v.id }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setSendMeldung(j?.error || 'Versand fehlgeschlagen.'); }
      else { setSendMeldung(`✓ Versand gestartet: ${j.gesendet} gesendet${j.fehler ? `, ${j.fehler} fehlgeschlagen` : ''} (von ${j.empfaenger}).`); }
    } catch { setSendMeldung('Versand fehlgeschlagen.'); }
    finally { setSendBusyId(null); }
  }

  async function speichereVerbindung() {
    setVBusy(true); setVMeldung(null);
    try {
      const res = await fetch('/api/marketing/whatsapp-verbindung', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: vToken, meta_phone_number_id: vPhoneId }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setVMeldung(j?.error || 'Speichern fehlgeschlagen.'); }
      else { setVMeldung('✓ Verbunden.'); laden(); }
    } catch { setVMeldung('Speichern fehlgeschlagen.'); }
    finally { setVBusy(false); }
  }
  async function trenneVerbindung() {
    if (!confirm('Verbindung wirklich trennen? Der gespeicherte Zugang wird entfernt.')) return;
    setVBusy(true); setVMeldung(null);
    try {
      const res = await fetch('/api/marketing/whatsapp-verbindung', { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setVMeldung(j?.error || 'Trennen fehlgeschlagen.'); }
      else { setVMeldung(null); laden(); }
    } catch { setVMeldung('Trennen fehlgeschlagen.'); }
    finally { setVBusy(false); }
  }

  const kpi = useMemo(() => zaehleVorlagen(liste), [liste]);
  const platzhalter = useMemo(() => platzhalterFinden(eInhalt), [eInhalt]);
  const vorschau = useMemo(() => vorschauMitBeispiel(eInhalt, []), [eInhalt]);

  async function speichereEinstellungen() {
    setEinstBusy(true); setEinstMeldung(null);
    try {
      const res = await fetch('/api/marketing/whatsapp-einstellungen', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ anbieter, absender }),
      });
      const j = await res.json();
      setEinstMeldung(!res.ok || !j?.ok ? (j?.error || 'Speichern fehlgeschlagen.') : '✓ Gespeichert.');
    } catch { setEinstMeldung('Speichern fehlgeschlagen.'); }
    finally { setEinstBusy(false); }
  }

  function neueVorlage() {
    setEditId(null); setEName(''); setEKategorie('marketing'); setEInhalt(''); setEMeldung(null); setEditOffen(true);
  }
  function bearbeiten(v: Vorlage) {
    setEditId(v.id); setEName(v.name); setEKategorie(v.kategorie); setEInhalt(v.inhalt); setEMeldung(null); setEditOffen(true);
  }
  async function speichereVorlage() {
    setEBusy(true); setEMeldung(null);
    try {
      const res = await fetch('/api/marketing/whatsapp-vorlagen', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: editId, name: eName, kategorie: eKategorie, inhalt: eInhalt, sprache: 'de' }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) { setEMeldung(j?.error || 'Speichern fehlgeschlagen.'); }
      else { setEditOffen(false); laden(); }
    } catch { setEMeldung('Speichern fehlgeschlagen.'); }
    finally { setEBusy(false); }
  }
  async function loeschen(v: Vorlage) {
    if (!confirm(`Vorlage „${v.name}" wirklich löschen?`)) return;
    const res = await fetch(`/api/marketing/whatsapp-vorlagen?id=${encodeURIComponent(v.id)}`, { method: 'DELETE' });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) { alert('Löschen fehlgeschlagen.'); return; }
    laden();
  }

  const gewaehlt = anbieterFuer(anbieter);

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              💬 WhatsApp
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Nachrichten-Vorlagen anlegen und Ihren WhatsApp-Zugang einrichten.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/dashboard/marketing" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zum Marketing</a>
            <a href="/dashboard/marketing/whatsapp/empfaenger" style={{ background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, textDecoration: 'none' }}>👥 Empfänger</a>
            <button onClick={neueVorlage} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)', cursor: 'pointer' }}>+ Neue Vorlage</button>
          </div>
        </div>

        {/* Transparenz-Box: Info & Preise (aufklappbar) */}
        <div style={{ background: C.navy2, borderRadius: 14, border: `1px solid ${C.cyan}`, marginBottom: 16, overflow: 'hidden' }}>
          <button
            onClick={() => setInfoOffen((o) => !o)}
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', color: '#fff', fontFamily: 'var(--font-dm-sans), sans-serif' }}
          >
            <span style={{ fontWeight: 700, color: C.cyan, fontSize: 'clamp(15px, 1.35vw, 21px)' }}>ℹ️ Info &amp; Preise — was WhatsApp kostet</span>
            <span style={{ color: C.cyan, fontSize: 20 }}>{infoOffen ? '▲' : '▼'}</span>
          </button>
          {infoOffen && (
            <div style={{ padding: '0 22px 20px', fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.15vw, 18px)', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                WhatsApp läuft — anders als E-Mail — über einen <strong style={{ color: '#fff' }}>externen Partner</strong>. Die dort anfallenden Gebühren
                sind <strong style={{ color: '#fff' }}>nicht in ARGONAUT enthalten</strong> und werden direkt vom jeweiligen Anbieter abgerechnet. Sie haben zwei Wege:
              </p>
              {WHATSAPP_ANBIETER.map((a) => (
                <div key={a.id} style={{ background: C.navy, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>{a.name}</div>
                  <div style={{ marginBottom: 6 }}>{a.setupHinweis}</div>
                  <div style={{ color: C.gold }}>💶 {a.kostenKurz}</div>
                  <a href={a.link} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, fontSize: 'clamp(12px, 1vw, 15px)' }}>Aktuelle Preise ansehen ↗</a>
                </div>
              ))}
              <p style={{ marginBottom: 0, fontSize: 'clamp(12px, 1.05vw, 16px)' }}>
                Zusätzlich gilt: WhatsApp-Marketing braucht die <strong style={{ color: '#fff' }}>ausdrückliche Einwilligung</strong> der Empfänger und
                von Meta <strong style={{ color: '#fff' }}>vorab freigegebene Vorlagen</strong>. Die genauen Preise legen Meta bzw. 360dialog fest und können sich ändern (Stand: 07/2026).
              </p>
            </div>
          )}
        </div>

        {/* So geht's */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: `1px solid ${C.gold}`, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 8 }}>So geht&apos;s</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 'clamp(14px, 1.2vw, 19px)', lineHeight: 1.6 }}>
            1. Anbieter wählen und Ihre WhatsApp-Nummer eintragen. 2. Nachrichten-Vorlagen anlegen (mit Platzhaltern wie <strong style={{ color: '#fff' }}>{'{{1}}'}</strong> für den Namen).
            Der Versand an Ihre Empfänger folgt im nächsten Schritt, sobald Ihr WhatsApp-Zugang verbunden ist.
          </p>
        </div>

        {/* Anbieter-Einstellung */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 12 }}>WhatsApp-Zugang</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
            {WHATSAPP_ANBIETER.map((a) => (
              <button
                key={a.id}
                onClick={() => setAnbieter(a.id)}
                style={{ textAlign: 'left', background: C.navy, border: `1px solid ${anbieter === a.id ? C.green : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', color: '#fff' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700 }}>{a.name}</span>
                  {anbieter === a.id && <span style={{ color: C.green, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(12px, 1vw, 15px)', marginTop: 4 }}>{a.kurz}</div>
              </button>
            ))}
          </div>
          {gewaehlt && (
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 12px', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>{gewaehlt.setupHinweis}</p>
          )}
          <label style={lbl}>Ihre WhatsApp-Business-Nummer</label>
          <input value={absender} onChange={(e) => setAbsender(e.target.value)} placeholder="+49 170 1234567" style={{ ...input, maxWidth: 320 }} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={speichereEinstellungen} disabled={einstBusy} style={{ ...btnGold, opacity: einstBusy ? 0.7 : 1, cursor: einstBusy ? 'wait' : 'pointer' }}>{einstBusy ? 'Speichere…' : 'Zugang speichern'}</button>
            {einstMeldung && <span style={{ fontFamily: 'DM Sans, sans-serif', color: einstMeldung.startsWith('✓') ? C.green : C.danger, fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{einstMeldung}</span>}
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '12px 0 0', fontSize: 'clamp(11px, 1vw, 14px)' }}>
            Legen Sie hier Anbieter und Nummer fest. Die eigentliche Verbindung (Zugangs-Token) tragen Sie darunter ein.
          </p>
        </div>

        {/* Verbindung (P3a) */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: `1px solid ${vVerbunden ? C.green : 'rgba(255,255,255,0.08)'}`, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(16px, 1.4vw, 22px)' }}>Verbindung</div>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: vVerbunden ? C.green : C.textDim, border: `1px solid ${vVerbunden ? C.green : C.textDim}`, borderRadius: 12, padding: '2px 12px' }}>{vVerbunden ? '✓ Verbunden' : 'Nicht verbunden'}</span>
          </div>

          {!vEncKey && (
            <div style={{ background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12, color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>
              <strong style={{ color: C.warn }}>⚠️ Sicherheits-Schlüssel fehlt.</strong> Zum sicheren Speichern des Tokens muss einmalig die Umgebungsvariable <strong style={{ color: '#fff' }}>APP_ENC_KEY</strong> gesetzt werden. Danach lässt sich die Verbindung speichern.
            </div>
          )}

          {anbieter === 'meta' && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Telefonnummer-ID (phone number id)</label>
              <input value={vPhoneId} onChange={(e) => setVPhoneId(e.target.value)} placeholder="z. B. 123456789012345" style={{ ...input, maxWidth: 420 }} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{anbieter === 'dialog360' ? '360dialog API-Schlüssel' : 'Zugangs-Token'}</label>
            <input type="password" value={vToken} onChange={(e) => setVToken(e.target.value)} placeholder={vHatToken ? '•••••••• (gespeichert — zum Ändern neu eingeben)' : 'hier einfügen'} style={{ ...input, maxWidth: 420 }} />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={speichereVerbindung} disabled={vBusy || !anbieter} style={{ ...btnGold, opacity: (vBusy || !anbieter) ? 0.6 : 1, cursor: (vBusy || !anbieter) ? 'not-allowed' : 'pointer' }}>{vBusy ? 'Speichere…' : (vVerbunden ? 'Zugang aktualisieren' : 'Verbinden')}</button>
            {vVerbunden && <button onClick={trenneVerbindung} disabled={vBusy} style={btn(C.danger)}>Trennen</button>}
            {vMeldung && <span style={{ fontFamily: 'DM Sans, sans-serif', color: vMeldung.startsWith('✓') ? C.green : C.danger, fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{vMeldung}</span>}
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '12px 0 0', fontSize: 'clamp(11px, 1vw, 14px)' }}>
            Der Token wird verschlüsselt gespeichert und nie wieder angezeigt. Sobald verbunden, ist der Versand möglich (nächster Schritt). Die genaue Schritt-für-Schritt-Einrichtung des Zugangs erhalten Sie separat.
          </p>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Vorlagen', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Freigegeben', wert: kpi.freigegeben, farbe: C.green },
          ].map((kp) => (
            <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(34px, 3vw, 48px)', fontWeight: 700, color: kp.farbe }}>{kp.wert}</div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>{kp.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : liste.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 'clamp(38px, 4vw, 56px)', marginBottom: 12 }}>💬</div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)', margin: '0 0 18px' }}>Noch keine Vorlage. Legen Sie Ihre erste WhatsApp-Vorlage an.</p>
            <button onClick={neueVorlage} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 800, cursor: 'pointer' }}>+ Erste Vorlage</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {liste.map((v) => (
              <div key={v.id} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(16px, 1.4vw, 22px)' }}>{v.name}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '1px 8px' }}>{WHATSAPP_KATEGORIEN.find((k) => k.id === v.kategorie)?.label || v.kategorie}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: C.textDim, border: `1px solid ${C.textDim}`, borderRadius: 10, padding: '1px 8px' }}>{v.status === 'freigegeben' ? 'Freigegeben' : 'Entwurf'}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.1vw, 17px)', whiteSpace: 'pre-wrap' }}>{v.inhalt}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => sendeVorlage(v)}
                    disabled={sendBusyId === v.id || !vVerbunden}
                    title={!vVerbunden ? 'Erst Verbindung herstellen' : ''}
                    style={{ ...btn(C.green), opacity: (sendBusyId === v.id || !vVerbunden) ? 0.5 : 1, cursor: (sendBusyId === v.id || !vVerbunden) ? 'not-allowed' : 'pointer' }}
                  >
                    {sendBusyId === v.id ? 'Sende…' : `📤 Senden${vVerbunden ? ` (${aktiveEmpfaenger})` : ''}`}
                  </button>
                  <button onClick={() => bearbeiten(v)} style={btn(C.gold)}>Bearbeiten</button>
                  <button onClick={() => loeschen(v)} style={btn(C.danger)}>Löschen</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {sendMeldung && (
          <div style={{ marginTop: 14, background: sendMeldung.startsWith('✓') ? 'rgba(76,175,125,0.12)' : 'rgba(224,162,76,0.12)', border: `1px solid ${sendMeldung.startsWith('✓') ? C.green : C.warn}`, borderRadius: 12, padding: '12px 16px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{sendMeldung}</div>
        )}
      </div>

      {/* Editor */}
      {editOffen && (
        <div style={overlay} onClick={() => setEditOffen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h2 style={modalTitel}>{editId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Name (nur Kleinbuchstaben, Ziffern, Unterstrich)</label>
              <input value={eName} onChange={(e) => setEName(vorlagenNameNormalisieren(e.target.value))} placeholder="willkommen_aktion" style={input} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Kategorie</label>
              <select value={eKategorie} onChange={(e) => setEKategorie(e.target.value)} style={input}>
                {WHATSAPP_KATEGORIEN.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(11px, 1vw, 14px)' }}>{WHATSAPP_KATEGORIEN.find((k) => k.id === eKategorie)?.hinweis}</p>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Nachrichtentext</label>
              <textarea value={eInhalt} onChange={(e) => setEInhalt(e.target.value)} rows={5} placeholder={'Hallo {{1}}, willkommen bei uns! …'} style={{ ...input, resize: 'vertical' }} />
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(11px, 1vw, 14px)' }}>
                Platzhalter mit <strong style={{ color: '#fff' }}>{'{{1}}'}</strong>, <strong style={{ color: '#fff' }}>{'{{2}}'}</strong> … einfügen. {platzhalter.length > 0 ? `Erkannt: ${platzhalter.join(', ')}` : 'Noch keine Platzhalter.'}
              </p>
            </div>
            {eInhalt.trim() && (
              <div style={{ marginBottom: 14, background: '#0b141a', border: '1px solid rgba(76,175,125,0.4)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 12, marginBottom: 6 }}>Vorschau</div>
                <div style={{ background: '#075E54', color: '#fff', borderRadius: '10px 10px 10px 2px', padding: '10px 12px', fontFamily: 'DM Sans, sans-serif', fontSize: 15, whiteSpace: 'pre-wrap', maxWidth: 360 }}>{vorschau}</div>
              </div>
            )}
            {eMeldung && <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.danger, margin: '0 0 12px', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{eMeldung}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => setEditOffen(false)} style={btnGhost}>Abbrechen</button>
              <button onClick={speichereVorlage} disabled={eBusy} style={{ ...btnGold, opacity: eBusy ? 0.7 : 1, cursor: eBusy ? 'wait' : 'pointer' }}>{eBusy ? 'Speichere…' : 'Vorlage speichern'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#8FA3BE', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', background: '#0F1F33', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '10px 12px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)', boxSizing: 'border-box' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#0A1628', borderRadius: 18, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: '1px solid #C9A84C' };
const modalTitel: React.CSSProperties = { fontFamily: 'var(--font-dm-sans), sans-serif', color: '#C9A84C', fontSize: 'clamp(22px, 2vw, 32px)', margin: '0 0 20px' };
const btnGold: React.CSSProperties = { background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700 };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#8FA3BE', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 20px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' };
function btn(farbe: string): React.CSSProperties {
  return { background: 'transparent', color: farbe, border: `1px solid ${farbe}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer' };
}
