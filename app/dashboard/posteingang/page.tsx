'use client';

// ============================================================
// ARGONAUT OS · Posteingang — lesen und antworten
//
// Bis heute zeigte diese Seite nur den Umschlag: Absender, Betreff, Datum.
// Man sah, DASS etwas da ist. Jetzt lässt sich die Nachricht öffnen, lesen und
// beantworten — über das EIGENE Postfach des Betriebs, nicht über uns.
//
// ▄▄▄ DIE TRENNLINIE ▄▄▄
// Rechnungen, Mahnungen, Terminbestätigungen und Newsletter verschickt die
// Maschine über Resend. Was der Mensch hier tippt, geht über sein eigenes
// Postfach (SMTP). Deshalb steht die Antwort auch in seinem Ordner „Gesendet“
// und der Kunde kann auf sie antworten.
//
// WARUM HIER KEIN FREMDES HTML STEHT
// Die Route liefert bewusst nur Text. Fremdes HTML in der eigenen Oberfläche
// heißt: Skripte und Zählpixel des Absenders laufen mit und melden ihm, wann
// und wo gelesen wurde. Der Text wird deshalb als Text dargestellt.
//
// Pfad: app/dashboard/posteingang/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { antwortBetreff, baueAntwortText, zitiere, MAX_EMPFAENGER } from '@/lib/mailSmtp';
import KiAuge from '../_components/KiAuge';
import { augePosteingang } from '@/lib/auge';
import { zaehlePosteingang } from '@/lib/augeZaehler';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type MailZeile = { uid: number; vonName: string; vonAdresse: string; betreff: string; datumIso: string; gelesen: boolean };

type Anhang = { name: string; typ: string; groesse: number };

type Nachricht = {
  uid: number;
  betreff: string;
  vonName: string;
  vonAdresse: string;
  datumIso: string;
  messageId: string;
  text: string;
  gekuerzt: boolean;
  nurHtmlVorhanden: boolean;
  anhaenge: Anhang[];
};

type Entwurf = { an: string; betreff: string; text: string; bezug: string };

function datum(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const heute = new Date();
  const gleicherTag = d.toDateString() === heute.toDateString();
  return gleicherTag
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function datumLang(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function groesse(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function PosteingangSeite() {
  const [mails, setMails] = useState<MailZeile[]>([]);
  const [konto, setKonto] = useState('');
  const [verbunden, setVerbunden] = useState(true);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [offen, setOffen] = useState<Nachricht | null>(null);
  const [ladeText, setLadeText] = useState(false);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [sendet, setSendet] = useState(false);
  const [erfolg, setErfolg] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const r = await fetch('/api/mail/posteingang?n=30');
      const j = await r.json();
      if (!r.ok || !j?.ok) { setFehler(j?.error || 'Abruf fehlgeschlagen.'); setVerbunden(j?.verbunden !== false); return; }
      setVerbunden(!!j.verbunden);
      setKonto(j.konto || '');
      setMails((j.mails || []) as MailZeile[]);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLaden(false); }
  }, []);

  useEffect(() => { void laden_(); }, [laden_]);

  async function oeffne(uid: number) {
    setLadeText(true); setFehler(null); setErfolg(null); setEntwurf(null); setOffen(null);
    try {
      const r = await fetch(`/api/mail/nachricht?uid=${encodeURIComponent(String(uid))}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) { setFehler(j?.error || 'Die Nachricht ließ sich nicht öffnen.'); return; }
      setOffen(j as Nachricht);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLadeText(false); }
  }

  function antworte(n: Nachricht) {
    setErfolg(null); setFehler(null);
    setEntwurf({
      an: n.vonAdresse,
      betreff: antwortBetreff(n.betreff),
      text: baueAntwortText('', zitiere(n.text, n.vonName || n.vonAdresse, n.datumIso)),
      bezug: n.messageId || '',
    });
  }

  function neueNachricht() {
    setOffen(null); setErfolg(null); setFehler(null);
    setEntwurf({ an: '', betreff: '', text: '', bezug: '' });
  }

  async function sende() {
    if (!entwurf) return;
    setSendet(true); setFehler(null); setErfolg(null);
    try {
      const r = await fetch('/api/mail/senden', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          an: entwurf.an,
          betreff: entwurf.betreff,
          text: entwurf.text,
          antwortAufMessageId: entwurf.bezug,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) { setFehler(j?.error || 'Versand fehlgeschlagen.'); return; }
      setErfolg(`✓ Verschickt über ${j.ueber || 'Ihr Postfach'} an ${(j.an || []).join(', ')}.`);
      setEntwurf(null);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setSendet(false); }
  }

  const ungelesen = mails.filter((m) => !m.gelesen).length;
  const inDetail = !!offen || !!entwurf;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Kommunikation</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={styles.h1}>📥 Posteingang</h1>
        {konto && <span style={styles.konto}>{konto}</span>}
        {ungelesen > 0 && !inDetail && <span style={styles.badge}>{ungelesen} ungelesen</span>}
        <span style={{ flex: 1 }} />
        {inDetail ? (
          <button style={styles.mini} onClick={() => { setOffen(null); setEntwurf(null); setErfolg(null); setFehler(null); }}>‹ Zurück</button>
        ) : (
          <>
            <button style={styles.mini} onClick={() => void laden_()} disabled={laden}>{laden ? '⏳' : '↻'} Aktualisieren</button>
            {verbunden && <button style={styles.mini} onClick={neueNachricht}>✎ Neue Nachricht</button>}
            <a href="/dashboard/mail-sync" style={styles.mini}>Postfächer</a>
          </>
        )}
      </div>
      <p style={styles.sub}>
        Ihre letzten E-Mails direkt im System — lesen und beantworten, ohne den Anbieter zu öffnen.
        Ihre Antwort geht über Ihr eigenes Postfach hinaus und steht danach in Ihrem Ordner „Gesendet“.
        (IMAP; Microsoft 365 und Gmail folgen.)
      </p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {erfolg && <div style={styles.ok}>{erfolg}</div>}

      {/* Punkt 6.5 — nur in der Listenansicht, im Detail stoert es nur. */}
      {!inDetail && !laden && verbunden && (
        <div style={{ margin: '4px 0 14px' }}>
          <KiAuge modul="Posteingang" regel={augePosteingang(zaehlePosteingang(mails, new Date()))} />
        </div>
      )}

      {/* --- Schreiben ------------------------------------------------------ */}
      {entwurf && (
        <div style={styles.karte}>
          <div style={styles.karteTitel}>{entwurf.bezug ? 'Antwort schreiben' : 'Neue Nachricht'}</div>

          <label style={styles.label}>An</label>
          <input
            value={entwurf.an}
            onChange={(e) => setEntwurf({ ...entwurf, an: e.target.value })}
            placeholder="kunde@beispiel.de"
            style={styles.input}
          />
          <p style={styles.hinweis}>
            Mehrere Adressen mit Komma trennen — höchstens {MAX_EMPFAENGER} je Nachricht. Für größere
            Verteiler ist der Newsletter da: Ihr Anbieter (IONOS, Strato, GMX) sperrt bei Massenversand
            das Postfach.
          </p>

          <label style={{ ...styles.label, marginTop: 14 }}>Betreff</label>
          <input
            value={entwurf.betreff}
            onChange={(e) => setEntwurf({ ...entwurf, betreff: e.target.value })}
            placeholder="Worum geht es?"
            style={styles.input}
          />

          <label style={{ ...styles.label, marginTop: 14 }}>Nachricht</label>
          <textarea
            value={entwurf.text}
            onChange={(e) => setEntwurf({ ...entwurf, text: e.target.value })}
            rows={14}
            placeholder="Guten Tag …"
            style={styles.textarea}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => void sende()} disabled={sendet} style={{ ...styles.primaer, opacity: sendet ? 0.55 : 1 }}>
              {sendet ? 'Verschicke …' : '✉ Verschicken'}
            </button>
            <button onClick={() => setEntwurf(null)} style={styles.mini}>Verwerfen</button>
            {konto && <span style={styles.absenderHinweis}>geht raus über <b>{konto}</b></span>}
          </div>
        </div>
      )}

      {/* --- Lesen ---------------------------------------------------------- */}
      {offen && !entwurf && (
        <div style={styles.karte}>
          <div style={styles.mailKopf}>
            <div style={{ minWidth: 0 }}>
              <div style={styles.mailBetreff}>{offen.betreff || '(kein Betreff)'}</div>
              <div style={styles.mailVon}>
                <b style={{ color: C.text }}>{offen.vonName || offen.vonAdresse || 'Unbekannt'}</b>
                {offen.vonName && offen.vonAdresse && <span style={{ color: C.textDim }}> · {offen.vonAdresse}</span>}
              </div>
              <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>{datumLang(offen.datumIso)}</div>
            </div>
            <span style={{ flex: 1 }} />
            <button onClick={() => antworte(offen)} style={styles.primaer}>↩ Antworten</button>
          </div>

          {offen.nurHtmlVorhanden && (
            <div style={styles.warn}>
              Diese Nachricht wurde als HTML verschickt. Sie sehen den Text daraus — Bilder und
              Schaltflächen bleiben außen vor. Das ist Absicht: Nachgeladene Bilder melden dem
              Absender, wann und wo Sie eine Mail geöffnet haben.
            </div>
          )}

          <div style={styles.mailText}>{offen.text || '(Diese Nachricht enthält keinen lesbaren Text.)'}</div>

          {offen.gekuerzt && (
            <p style={styles.hinweis}>Die Nachricht ist sehr lang und wurde für die Anzeige gekürzt.</p>
          )}

          {offen.anhaenge.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={styles.label}>Anhänge</div>
              {offen.anhaenge.map((a, i) => (
                <div key={i} style={styles.anhang}>
                  <span>📎 {a.name}</span>
                  <span style={{ color: C.textDim, fontSize: 12.5 }}>{groesse(a.groesse)}</span>
                </div>
              ))}
              <p style={styles.hinweis}>
                Das Herunterladen von Anhängen folgt — es bekommt eine eigene Prüfung, weil hier
                fremde Dateien ins Haus kommen.
              </p>
            </div>
          )}
        </div>
      )}

      {/* --- Die Liste ------------------------------------------------------ */}
      {!inDetail && (
        laden ? (
          <div style={styles.hint}>Lade Postfach …</div>
        ) : !verbunden ? (
          <div style={styles.leer}>
            <div style={{ fontSize: 32 }}>✉️</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8 }}>Noch kein Postfach verbunden</div>
            <p style={{ color: C.textDim, margin: '8px 0 14px', maxWidth: 460 }}>
              Verbinden Sie Ihr IMAP-Postfach (IONOS, GMX, Strato …) mit E-Mail, Passwort und
              IMAP-Server — dann erscheinen Ihre E-Mails hier, und Sie können von hier aus antworten.
            </p>
            <a href="/dashboard/mail-sync" style={styles.primaer}>📬 Postfach verbinden</a>
          </div>
        ) : mails.length === 0 && !fehler ? (
          <div style={styles.hint}>Keine Nachrichten im Postfach gefunden.</div>
        ) : (
          <div style={styles.liste}>
            {ladeText && <div style={{ ...styles.hint, padding: '12px 16px' }}>Öffne Nachricht …</div>}
            {mails.map((m) => (
              <div
                key={m.uid}
                onClick={() => void oeffne(m.uid)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void oeffne(m.uid); } }}
                style={{ ...styles.zeile, cursor: 'pointer', background: m.gelesen ? 'transparent' : 'rgba(0,229,255,0.05)' }}
              >
                <span style={{ ...styles.punkt, background: m.gelesen ? 'transparent' : C.cyan, border: m.gelesen ? `1px solid ${C.border}` : 'none' }} />
                <div style={styles.von}>
                  <span style={{ fontWeight: m.gelesen ? 600 : 800, color: C.text }}>{m.vonName || m.vonAdresse || 'Unbekannt'}</span>
                  {m.vonName && <span style={styles.adr}>{m.vonAdresse}</span>}
                </div>
                <div style={{ ...styles.betreff, fontWeight: m.gelesen ? 400 : 700 }}>{m.betreff}</div>
                <div style={styles.datum}>{datum(m.datumIso)}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 1000, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  konto: { color: C.textDim, fontSize: 14, background: 'rgba(143,163,190,0.1)', borderRadius: 999, padding: '4px 12px' },
  badge: { color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 999, padding: '3px 11px', fontSize: 12.5, fontWeight: 800 },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },

  liste: { display: 'flex', flexDirection: 'column', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' },
  zeile: { display: 'grid', gridTemplateColumns: 'auto minmax(140px, 220px) 1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${C.border}` },
  punkt: { width: 9, height: 9, borderRadius: 999 },
  von: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  adr: { color: C.textDim, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  betreff: { color: C.text, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  datum: { color: C.textDim, fontSize: 12.5, whiteSpace: 'nowrap' },

  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px', marginBottom: 18 },
  karteTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, color: '#fff', fontSize: '1.15rem', marginBottom: 14 },
  label: { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginBottom: 6 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: 15, width: '100%', boxSizing: 'border-box' },
  textarea: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '12px 14px', fontFamily: 'inherit', fontSize: 15, width: '100%', boxSizing: 'border-box', lineHeight: 1.6, resize: 'vertical' },
  hinweis: { color: C.textDim, fontSize: 13, lineHeight: 1.55, margin: '8px 0 0', maxWidth: '72ch' },
  absenderHinweis: { color: C.textDim, fontSize: 13 },

  mailKopf: { display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, paddingBottom: 14, marginBottom: 14 },
  mailBetreff: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, color: '#fff', fontSize: '1.2rem', lineHeight: 1.3 },
  mailVon: { fontSize: 14, marginTop: 6 },
  mailText: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: C.text, fontSize: 14.5, lineHeight: 1.65, maxHeight: '60vh', overflowY: 'auto' },
  anhang: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 13px', marginTop: 8, fontSize: 14 },

  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' },
  leer: { textAlign: 'center', padding: '48px 20px', border: `1px dashed ${C.border}`, borderRadius: 16 },
  hint: { color: C.textDim, fontSize: 16, padding: '20px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.35)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  warn: { color: C.text, fontSize: 13.5, background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '11px 14px', marginBottom: 14, lineHeight: 1.55 },
};
