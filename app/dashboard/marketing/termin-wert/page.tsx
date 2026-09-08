'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  kundenwert, trichter, zielpreis, bewerteKosten, wertJeAktivitaet, bedarfFuerZiel,
  type KostenAmpel,
} from '@/lib/terminWert';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · Termin-Wert-Rechner
// Beantwortet die Frage vor jeder Werbeentscheidung: Was darf eine
// Anfrage, ein gebuchter und ein gehaltener Termin kosten?
// Reine Rechnung im Browser — kein KI-Aufruf, keine Datenbank, 0 Cent.
// Die Eingaben bleiben im Geraet des Nutzers (localStorage).
// Look = Kunden-Dashboard.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

const SPEICHER = 'argonaut_terminwert';

type Felder = {
  monatlich: string; monate: string; einmalig: string;
  abschluss: string; erscheinen: string; eintragung: string;
  kosten: string; aktivitaeten: string; ziel: string;
};

// Beispielwerte, damit die Seite sofort etwas zeigt statt leer dazustehen.
const START: Felder = {
  monatlich: '0', monate: '12', einmalig: '3000',
  abschluss: '25', erscheinen: '50', eintragung: '20',
  kosten: '', aktivitaeten: '', ziel: '',
};

function euro(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function euroGenau(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function anzahl(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

const AMPEL_FARBE: Record<KostenAmpel, string> = {
  gut: C.green, knapp: C.warn, verlust: C.danger, offen: C.textDim,
};
const AMPEL_TEXT: Record<KostenAmpel, string> = {
  gut: 'Gut — es bleibt reichlich übrig',
  knapp: 'Knapp — Sie verdienen noch, aber wenig',
  verlust: 'Verlust — die Gewinnung kostet mehr, als der Kunde bringt',
  offen: 'Noch keine eigenen Kosten eingetragen',
};

export default function TerminWertPage() {
  const [f, setF] = useState<Felder>(START);
  const [geladen, setGeladen] = useState(false);

  // Eingaben merken — rein oertlich im Browser, nichts wird uebertragen.
  useEffect(() => {
    try {
      const roh = window.localStorage.getItem(SPEICHER);
      if (roh) {
        const gespeichert = JSON.parse(roh) as Partial<Felder>;
        setF((alt) => ({ ...alt, ...gespeichert }));
      }
    } catch { /* kein Speicher verfuegbar — dann eben die Beispielwerte */ }
    setGeladen(true);
  }, []);

  useEffect(() => {
    if (!geladen) return;
    try { window.localStorage.setItem(SPEICHER, JSON.stringify(f)); } catch { /* egal */ }
  }, [f, geladen]);

  const setzen = (feld: keyof Felder) => (e: ChangeEvent<HTMLInputElement>) => {
    const wert = e.target.value;
    setF((alt) => ({ ...alt, [feld]: wert }));
  };

  const wert = useMemo(
    () => kundenwert({ monatlich: f.monatlich, monate: f.monate, einmalig: f.einmalig }),
    [f.monatlich, f.monate, f.einmalig],
  );

  const t = useMemo(
    () => trichter(wert, { abschluss: f.abschluss, erscheinen: f.erscheinen, eintragung: f.eintragung }),
    [wert, f.abschluss, f.erscheinen, f.eintragung],
  );

  const zielEintragung = zielpreis(t.wertJeEintragung);
  const zielTermin = zielpreis(t.wertJeGebuchtem);
  const urteil = bewerteKosten(f.kosten, t.wertJeEintragung);
  const jeAktivitaet = wertJeAktivitaet(wert, f.aktivitaeten);
  const bedarf = bedarfFuerZiel(f.ziel, t);

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 800, margin: 0 }}>
        🎯 Termin-Wert-Rechner
      </h1>
      <p style={{ color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 22px', maxWidth: 820 }}>
        Bevor Sie Geld in Werbung stecken, brauchen Sie eine einzige Zahl:{' '}
        <b style={{ color: C.text }}>Was darf eine Anfrage kosten?</b> Diese Seite rechnet sie
        rückwärts aus Ihrem Kundenwert und Ihren Quoten. Alles geschieht in Ihrem Browser —
        nichts wird gespeichert oder übertragen, und es entstehen keine Kosten.
      </p>

      {/* ---------- Eingaben ---------- */}
      <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Ihre Zahlen</div>
        <div style={{ color: C.textDim, fontSize: 12.5, marginBottom: 16 }}>
          Voreingetragen sind Beispielwerte. Überschreiben Sie sie mit Ihren eigenen — die Seite rechnet sofort mit.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <Feld label="Wiederkehrend je Monat" einheit="€" wert={f.monatlich} onChange={setzen('monatlich')}
                hinweis="Wartungsvertrag, Abo, Betreuung — sonst 0" />
          <Feld label="Betrachtete Laufzeit" einheit="Monate" wert={f.monate} onChange={setzen('monate')}
                hinweis="Wie lange bleibt ein Kunde üblicherweise?" />
          <Feld label="Einmalig je Auftrag" einheit="€" wert={f.einmalig} onChange={setzen('einmalig')}
                hinweis="Der übliche Auftragswert beim ersten Mal" />
        </div>

        <div style={{ height: 1, background: C.border, margin: '18px 0' }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <Feld label="Abschlussquote" einheit="%" wert={f.abschluss} onChange={setzen('abschluss')}
                hinweis="Von den gehaltenen Terminen: wie viele werden Kunde?" />
          <Feld label="Erscheinungsquote" einheit="%" wert={f.erscheinen} onChange={setzen('erscheinen')}
                hinweis="Von den gebuchten Terminen: wie viele finden statt?" />
          <Feld label="Anfrage wird Termin" einheit="%" wert={f.eintragung} onChange={setzen('eintragung')}
                hinweis="Von den Anfragen: wie viele buchen einen Termin?" />
        </div>
      </div>

      {/* ---------- Ergebnis ---------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KpiTile label="Kundenwert" wert={euro(wert)} farbe={C.cyan} sub="über die betrachtete Laufzeit" />
        <KpiTile label="Wert je Anfrage" wert={euro(t.wertJeEintragung)} farbe={C.gold} sub="das ist Ihre Obergrenze" />
        <KpiTile label="Wert je gebuchtem Termin" wert={euro(t.wertJeGebuchtem)} farbe={C.gold} sub={t.gebuchteTermine != null ? `${anzahl(t.gebuchteTermine)} Termine je Kunde` : undefined} />
        <KpiTile label="Wert je gehaltenem Termin" wert={euro(t.wertJeGehaltenem)} farbe={C.green} sub={t.gehalteneTermine != null ? `${anzahl(t.gehalteneTermine)} davon finden statt` : undefined} />
      </div>

      {/* ---------- Die Kette ---------- */}
      <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Der Weg zu einem Kunden</div>
        <div style={{ color: C.textDim, fontSize: 12.5, marginBottom: 16 }}>
          So viele Ereignisse braucht es auf jeder Stufe, damit am Ende <b style={{ color: C.text }}>ein</b> Kunde steht.
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, flexWrap: 'wrap' }}>
          <Kettenglied icon="🧲" titel="Anfragen" wert={anzahl(t.eintragungen)} farbe={C.cyan} unterzeile={t.wertJeEintragung != null ? `${euro(t.wertJeEintragung)} wert` : 'Quote fehlt'} />
          <Pfeil label={`${f.eintragung || '—'} % buchen`} />
          <Kettenglied icon="📅" titel="Gebuchte Termine" wert={anzahl(t.gebuchteTermine)} farbe={C.gold} unterzeile={t.wertJeGebuchtem != null ? `${euro(t.wertJeGebuchtem)} wert` : 'Quote fehlt'} />
          <Pfeil label={`${f.erscheinen || '—'} % erscheinen`} />
          <Kettenglied icon="🤝" titel="Gehaltene Termine" wert={anzahl(t.gehalteneTermine)} farbe={C.gold} unterzeile={t.wertJeGehaltenem != null ? `${euro(t.wertJeGehaltenem)} wert` : 'Quote fehlt'} />
          <Pfeil label={`${f.abschluss || '—'} % schließen ab`} />
          <Kettenglied icon="💰" titel="Kunde" wert="1" farbe={C.green} unterzeile={euro(wert)} />
        </div>
      </div>

      {/* ---------- Zielpreis und Ampel ---------- */}
      <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Was Sie ausgeben sollten</div>
        <div style={{ color: C.textDim, fontSize: 13.5, lineHeight: 1.6, marginBottom: 16, maxWidth: 780 }}>
          Die Obergrenze ist nicht Ihr Zielpreis: Wer genau den vollen Wert ausgibt, arbeitet umsonst.
          Ein Drittel für die Gewinnung ist eine gesunde Faustregel — zwei Drittel bleiben für
          Leistung und Gewinn.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
          <KpiTile label="Zielpreis je Anfrage" wert={euroGenau(zielEintragung)} farbe={C.green} sub={t.wertJeEintragung != null ? `Obergrenze ${euro(t.wertJeEintragung)}` : 'Quote fehlt'} />
          <KpiTile label="Zielpreis je Termin" wert={euroGenau(zielTermin)} farbe={C.green} sub={t.wertJeGebuchtem != null ? `Obergrenze ${euro(t.wertJeGebuchtem)}` : 'Quote fehlt'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, alignItems: 'end' }}>
          <Feld label="Was eine Anfrage Sie heute kostet" einheit="€" wert={f.kosten} onChange={setzen('kosten')}
                hinweis="Werbekosten geteilt durch Anfragen" />
          <div style={{
            background: C.navy, border: `1px solid ${C.border}`, borderLeft: `3px solid ${AMPEL_FARBE[urteil.ampel]}`,
            borderRadius: 12, padding: '12px 14px',
          }}>
            <div style={{ color: AMPEL_FARBE[urteil.ampel], fontWeight: 700, fontSize: 13.5 }}>
              {AMPEL_TEXT[urteil.ampel]}
            </div>
            {urteil.anteil != null && (
              <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 3 }}>
                Das sind {urteil.anteil.toLocaleString('de-DE', { maximumFractionDigits: 0 })} % des Werts einer Anfrage.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Planung ---------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px' }}>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Was Ihr Umsatzziel bedeutet</div>
          <div style={{ color: C.textDim, fontSize: 12.5, marginBottom: 14 }}>Die Gegenrichtung: vom Ziel zurück auf die nötige Arbeit.</div>
          <Feld label="Umsatzziel im Monat" einheit="€" wert={f.ziel} onChange={setzen('ziel')} hinweis="" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
            <MiniWert zahl={anzahl(bedarf.kunden)} text="Kunden" />
            <MiniWert zahl={anzahl(bedarf.termine)} text="Termine buchen" />
            <MiniWert zahl={anzahl(bedarf.eintragungen)} text="Anfragen sammeln" />
          </div>
        </div>

        <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px' }}>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Was ein einzelner Anruf wert ist</div>
          <div style={{ color: C.textDim, fontSize: 12.5, marginBottom: 14 }}>
            Fuer Kanaele, die Zeit statt Geld kosten. Auch der Anruf, bei dem niemand rangeht, zaehlt mit.
          </div>
          <Feld label="Aktivitaeten je gewonnenem Kunden" einheit="Stueck" wert={f.aktivitaeten} onChange={setzen('aktivitaeten')}
                hinweis="Anrufe, Nachrichten oder Besuche — grob geschaetzt reicht" />
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 28, color: jeAktivitaet != null ? C.gold : C.textDim, lineHeight: 1.1 }}>
              {euroGenau(jeAktivitaet)}
            </div>
            <div style={{ color: C.text, fontSize: 13, marginTop: 4 }}>Wert je Aktivitaet</div>
          </div>
        </div>
      </div>

      <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.6, marginTop: 18, maxWidth: 820 }}>
        Gerechnet wird ohne Umwege: Kundenwert geteilt durch die Anzahl der Ereignisse je Stufe.
        Fehlt eine Quote, bleibt die Stufe leer statt geraten. Die Quoten schaetzen Sie am Anfang —
        ersetzen Sie sie, sobald Sie eigene Zahlen haben. Genau dann wird aus Schaetzung Planung.
      </div>
    </div>
  );
}

// ---------------- Bausteine ----------------

function Feld({ label, einheit, wert, onChange, hinweis }: {
  label: string; einheit: string; wert: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void; hinweis?: string;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', color: C.text, fontSize: 13, marginBottom: 6 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 12px' }}>
        <input
          value={wert}
          onChange={onChange}
          inputMode="decimal"
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
            color: C.text, fontFamily: 'inherit', fontSize: 15, padding: '10px 0',
          }}
        />
        <span style={{ color: C.textDim, fontSize: 12.5, flexShrink: 0 }}>{einheit}</span>
      </span>
      {hinweis ? <span style={{ display: 'block', color: C.textDim, fontSize: 11.5, marginTop: 5, lineHeight: 1.45 }}>{hinweis}</span> : null}
    </label>
  );
}

function KpiTile({ label, wert, farbe, sub }: { label: string; wert: string; farbe: string; sub?: string }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 28, color: farbe, lineHeight: 1.1 }}>{wert}</div>
      <div style={{ color: C.text, fontSize: 13, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Kettenglied({ icon, titel, wert, farbe, unterzeile }: { icon: string; titel: string; wert: string; farbe: string; unterzeile?: string }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 130, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 4 }}>{titel}</div>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 22, color: farbe, marginTop: 2 }}>{wert}</div>
      {unterzeile && <div style={{ color: C.textDim, fontSize: 11.5, marginTop: 2 }}>{unterzeile}</div>}
    </div>
  );
}

function Pfeil({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 90, padding: '0 4px' }}>
      <div style={{ color: C.textDim, fontSize: 22, lineHeight: 1 }}>→</div>
      <div style={{ color: C.textDim, fontSize: 11, marginTop: 4, textAlign: 'center' }}>{label}</div>
    </div>
  );
}

function MiniWert({ zahl, text }: { zahl: string; text: string }) {
  return (
    <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 20, color: C.gold, lineHeight: 1.1 }}>{zahl}</div>
      <div style={{ color: C.textDim, fontSize: 11.5, marginTop: 3 }}>{text}</div>
    </div>
  );
}
