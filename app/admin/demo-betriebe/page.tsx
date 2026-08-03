'use client';

// ============================================================================
// ARGONAUT OS · app/admin/demo-betriebe/page.tsx
//
// Der Knopf für die Präsentation: legt die 21 Vorführ-Betriebe an und zeigt
// anschließend das Zugangsblatt — je Branche eine Zeile mit E-Mail und Passwort.
//
// Gedacht für den Testtag: einmal klicken, Bericht lesen, Blatt ausdrucken.
// Der Bericht sagt je Betrieb, was tatsächlich angelegt wurde — man sieht also,
// ob alles steht, statt es zu hoffen.
//
// Liegt unter /admin und ist damit schon durch app/admin/layout.tsx geschützt
// (nur profiles.role === 'admin' kommt überhaupt hierher).
// ============================================================================

import { useState, type CSSProperties } from 'react';
import { DEMO_BETRIEBE, demoEmail, demoPasswort } from '@/lib/demoBetriebe';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', rot: '#e06666',
  text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)',
};

type Ergebnis = {
  slug: string; firma: string; email: string; passwort: string;
  userId: string | null; neu: boolean; module: number; datensaetze: number;
  haken: number; prozent: number; hinweise: string[];
};

export default function DemoBetriebePage() {
  const [laeuft, setLaeuft] = useState(false);
  const [zuruecksetzen, setZuruecksetzen] = useState(false);
  const [fehler, setFehler] = useState('');
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[] | null>(null);

  async function anlegen() {
    if (laeuft) return;
    setLaeuft(true);
    setFehler('');
    try {
      const r = await fetch('/api/admin/demo-betriebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zuruecksetzen }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || 'Anlegen fehlgeschlagen');
      setErgebnisse(j.ergebnisse as Ergebnis[]);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLaeuft(false);
    }
  }

  const mitHinweis = (ergebnisse || []).filter((e) => e.hinweise.length > 0).length;

  return (
    <div style={s.seite}>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .kein-druck { display: none !important; }
          .druckbar { color: #000 !important; background: #fff !important; border-color: #999 !important; }
        }
      `}</style>

      <div className="kein-druck">
        <h1 style={s.h1}>Vorführ-Betriebe für die Präsentation</h1>
        <p style={s.sub}>
          {DEMO_BETRIEBE.length} Demo-Betriebe — je Branche einer, plus je ein zweiter für Handwerk und Lebensmittel.
          Jeder bekommt eigene Zugangsdaten, vollständige Firmenstammdaten, die Branchen-Module,
          die Übungswelt und den passenden Onboarding-Fortschritt.
        </p>

        <div style={s.hinweisBox}>
          <b>Bevor du klickst:</b> Die Konten werden mit bereits bestätigter E-Mail angelegt — es geht dabei
          <b> keine einzige Nachricht </b> raus. Die Adressen liegen auf <b>demo.argonaut-os.com</b>, wo kein Postfach
          existiert. Die Konten sind als Demo markiert, haben aber <b>kein Ablaufdatum</b> und werden vom
          Aufräum-Cron nicht angefasst.
        </div>

        <label style={s.schalter}>
          <input type="checkbox" checked={zuruecksetzen} onChange={(e) => setZuruecksetzen(e.target.checked)} />
          <span>
            Übungswelt vorher entfernen und neu laden
            <span style={s.schalterDim}> — nur nötig, wenn du die Betriebe schon einmal angelegt hast und frische Beispieldaten willst</span>
          </span>
        </label>

        <button onClick={anlegen} disabled={laeuft} style={{ ...s.knopf, opacity: laeuft ? 0.6 : 1 }}>
          {laeuft ? 'Wird angelegt … das dauert ein bis zwei Minuten' : `${DEMO_BETRIEBE.length} Betriebe anlegen`}
        </button>

        {fehler && <div style={s.fehler}>{fehler}</div>}

        {ergebnisse && (
          <div style={{ ...s.bilanz, borderColor: mitHinweis ? C.gold : C.green }}>
            <b>{ergebnisse.length} Betriebe verarbeitet</b> · {ergebnisse.filter((e) => e.neu).length} neu angelegt ·{' '}
            {ergebnisse.reduce((a, e) => a + e.datensaetze, 0)} Beispiel-Datensätze ·{' '}
            {mitHinweis === 0
              ? <span style={{ color: C.green }}>keine Auffälligkeiten</span>
              : <span style={{ color: C.gold }}>{mitHinweis} mit Hinweis — bitte unten prüfen</span>}
          </div>
        )}
      </div>

      {/* --- Zugangsblatt: das hier wird ausgedruckt ------------------------- */}
      <h2 style={s.h2}>Zugangsblatt</h2>
      <table style={s.tabelle} className="druckbar">
        <thead>
          <tr>
            <th style={s.th}>Branche</th>
            <th style={s.th}>Betrieb</th>
            <th style={s.th}>E-Mail</th>
            <th style={s.th}>Passwort</th>
            <th style={s.th}>Stand</th>
            <th style={{ ...s.th }} className="kein-druck">Ergebnis</th>
          </tr>
        </thead>
        <tbody>
          {DEMO_BETRIEBE.map((b) => {
            const e = (ergebnisse || []).find((x) => x.slug === b.slug);
            return (
              <tr key={b.slug}>
                <td style={s.td}>{b.kategorie}</td>
                <td style={{ ...s.td, fontWeight: 700 }}>{b.firma} {b.rechtsform}</td>
                <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace' }}>{demoEmail(b.slug)}</td>
                <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{demoPasswort(b.slug)}</td>
                <td style={{ ...s.td, color: b.ziel >= 100 ? C.green : C.gold, fontWeight: 700 }}>
                  {b.ziel >= 100 ? 'Kapitän · Zertifikat' : 'bewusst unfertig — zum Vorführen'}
                </td>
                <td style={s.td} className="kein-druck">
                  {!e ? <span style={{ color: C.dim }}>—</span>
                    : e.hinweise.length
                      ? <span style={{ color: C.gold }}>{e.hinweise.join(' · ')}</span>
                      : <span style={{ color: C.green }}>{e.datensaetze} Datensätze · {e.module} Module · {e.prozent} %</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={s.fuss}>
        Alle Firmennamen, Anschriften, Steuernummern und IBANs sind erfunden. Die IBANs haben eine gültige
        Prüfziffer, gehören aber zu keinem Konto — es kann also kein Geld fließen.
      </p>

      <button onClick={() => window.print()} style={s.druckKnopf} className="kein-druck">
        Zugangsblatt drucken
      </button>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { maxWidth: 1180, margin: '0 auto', padding: '28px 20px 70px', color: C.text, background: C.navy, minHeight: '100vh', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontSize: 19, fontWeight: 800, margin: '30px 0 12px' },
  sub: { color: C.dim, fontSize: 15, lineHeight: 1.55, margin: '9px 0 0', maxWidth: 820 },
  hinweisBox: { marginTop: 16, background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.rand}`, borderRadius: 12, padding: '13px 16px', color: C.dim, fontSize: 13.5, lineHeight: 1.6, maxWidth: 820 },
  schalter: { display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 13.5, lineHeight: 1.5, maxWidth: 820, cursor: 'pointer' },
  schalterDim: { color: C.dim },
  knopf: { marginTop: 16, background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '13px 22px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  druckKnopf: { marginTop: 20, background: 'transparent', color: C.cyan, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  fehler: { marginTop: 14, background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.rot}`, borderRadius: 10, padding: '11px 15px', fontSize: 14 },
  bilanz: { marginTop: 14, background: C.navy2, border: '1px solid', borderRadius: 12, padding: '12px 16px', fontSize: 14 },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 12, overflow: 'hidden' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${C.rand}`, color: C.dim, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '9px 12px', borderBottom: `1px solid ${C.rand}`, verticalAlign: 'top' },
  fuss: { color: C.dim, fontSize: 12.5, lineHeight: 1.55, marginTop: 12, maxWidth: 820 },
};
