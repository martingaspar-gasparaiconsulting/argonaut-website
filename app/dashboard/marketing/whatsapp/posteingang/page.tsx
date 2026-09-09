'use client';

import { useEffect, useState, useCallback, type CSSProperties } from 'react';

// ============================================================
// ARGONAUT OS · MARKETING · WhatsApp-Posteingang  (G2 · Push 2)
//
// Bis 09.09.2026 war WhatsApp ein Lautsprecher: Der Versand stand, die Antwort
// des Kunden kam nirgends an. Hier laufen die eingehenden Nachrichten auf.
//
// Das 24-Stunden-Fenster steht bewusst GROSS über dem Eingabefeld. Wer es
// nicht sieht, tippt eine Antwort, drückt senden — und sie geht nie hinaus:
// WhatsApp lässt freien Text nur innerhalb von 24 Stunden nach der letzten
// Kundennachricht zu. Danach nimmt Meta ausschliesslich Vorlagen an.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

type Fenster = { offen: boolean; restMinuten: number; text: string };

type Gespraech = {
  kontaktId: string | null;
  telefon: string;
  name: string;
  letzterText: string;
  letzteRichtung: string;
  letzteZeit: string;
  ungelesen: number;
  fenster: Fenster;
};

type Nachricht = {
  id: string;
  richtung: string;
  art: string;
  text: string | null;
  status: string;
  empfangen_am: string;
};

function zeit(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const heute = new Date();
  const gleicherTag = d.toDateString() === heute.toDateString();
  const uhr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (gleicherTag) return uhr;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}. ${uhr}`;
}

export default function WhatsappPosteingang() {
  const [gespraeche, setGespraeche] = useState<Gespraech[]>([]);
  const [aktiv, setAktiv] = useState<string | null>(null);
  const [verlauf, setVerlauf] = useState<Nachricht[]>([]);
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [antwort, setAntwort] = useState('');
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const ladeUebersicht = useCallback(async () => {
    try {
      const r = await fetch('/api/marketing/whatsapp-posteingang');
      const d = await r.json();
      if (d?.ok) setGespraeche(d.gespraeche ?? []);
      else setFehler(d?.error || 'Konnte den Posteingang nicht laden.');
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setLaden(false);
  }, []);

  useEffect(() => { ladeUebersicht(); }, [ladeUebersicht]);

  async function oeffne(kontaktId: string | null) {
    if (!kontaktId) return;
    setAktiv(kontaktId); setVerlauf([]); setMeldung(null); setFehler(null);
    try {
      const r = await fetch(`/api/marketing/whatsapp-posteingang?kontakt=${encodeURIComponent(kontaktId)}`);
      const d = await r.json();
      if (d?.ok) {
        setVerlauf(d.verlauf ?? []);
        setFenster(d.fenster ?? null);
        setPartnerName(d.kontakt?.name || d.kontakt?.telefon || '');
        ladeUebersicht();   // Ungelesen-Zähler nachziehen
      } else {
        setFehler(d?.error || 'Konnte das Gespräch nicht laden.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
  }

  async function senden() {
    const text = antwort.trim();
    if (!text || !aktiv || busy) return;
    setBusy(true); setMeldung(null); setFehler(null);
    try {
      const r = await fetch('/api/marketing/whatsapp-posteingang', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kontaktId: aktiv, text }),
      });
      const d = await r.json();
      if (d?.ok) {
        setAntwort('');
        setMeldung('Antwort gesendet.');
        oeffne(aktiv);
      } else {
        if (d?.fenster) setFenster(d.fenster);
        setFehler(d?.error || 'Senden fehlgeschlagen.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setBusy(false);
  }

  const ungelesenGesamt = gespraeche.reduce((s, g) => s + g.ungelesen, 0);

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>

        <div style={s.kopf}>
          <div>
            <h1 style={s.h1}>📥 WhatsApp-Posteingang</h1>
            <p style={s.sub}>
              Was Ihre Kunden auf WhatsApp schreiben — und Ihre Antwort darauf.
              {ungelesenGesamt > 0 && <b style={{ color: C.gold }}> {ungelesenGesamt} ungelesen.</b>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/dashboard/marketing/whatsapp" style={s.btnGhost}>‹ Zurück zu WhatsApp</a>
            <button onClick={ladeUebersicht} style={s.btnGold}>↻ Aktualisieren</button>
          </div>
        </div>

        {fehler && <div style={s.fehlerBox}>{fehler}</div>}
        {meldung && <div style={s.okBox}>{meldung}</div>}

        {laden ? (
          <div style={s.hint}>Lädt …</div>
        ) : gespraeche.length === 0 ? (
          <div style={s.leerKasten}>
            <div style={{ fontSize: 'clamp(38px, 4vw, 56px)', marginBottom: 14 }}>📭</div>
            <div style={s.leerTitel}>Noch keine Nachrichten</div>
            <p style={s.leerText}>
              Sobald ein Kunde Ihrer WhatsApp-Nummer schreibt, erscheint das Gespräch hier —
              und Sie können direkt aus ARGONAUT antworten.
            </p>
            <ol style={s.schritte}>
              <li>WhatsApp-Zugang verbinden (Anbieter, Token, Telefonnummer-ID)</li>
              <li>Auf der WhatsApp-Seite die Webhook-Adresse und den Prüf-Token bei Meta hinterlegen</li>
              <li>Sich selbst eine Testnachricht an die eigene Nummer schicken</li>
            </ol>
            <a href="/dashboard/marketing/whatsapp" style={{ ...s.btnGold, display: 'inline-block', marginTop: 18, textDecoration: 'none' }}>
              Zur Einrichtung
            </a>
          </div>
        ) : (
          <div style={s.zweiSpalten}>

            {/* Links: die Gespräche */}
            <div style={s.liste}>
              {gespraeche.map((g) => (
                <button
                  key={g.kontaktId || g.telefon}
                  onClick={() => oeffne(g.kontaktId)}
                  style={{ ...s.eintrag, ...(aktiv === g.kontaktId ? s.eintragAktiv : {}) }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, color: '#fff' }}>{g.name || g.telefon}</span>
                    <span style={{ color: C.textDim, fontSize: 12, whiteSpace: 'nowrap' }}>{zeit(g.letzteZeit)}</span>
                  </div>
                  <div style={s.vorschau}>
                    {g.letzteRichtung === 'aus' && <span style={{ color: C.textDim }}>Sie: </span>}
                    {g.letzterText}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    {g.ungelesen > 0 && <span style={s.punkt}>{g.ungelesen} neu</span>}
                    <span style={g.fenster.offen ? s.fensterAuf : s.fensterZu}>
                      {g.fenster.offen ? `⏱ ${g.fenster.text}` : '🔒 Fenster zu'}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Rechts: das Gespräch */}
            <div style={s.gespraech}>
              {!aktiv ? (
                <div style={s.hint}>Wählen Sie links ein Gespräch — dann sehen Sie hier den Verlauf.</div>
              ) : (
                <>
                  <div style={s.gespraechKopf}>
                    <span style={{ fontWeight: 800, color: '#fff' }}>{partnerName}</span>
                  </div>

                  <div style={s.verlauf}>
                    {verlauf.length === 0 ? (
                      <div style={s.hint}>Noch keine Nachrichten in diesem Gespräch.</div>
                    ) : verlauf.map((n) => (
                      <div key={n.id} style={{ ...s.blase, ...(n.richtung === 'aus' ? s.blaseAus : s.blaseEin) }}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{n.text || `[${n.art}]`}</div>
                        <div style={s.blaseZeit}>
                          {zeit(n.empfangen_am)}
                          {n.richtung === 'aus' && n.status === 'fehler' && <b style={{ color: C.danger }}> · nicht zugestellt</b>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Das Fenster — bewusst über dem Eingabefeld, nicht darunter. */}
                  {fenster && (
                    <div style={fenster.offen ? s.fensterLeisteAuf : s.fensterLeisteZu}>
                      {fenster.offen ? (
                        <>⏱ <b>Antwortfenster offen — {fenster.text}.</b> So lange können Sie frei schreiben.</>
                      ) : (
                        <>🔒 <b>Antwortfenster geschlossen.</b> WhatsApp lässt jetzt keinen freien Text mehr zu — nur noch eine bei Meta freigegebene Vorlage. Das Fenster öffnet wieder, sobald der Kunde erneut schreibt.</>
                      )}
                    </div>
                  )}

                  <div style={s.eingabeZeile}>
                    <textarea
                      value={antwort}
                      onChange={(e) => setAntwort(e.target.value)}
                      placeholder={fenster?.offen ? 'Ihre Antwort …' : 'Fenster geschlossen — freier Text ist nicht mehr möglich'}
                      disabled={!fenster?.offen || busy}
                      style={{ ...s.textfeld, opacity: fenster?.offen ? 1 : 0.5 }}
                      rows={3}
                    />
                    <button
                      onClick={senden}
                      disabled={!fenster?.offen || busy || !antwort.trim()}
                      style={{ ...s.btnGold, opacity: (!fenster?.offen || busy || !antwort.trim()) ? 0.5 : 1, alignSelf: 'stretch' }}
                    >
                      {busy ? '…' : 'Senden'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 16 },
  h1: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 },
  sub: { fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' },
  btnGhost: { background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(14px, 1.2vw, 18px)', cursor: 'pointer' },

  zweiSpalten: { display: 'grid', gridTemplateColumns: 'minmax(240px, 340px) 1fr', gap: 16, alignItems: 'start' },
  liste: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '70vh', overflowY: 'auto' },
  eintrag: { textAlign: 'left', background: C.navy2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.textDim, fontFamily: 'DM Sans, sans-serif', fontSize: 14 },
  eintragAktiv: { border: `1px solid ${C.gold}`, background: 'rgba(201,168,76,0.08)' },
  vorschau: { marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  punkt: { background: C.gold, color: C.navy, borderRadius: 999, padding: '1px 9px', fontSize: 11.5, fontWeight: 800 },
  fensterAuf: { color: C.green, fontSize: 11.5, fontWeight: 700 },
  fensterZu: { color: C.textDim, fontSize: 11.5, fontWeight: 700 },

  gespraech: { background: C.navy2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: '60vh' },
  gespraechKopf: { padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Sans, sans-serif' },
  verlauf: { flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '46vh' },
  blase: { maxWidth: '78%', padding: '10px 13px', borderRadius: 12, fontFamily: 'DM Sans, sans-serif', fontSize: 14.5, lineHeight: 1.5 },
  blaseEin: { alignSelf: 'flex-start', background: 'rgba(255,255,255,0.07)', color: '#fff', borderBottomLeftRadius: 4 },
  blaseAus: { alignSelf: 'flex-end', background: 'rgba(76,175,125,0.18)', color: '#fff', borderBottomRightRadius: 4 },
  blaseZeit: { marginTop: 4, fontSize: 11, color: C.textDim },

  fensterLeisteAuf: { margin: '0 18px', padding: '10px 14px', borderRadius: 10, background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.green}55`, color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, lineHeight: 1.55 },
  fensterLeisteZu: { margin: '0 18px', padding: '10px 14px', borderRadius: 10, background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}55`, color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, lineHeight: 1.55 },

  eingabeZeile: { display: 'flex', gap: 10, padding: 18, alignItems: 'stretch' },
  textfeld: { flex: 1, background: C.navy, color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '11px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 14.5, resize: 'vertical', boxSizing: 'border-box' },

  hint: { color: C.textDim, fontFamily: 'DM Sans, sans-serif', padding: 24, fontSize: 15 },
  fehlerBox: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.danger}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' },
  okBox: { color: C.green, background: 'rgba(76,175,125,0.1)', border: `1px solid ${C.green}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' },

  leerKasten: { background: C.navy2, border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 16, padding: '40px 24px', textAlign: 'center', fontFamily: 'DM Sans, sans-serif' },
  leerTitel: { fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 800, fontSize: 'clamp(18px, 1.7vw, 26px)', color: '#fff', marginBottom: 8 },
  leerText: { color: C.textDim, fontSize: 'clamp(14px, 1.2vw, 18px)', lineHeight: 1.55, maxWidth: 520, margin: '0 auto' },
  schritte: { textAlign: 'left', maxWidth: 460, margin: '18px auto 0', color: C.textDim, fontSize: 14.5, lineHeight: 1.7 },
};
