'use client';

// ============================================================================
// ARGONAUT OS · app/vorfuehrung/[slug]/Abspieler.tsx
//
// Der Abspieler der Branchen-Vorführung. Sieben Bilder, die von selbst
// weiterlaufen — wie ein Film, den man aber jederzeit anhalten und selbst
// weiterblättern kann.
//
// Warum von selbst: Auf einem Veranstaltungsbildschirm bleibt niemand stehen,
// um sich durchzuklicken. Es muss laufen. Wer genauer hinschauen will, hält an
// oder blättert selbst — dafür sind alle Flächen bewusst fingerbreit.
//
// Zwei Stellen sind bewusst anders als der Rest:
//   · Das Preisbild ist ANFASSBAR. Der Besucher tippt seine Betriebsgröße an
//     und sieht sofort seinen Preis. Das ist ehrlicher als eine Zahl, die für
//     einen fremden Betrieb gerechnet wurde — und er qualifiziert sich selbst.
//   · Am Ende steht ein QR-Code. Ohne ihn endet der Weg am Bildschirm; mit ihm
//     nimmt der Besucher seine Branche mit nach Hause.
//
// Alles rein im Browser: keine Anmeldung, kein Datenbankzugriff, kein
// KI-Aufruf. Der Bildschirm läuft auch dann noch, wenn das WLAN einbricht.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import Link from 'next/link';
import { preisFuerGroesse, type PreisBild } from '@/lib/vorfuehrPreis';
import type { VorfuehrDaten } from '@/lib/vorfuehrung';
import { STUFEN } from '@/lib/onboardingStufen';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', gold2: '#e8c46a',
  cyan: '#00e5ff', green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE',
  rand: 'rgba(143,163,190,0.18)',
};

const DAUER = [8000, 9000, 11000, 9000, 9000, 14000, 14000];
const TITEL = ['Ihre Branche', 'Was Sie bekommen', 'Die KI kennt Ihre Zahlen', 'Was sich ändert', 'Der Weg hinein', 'Was es kostet', 'Ihr nächster Schritt'];

/** Betriebsgrößen zum Antippen. */
const GROESSEN = [
  { ma: 1, label: '1 Person' },
  { ma: 5, label: '5' },
  { ma: 15, label: '15' },
  { ma: 45, label: '45' },
  { ma: 120, label: '120' },
  { ma: 300, label: '300+' },
];

function eur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function eur0(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
}

export default function Abspieler({
  daten, qr, qrZiel,
}: { daten: VorfuehrDaten; qr: boolean[][]; qrZiel: string }) {
  const { titel, kategorie, betrieb, ort, schmerzen, hoehepunkte, kiFrage, kiAntwort, module, schritte, preis, webSlug } = daten;

  // Der Weg nach dem Bildschirm: die echte Branchenseite mit Preisrechner und
  // Terminbuchung. Die Vorführung weckt Interesse — dort wird daraus eine Anfrage.
  const branchenSeite = webSlug ? `/vorschau/branchen/${webSlug}` : '/vorschau';

  const [bild, setBild] = useState(0);
  const [laeuft, setLaeuft] = useState(true);
  const [fortschritt, setFortschritt] = useState(0);
  const [groesse, setGroesse] = useState<number | null>(null);

  const gezeigterPreis: PreisBild = useMemo(
    () => (groesse === null ? preis : preisFuerGroesse(groesse)),
    [groesse, preis],
  );

  const weiter = useCallback(() => { setBild((b) => (b + 1) % TITEL.length); setFortschritt(0); }, []);
  const zurueck = useCallback(() => { setBild((b) => (b - 1 + TITEL.length) % TITEL.length); setFortschritt(0); }, []);

  useEffect(() => {
    if (!laeuft) return;
    const takt = 60;
    const dauer = DAUER[bild] ?? 9000;
    const t = setInterval(() => {
      setFortschritt((f) => {
        const neu = f + (takt / dauer) * 100;
        if (neu >= 100) { setBild((b) => (b + 1) % TITEL.length); return 0; }
        return neu;
      });
    }, takt);
    return () => clearInterval(t);
  }, [bild, laeuft]);

  useEffect(() => {
    const auf = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') weiter();
      if (e.key === 'ArrowLeft') zurueck();
      if (e.key === ' ') { e.preventDefault(); setLaeuft((l) => !l); }
    };
    window.addEventListener('keydown', auf);
    return () => window.removeEventListener('keydown', auf);
  }, [weiter, zurueck]);

  /** Wer eine Größe antippt, will lesen — also hält der Ablauf an. */
  function groesseWaehlen(ma: number) {
    setGroesse(ma);
    setLaeuft(false);
  }

  return (
    <div style={s.seite}>
      <style>{`
        @keyframes argEin { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform:none; } }
        .bild > * { animation: argEin .5s ease both; }
        .bild > *:nth-child(2) { animation-delay: .07s; }
        .bild > *:nth-child(3) { animation-delay: .14s; }
        .bild > *:nth-child(4) { animation-delay: .21s; }
        .bild > *:nth-child(5) { animation-delay: .28s; }
        @media (prefers-reduced-motion: reduce) { .bild > * { animation: none; } }
      `}</style>

      <div style={s.balkenreihe}>
        {TITEL.map((t, i) => (
          <button key={t} onClick={() => { setBild(i); setFortschritt(0); }} style={{ ...s.balken, borderColor: i === bild ? C.gold : 'transparent' }} title={t}>
            <span style={{ ...s.balkenFill, width: i < bild ? '100%' : i === bild ? `${fortschritt}%` : '0%' }} />
          </button>
        ))}
      </div>

      <div style={s.kopf}>
        <Link href="/vorfuehrung" style={s.zurueckLink}>‹ Andere Branche</Link>
        <div style={s.kopfMitte}>
          <div style={s.kategorie}>{kategorie}</div>
          <div style={s.kapitel}>{bild + 1} von {TITEL.length} · {TITEL[bild]}</div>
        </div>
        <button onClick={() => setLaeuft((l) => !l)} style={s.pause}>{laeuft ? '❚❚ Anhalten' : '▶ Weiter'}</button>
      </div>

      <div style={s.buehne} className="bild" key={bild}>
        {bild === 0 && (
          <>
            <div style={s.oben}>{betrieb ? 'Beispielbetrieb dieser Branche' : 'Ihre Branche'}</div>
            <h1 style={s.h1}>{titel}</h1>
            {betrieb && <p style={s.gross}>{betrieb}{ort ? ` · ${ort}` : ''}</p>}
            <div style={s.schmerzBlock}>
              <div style={s.schmerzTitel}>Kennen Sie das?</div>
              {schmerzen.map((z, i) => (
                <div key={i} style={s.schmerzZeile}>{z}</div>
              ))}
            </div>
          </>
        )}

        {bild === 1 && (
          <>
            <h2 style={s.h2}>Diese Branche bekommt <b style={{ color: C.gold }}>{daten.anzahlModule} Module</b></h2>
            <p style={s.unter}>
              Gold ist das, was speziell für Sie dazukommt. Der Rest ist der Kern, den jeder Betrieb bekommt —
              von Angebot und Rechnung bis Buchhaltung.
            </p>
            <div style={s.modulGitter}>
              {module.map((m) => (
                <span key={m.key} style={{ ...s.modul, borderColor: m.kern ? C.rand : 'rgba(201,168,76,0.55)', color: m.kern ? C.dim : C.text, background: m.kern ? 'transparent' : 'rgba(201,168,76,0.10)' }}>
                  {m.label}
                </span>
              ))}
            </div>
          </>
        )}

        {bild === 2 && (
          <>
            <div style={s.oben}>Das KI-Auge</div>
            <h2 style={s.h2}>„{kiFrage}"</h2>
            <div style={s.antwortBox}>
              {kiAntwort.map((z, i) => (
                <div key={i} style={s.antwortZeile}>
                  <span style={{ ...s.punkt, background: i === kiAntwort.length - 1 ? C.green : C.gold }} />
                  <span>{z}</span>
                </div>
              ))}
            </div>
            <p style={s.hinweis}>
              Das ist kein Chat, der Texte erfindet. Die Antwort kommt aus <b style={{ color: C.text }}>Ihren</b> Zahlen —
              aus Aufträgen, Stunden, Rechnungen und Beständen Ihres Betriebs.
            </p>
          </>
        )}

        {bild === 3 && (
          <>
            <h2 style={s.h2}>Was sich für Sie ändert</h2>
            <div style={s.punkteReihe}>
              {hoehepunkte.map((h, i) => (
                <div key={i} style={s.punktKarte}>
                  <div style={s.punktNr}>{i + 1}</div>
                  <div style={s.punktText}>{h}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {bild === 4 && (
          <>
            <h2 style={s.h2}>Vom Matrosen zum Kapitän</h2>
            <p style={s.unter}>
              Software einführen ist der Teil, vor dem alle Angst haben. Deshalb werden Sie geführt —
              Schritt für Schritt, jeder dauert Minuten. Am Ende steht ein Zertifikat.
            </p>
            <div style={s.raenge}>
              {STUFEN.map((r) => (
                <span key={r.rang} style={{ ...s.rang, borderColor: r.farbe }}>
                  <span style={{ ...s.rangPunkt, background: r.farbe }} />{r.rang}
                </span>
              ))}
            </div>
            {schritte.length > 0 && (
              <>
                <p style={{ ...s.unter, marginTop: 20 }}>Zusätzlich zu den Grundschritten bekommen Sie diese eigenen:</p>
                <div style={s.schritte}>
                  {schritte.map((x) => (
                    <div key={x.titel} style={s.schritt}>
                      <span style={s.schrittIcon}>{x.icon}</span>
                      <span><b>{x.titel}</b><span style={s.schrittText}>{x.text}</span></span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {bild === 5 && (
          <>
            <h2 style={s.h2}>Was kostet das bei Ihnen?</h2>
            <p style={s.unter}>Tippen Sie an, wie viele Menschen bei Ihnen arbeiten.</p>
            <div style={s.groessen}>
              {GROESSEN.map((g) => (
                <button
                  key={g.ma}
                  onClick={() => groesseWaehlen(g.ma)}
                  style={{
                    ...s.groesse,
                    borderColor: groesse === g.ma ? C.gold : C.rand,
                    background: groesse === g.ma ? 'rgba(201,168,76,0.14)' : 'transparent',
                    color: groesse === g.ma ? C.text : C.dim,
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div style={s.preisBox}>
              {gezeigterPreis.posten.map((p) => (
                <div key={p.label} style={s.preisZeile}>
                  <span style={{ color: C.dim }}>{p.label}</span>
                  <span>{p.betrag === 0 ? 'enthalten' : eur0(p.betrag)}</span>
                </div>
              ))}
              <div style={{ ...s.preisZeile, ...s.preisSumme }}>
                <span>Monatlich netto</span>
                <span style={{ color: C.gold2 }}>{eur(gezeigterPreis.monat)}</span>
              </div>
              <div style={s.preisFuss}>
                Das sind <b style={{ color: C.text }}>{eur(gezeigterPreis.jeMitarbeiter)}</b> je Mitarbeiter im Monat.
                Einmalige Einrichtung {eur0(gezeigterPreis.einrichtung)}.
                <br />
                Bei 36 Monaten Laufzeit {gezeigterPreis.rabatt36} % weniger:{' '}
                <b style={{ color: C.green }}>{eur(gezeigterPreis.monat36)}</b> monatlich — das sind{' '}
                {eur0(gezeigterPreis.ersparnis36)} über die Laufzeit.
              </div>
            </div>
            <p style={s.hinweis}>
              KI-Nutzung ist unbegrenzt enthalten, keine Zusatzkosten pro Abfrage.
              {groesse === null && ' Gezeigt ist zunächst ein typischer Betrieb dieser Branche.'}
            </p>
          </>
        )}

        {bild === 6 && (
          <>
            <div style={s.qrReihe}>
              <div style={{ flex: 1, minWidth: 300 }}>
                <div style={s.oben}>Ihr nächster Schritt</div>
                <h2 style={s.h2}>Ihre Branche auf Ihrem Handy.</h2>
                <p style={s.unter}>
                  Scannen Sie den Code. Sie landen auf der Seite für <b style={{ color: C.text }}>{titel}</b> —
                  dort können Sie in Ruhe durchlesen, <b style={{ color: C.text }}>Ihre tatsächliche Mitarbeiterzahl
                  eingeben</b> und sehen sofort Ihren Preis.
                </p>
                <p style={{ ...s.unter, marginTop: 12 }}>
                  Und wenn Sie mögen, buchen Sie dort gleich einen Termin oder fordern das Dossier für Ihre
                  Branche an. <b style={{ color: C.text }}>Kein Formular hier am Bildschirm</b> — Sie entscheiden
                  in Ruhe, wann und ob.
                </p>
                <div style={s.ctaReihe}>
                  <Link href={branchenSeite} style={s.ctaGold}>Zur Branchenseite</Link>
                  <Link href="/vorfuehrung" style={s.ctaLeer}>Andere Branche</Link>
                </div>
                <p style={s.hinweis}>
                  Oder sprechen Sie mich direkt an — ich bin heute hier.<br />
                  <b style={{ color: C.text }}>Martin Gaspar</b> · Gaspar AI Consulting · Böblingen
                </p>
              </div>
              {qr.length > 0 && (
                <div style={s.qrKasten}>
                  <QrBild matrix={qr} />
                  <div style={s.qrText}>{qrZiel.replace('https://', '')}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div style={s.steuerung}>
        <button onClick={zurueck} style={s.knopf}>‹ Zurück</button>
        <button onClick={weiter} style={{ ...s.knopf, ...s.knopfHaupt }}>Weiter ›</button>
      </div>
    </div>
  );
}

/** QR-Code als Vektorgrafik — scharf auf jedem Bildschirm, ohne Bilddatei. */
function QrBild({ matrix }: { matrix: boolean[][] }) {
  const n = matrix.length;
  const rand = 2;
  const gesamt = n + rand * 2;
  const felder: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) felder.push(`M${x + rand} ${y + rand}h1v1h-1z`);
    }
  }
  return (
    <svg viewBox={`0 0 ${gesamt} ${gesamt}`} width="260" height="260" role="img" aria-label="QR-Code zu dieser Seite">
      <rect width={gesamt} height={gesamt} fill="#ffffff" rx="1" />
      <path d={felder.join('')} fill="#0A1628" />
    </svg>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: `radial-gradient(1200px 700px at 50% -10%, #14243c 0%, ${C.navy} 60%)`, color: C.text, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  balkenreihe: { display: 'flex', gap: 6, padding: '14px 24px 0' },
  balken: { flex: 1, height: 8, borderRadius: 999, background: 'rgba(143,163,190,0.18)', border: '2px solid transparent', padding: 0, overflow: 'hidden', cursor: 'pointer' },
  balkenFill: { display: 'block', height: '100%', background: `linear-gradient(90deg, ${C.gold}, ${C.gold2})`, borderRadius: 999 },
  kopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 24px 0' },
  kopfMitte: { textAlign: 'center', flex: 1, minWidth: 0 },
  kategorie: { color: C.gold, fontSize: 14, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase' },
  kapitel: { color: C.dim, fontSize: 13.5, marginTop: 3 },
  zurueckLink: { color: C.dim, textDecoration: 'none', fontSize: 15, fontWeight: 700, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '9px 15px', whiteSpace: 'nowrap' },
  pause: { color: C.dim, background: 'transparent', border: `1px solid ${C.rand}`, borderRadius: 10, padding: '9px 15px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  buehne: { flex: 1, maxWidth: 1180, width: '100%', margin: '0 auto', padding: '32px 30px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 15 },
  oben: { color: C.gold, fontSize: 15, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' },
  h1: { fontSize: 50, fontWeight: 800, margin: 0, lineHeight: 1.08 },
  h2: { fontSize: 39, fontWeight: 800, margin: 0, lineHeight: 1.15 },
  gross: { fontSize: 22, color: C.dim, margin: 0 },
  schmerzBlock: { borderLeft: `4px solid ${C.gold}`, paddingLeft: 22, marginTop: 12 },
  schmerzTitel: { color: C.gold, fontSize: 16, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 },
  schmerzZeile: { fontSize: 25, lineHeight: 1.45, marginBottom: 7 },
  unter: { fontSize: 19, lineHeight: 1.55, color: C.dim, margin: 0, maxWidth: 880 },
  hinweis: { fontSize: 16.5, lineHeight: 1.55, color: C.dim, margin: '6px 0 0', maxWidth: 880 },
  modulGitter: { display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 4 },
  modul: { border: '1px solid', borderRadius: 999, padding: '9px 16px', fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' },
  antwortBox: { background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 18, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 15, marginTop: 4 },
  antwortZeile: { display: 'flex', gap: 14, alignItems: 'flex-start', fontSize: 21, lineHeight: 1.45 },
  punkt: { width: 11, height: 11, borderRadius: '50%', marginTop: 9, flexShrink: 0 },
  punkteReihe: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 8 },
  punktKarte: { background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 18, padding: '24px 24px 26px' },
  punktNr: { fontSize: 34, fontWeight: 800, color: C.gold, lineHeight: 1 },
  punktText: { fontSize: 19, lineHeight: 1.5, marginTop: 12 },
  raenge: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  rang: { display: 'inline-flex', alignItems: 'center', gap: 9, border: '1px solid', borderRadius: 999, padding: '9px 17px', fontSize: 16.5, fontWeight: 700 },
  rangPunkt: { width: 11, height: 11, borderRadius: '50%' },
  schritte: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 4 },
  schritt: { display: 'flex', gap: 13, background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 14, padding: '15px 18px', fontSize: 17, lineHeight: 1.4 },
  schrittIcon: { fontSize: 24, lineHeight: 1.2 },
  schrittText: { display: 'block', color: C.dim, fontSize: 15, marginTop: 4 },
  groessen: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  groesse: { border: '2px solid', borderRadius: 14, padding: '14px 24px', fontSize: 19, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent' },
  preisBox: { background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 18, padding: '20px 26px', marginTop: 6 },
  preisZeile: { display: 'flex', justifyContent: 'space-between', gap: 20, fontSize: 18.5, padding: '7px 0', borderBottom: `1px solid ${C.rand}` },
  preisSumme: { fontSize: 26, fontWeight: 800, paddingTop: 13, borderBottom: 'none' },
  preisFuss: { color: C.dim, fontSize: 16, lineHeight: 1.6, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${C.rand}` },
  qrReihe: { display: 'flex', gap: 40, alignItems: 'center', flexWrap: 'wrap' },
  qrKasten: { background: '#fff', borderRadius: 18, padding: '18px 18px 12px', textAlign: 'center', flexShrink: 0 },
  qrText: { color: '#5A6B82', fontSize: 12.5, marginTop: 8, fontWeight: 600 },
  ctaReihe: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16 },
  ctaGold: { background: C.gold, color: C.navy, textDecoration: 'none', borderRadius: 12, padding: '16px 28px', fontSize: 18, fontWeight: 800 },
  ctaLeer: { color: C.text, textDecoration: 'none', border: `1px solid ${C.rand}`, borderRadius: 12, padding: '16px 28px', fontSize: 18, fontWeight: 700 },
  steuerung: { display: 'flex', gap: 12, justifyContent: 'center', padding: '10px 24px 26px' },
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.rand}`, borderRadius: 12, padding: '15px 34px', fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  knopfHaupt: { background: C.gold, color: C.navy, border: '1px solid transparent', fontWeight: 800 },
};
