'use client';

// ============================================================================
// ARGONAUT OS · app/admin/demo-betriebe/page.tsx
//
// Der Knopf für die Präsentation: legt die 23 Vorführ-Betriebe an und zeigt
// (Paket 299: oben die Zeitreise je Branche — leer, erste Monate, 18 Monate)
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
import { DEMO_BETRIEBE, GRUND_BETRIEBE, demoEmail, demoPasswort } from '@/lib/demoBetriebe';
import { ZEITREISE, zeitreiseKarten, zeitreiseSlugs, KUNDEN_LOGIN } from '@/lib/demoZeitreise';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', rot: '#e06666',
  text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)',
};

type Ergebnis = {
  slug: string; firma: string; email: string; passwort: string;
  userId: string | null; neu: boolean; module: number; datensaetze: number; fachdaten?: number;
  haken: number; prozent: number; hinweise: string[];
};

export default function DemoBetriebePage() {
  const [laeuft, setLaeuft] = useState(false);
  const [zuruecksetzen, setZuruecksetzen] = useState(false);
  const [fehler, setFehler] = useState('');
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[] | null>(null);

  async function anlegen(nur?: string[]) {
    if (laeuft) return;
    setLaeuft(true);
    setFehler('');
    try {
      const r = await fetch('/api/admin/demo-betriebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nur ? { zuruecksetzen, nur } : { zuruecksetzen }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || 'Anlegen fehlgeschlagen');
      // Paket 300: Ergebnisse sammeln statt ersetzen — die Zeitreisen laufen Reihe für Reihe
      const neu = j.ergebnisse as Ergebnis[];
      setErgebnisse((alt) => [...(alt || []).filter((x) => !neu.some((n) => n.slug === x.slug)), ...neu]);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLaeuft(false);
    }
  }

  const mitHinweis = (ergebnisse || []).filter((e) => e.hinweise.length > 0).length;
  const [kopiert, setKopiert] = useState('');
  const [fortschritt, setFortschritt] = useState('');
  async function alleZeitreisen() {
    if (laeuft) return;
    for (let i = 0; i < ZEITREISE.length; i++) {
      setFortschritt(`${i + 1} von ${ZEITREISE.length}: ${ZEITREISE[i].branche}`);
      await anlegen(zeitreiseSlugs(ZEITREISE[i]));
    }
    setFortschritt('');
  }
  async function kopieren(text: string) {
    try { await navigator.clipboard.writeText(text); setKopiert(text); setTimeout(() => setKopiert(''), 1500); } catch { /* Zwischenablage gesperrt — Text steht sichtbar da */ }
  }

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
        {/* Paket 299: Zeitreise — leer, erste Monate, nach 18 Monaten */}
        <p style={s.eyebrow}>Präsentation beim Kunden</p>
        <h1 style={s.h1}>Zeitreise: So wächst ARGONAUT mit dem Betrieb</h1>
        <p style={s.sub}>
          Erst das leere Konto zeigen, dann den Betrieb nach den ersten Monaten, dann den nach anderthalb Jahren — dort sieht der Kunde,
          was das ganze System kann. Je Stufe ein eigener Login; am besten jede Stufe in einem eigenen privaten Browserfenster öffnen.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
          <button onClick={() => void alleZeitreisen()} disabled={laeuft} style={{ ...s.knopf, marginTop: 0, opacity: laeuft ? 0.6 : 1 }}>
            {laeuft && fortschritt ? `Läuft … ${fortschritt}` : `Alle ${ZEITREISE.length} Zeitreisen anlegen`}
          </button>
          <span style={{ color: C.dim, fontSize: 13.5 }}>Reihe für Reihe, je etwa eine Minute — das Fenster dabei offen lassen.</span>
        </div>
        {ZEITREISE.map((reihe) => (
          <section key={reihe.key} style={s.reihe}>
            <div style={s.reiheKopf}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{reihe.icon} {reihe.branche}</span>
              <button onClick={() => void anlegen(zeitreiseSlugs(reihe))} disabled={laeuft} style={{ ...s.knopfKlein, opacity: laeuft ? 0.6 : 1 }}>
                {laeuft ? 'Wird angelegt …' : 'Alle Stufen anlegen / auffrischen'}
              </button>
            </div>
            <div style={s.stufen}>
              {zeitreiseKarten(reihe).map((k) => {
                const e = (ergebnisse || []).find((x) => x.slug === k.slug);
                return (
                  <div key={k.slug} style={s.stufe}>
                    <div style={s.stufeNr}>Stufe {k.nr}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{k.titel}</div>
                    <div style={{ color: C.gold, fontWeight: 700, fontSize: 14, marginTop: 6 }}>{k.firma}</div>
                    <div style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.5, marginTop: 8, flex: 1 }}>{k.zeigt}</div>
                    <div style={s.zugang}>
                      <button onClick={() => void kopieren(k.email)} style={s.kopier} title="E-Mail kopieren">
                        {kopiert === k.email ? '✓ kopiert' : k.email}
                      </button>
                      <button onClick={() => void kopieren(k.passwort)} style={s.kopier} title="Passwort kopieren">
                        {kopiert === k.passwort ? '✓ kopiert' : k.passwort}
                      </button>
                    </div>
                    <a href={KUNDEN_LOGIN} target="_blank" rel="noopener noreferrer" style={s.login}>Anmeldung öffnen →</a>
                    {e && (
                      <div style={{ fontSize: 12.5, marginTop: 8, color: e.hinweise.length ? C.gold : C.green }}>
                        {e.hinweise.length ? e.hinweise.join(' · ') : `bereit · ${e.datensaetze + (e.fachdaten || 0)} Datensätze neu · ${e.prozent} % Startstrecke`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <h2 style={s.h2}>Alle Vorführ-Betriebe</h2>
        <p style={s.sub}>
          {GRUND_BETRIEBE.length} Demo-Betriebe — je Branche einer, plus je ein zweiter für Handwerk und Lebensmittel.
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

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => void anlegen()} disabled={laeuft} style={{ ...s.knopf, opacity: laeuft ? 0.6 : 1 }}>
            {laeuft ? 'Wird angelegt … das dauert ein bis zwei Minuten' : `${GRUND_BETRIEBE.length} Betriebe anlegen`}
          </button>
          {/* Paket 297: nur das Vorführ-Autohaus — mit vollem Kfz-Fachpaket (Bestand, Ankauf, Verkauf, Werkstatt, Vermietung) */}
          <button onClick={() => void anlegen(['autohaus'])} disabled={laeuft} style={{ ...s.knopf, background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, opacity: laeuft ? 0.6 : 1 }}>
            🚗 Nur Autohaus (mit Kfz-Fachdaten)
          </button>
          {/* Paket 298: großes Premium-Autohaus, ein Jahr im Betrieb — 50 Mitarbeiter, ca. 120 Fahrzeuge, ca. 500 Verkäufe, Media-Abteilung */}
          <button onClick={() => void anlegen(['premium'])} disabled={laeuft} style={{ ...s.knopf, background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, opacity: laeuft ? 0.6 : 1 }}>
            🏁 Nur Premium-Autohaus (1 Jahr Betrieb, 50 Mitarbeiter)
          </button>
        </div>
        <p style={s.sub}>
          Das Autohaus bekommt zusätzlich ein volles Kfz-Fachpaket: 21 Fahrzeuge vom Zulauf bis verkauft (auch Vorjahr für den Chef-Blick),
          Ankauf, Verkaufsvorgänge, Anfragen, Probefahrten, Brief-Tresor, Zulassung, Werkstatt und Ersatzwagen. Rechnungen aus dem
          Fahrzeugverkauf entstehen erst in der Vorführung per Knopf.
        </p>
        <p style={s.sub}>
          Das Premium-Autohaus (Valtier Automobile) zeigt den vollen Betrieb nach einem Jahr: 50 Mitarbeiter in Abteilungen (Geschäftsführung,
          Vertrieb, Media mit Videocuttern, Werkstatt, Aufbereitung, Teile, Zulassung, Buchhaltung, Empfang), rund 120 Premium-Fahrzeuge im
          Bestand, rund 500 Verkäufe über 21 Monate (Chef-Blick mit Vorjahresvergleich und Verkäufer-Rangliste), Werkstatt mit Kundenfahrzeugen
          aus dem eigenen Verkauf, Kampagnen, Inhalte-Bibliothek und Redaktionskalender der Media-Abteilung. Das Anlegen dauert etwa eine Minute.
          Foto- und Videodateien sind nicht dabei — die lädt man vor dem Termin selbst am Fahrzeug hoch.
        </p>

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
                      : <span style={{ color: C.green }}>{e.datensaetze} Datensätze{e.fachdaten ? ` · ${e.fachdaten} Fachdaten neu` : ''} · {e.module} Module · {e.prozent} %</span>}
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
  eyebrow: { color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 8px' },
  reihe: { marginTop: 18, background: C.navy2, border: `1px solid rgba(201,168,76,0.35)`, borderRadius: 16, padding: '16px 18px' },
  reiheKopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  stufen: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 14 },
  stufe: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.rand}`, borderRadius: 12, padding: '14px 15px' },
  stufeNr: { color: C.cyan, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' },
  zugang: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  kopier: { background: 'transparent', color: C.text, border: `1px solid ${C.rand}`, borderRadius: 8, padding: '6px 10px', fontSize: 12.5, fontFamily: 'ui-monospace, monospace', cursor: 'pointer' },
  login: { marginTop: 12, alignSelf: 'flex-start', background: C.gold, color: C.navy, borderRadius: 9, padding: '9px 14px', fontSize: 13.5, fontWeight: 800, textDecoration: 'none' },
  knopfKlein: { background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 9, padding: '8px 14px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
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
