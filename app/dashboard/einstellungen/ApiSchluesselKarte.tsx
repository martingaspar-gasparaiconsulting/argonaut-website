'use client';

// ============================================================
// ARGONAUT OS · Block 2 · Welle 1 · C4-3d
// API-Schlüssel für Automatisierung (n8n & Co).
//
// DER SCHLÜSSEL WIRD GENAU EINMAL ANGEZEIGT.
//   Direkt nach dem Erzeugen, in einem Kasten mit Kopierknopf. Danach ist er
//   fort — auch für ARGONAUT. In der Datenbank liegt nur ein SHA-256-Hash.
//   Wer die Datenbank kompromittiert, hat Hashes, keine Schlüssel.
//
//   Verloren? Dann widerrufen und einen neuen erzeugen. Das dauert zehn
//   Sekunden. Ein Schlüssel, den man wieder anzeigen kann, ist kein Geheimnis.
//
// Pfad: app/dashboard/einstellungen/ApiSchluesselKarte.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

type Schluessel = {
  id: string;
  hinweis: string | null;
  bezeichnung: string;
  aktiv: boolean;
  letzte_nutzung: string | null;
  nutzungen: number;
  erstellt_am: string;
};

function datumHuebsch(iso: string | null): string {
  if (!iso) return 'nie';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('de-DE') : '—';
}

export default function ApiSchluesselKarte() {
  const [liste, setListe] = useState<Schluessel[]>([]);
  const [laden, setLaden] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);

  const [bezeichnung, setBezeichnung] = useState('n8n');
  /** Nur solange die Seite offen ist. Wird nirgends gespeichert. */
  const [frischerSchluessel, setFrischerSchluessel] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  // --- Verbindungstest: der Schlüssel ruft die echte API auf -----------
  const [testSchluessel, setTestSchluessel] = useState('');
  const [testLaeuft, setTestLaeuft] = useState(false);
  const [testErgebnis, setTestErgebnis] = useState<{ ok: boolean; text: string } | null>(null);

  function melde(t: string) {
    setErfolg(t); setFehler(null);
    setTimeout(() => setErfolg(null), 3000);
  }

  const alles = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const res = await fetch('/api/betrieb/api-schluessel', { cache: 'no-store' });
      if (!res.ok) throw new Error('Laden fehlgeschlagen');
      const d = await res.json();
      setListe((d.schluessel as Schluessel[]) ?? []);
    } catch {
      setFehler('Die Schlüssel konnten nicht geladen werden.');
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void alles(); }, [alles]);

  async function erzeugen() {
    if (!window.confirm(
      'Neuen API-Schlüssel erzeugen?\n\n' +
      'Er wird nur EINMAL angezeigt. Danach lässt er sich nicht mehr abrufen — ' +
      'auch nicht von ARGONAUT.\n\nBereit zum Kopieren?'
    )) return;

    setLaeuft(true); setFehler(null); setFrischerSchluessel(null); setKopiert(false);
    try {
      const res = await fetch('/api/betrieb/api-schluessel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bezeichnung: bezeichnung.trim() || 'n8n' }),
      });
      const d = await res.json();
      if (!res.ok) { setFehler(d?.error ?? 'Erzeugen fehlgeschlagen.'); return; }

      setFrischerSchluessel(d.klartext as string);
      await alles();
    } catch {
      setFehler('Erzeugen fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setLaeuft(false); }
  }

  async function widerrufen(s: Schluessel) {
    if (!window.confirm(
      `Schlüssel „${s.bezeichnung}" (${s.hinweis}) widerrufen?\n\n` +
      'Jede Automatisierung, die ihn benutzt, funktioniert danach nicht mehr.'
    )) return;

    setLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/betrieb/api-schluessel', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id }),
      });
      if (!res.ok) { setFehler('Widerrufen fehlgeschlagen.'); return; }
      await alles();
      melde('Schlüssel widerrufen.');
    } catch {
      setFehler('Widerrufen fehlgeschlagen.');
    } finally { setLaeuft(false); }
  }

  /**
   * Ruft /api/preisauskunft mit dem eingegebenen Schlüssel auf — genau so,
   * wie n8n es später tut. Der Schlüssel verlässt den Browser nur an ARGONAUT.
   */
  async function verbindungTesten() {
    const k = testSchluessel.trim();
    if (!k) { setFehler('Bitte den Schlüssel einfügen.'); return; }

    setTestLaeuft(true); setFehler(null); setTestErgebnis(null);
    try {
      const res = await fetch('/api/preisauskunft', {
        method: 'POST',
        headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ holzart: 'buche', scheitlaenge_cm: 33, trocknungsgrad: 'lufttrocken', menge: 8, einheit: 'srm', km: 42 }),
      });
      const d = await res.json();

      if (res.status === 401) {
        setTestErgebnis({ ok: false, text: 'Der Schlüssel wurde abgelehnt. Ist er richtig kopiert?' });
      } else if (d?.ok) {
        setTestErgebnis({
          ok: true,
          text: `✓ Verbindung steht.\n\nTestanfrage: 8 SRM Buche 33 cm lufttrocken, 42 km Anfahrt\n\n${d.kurztext}`,
        });
      } else {
        // Kein Fehler des Schlüssels — die Stammdaten sind unvollständig.
        setTestErgebnis({
          ok: false,
          text: `Der Schlüssel funktioniert, aber die Testanfrage ging nicht durch:\n\n${d?.error ?? 'Unbekannter Grund.'}\n\nLeg unter Brennholz eine Variante „Buche · 33 cm · lufttrocken" mit Preis an, dann klappt der Test.`,
        });
      }
    } catch {
      setTestErgebnis({ ok: false, text: 'Die Anfrage ist fehlgeschlagen. Bitte erneut versuchen.' });
    } finally { setTestLaeuft(false); }
  }

  async function kopieren() {
    if (!frischerSchluessel) return;
    try {
      await navigator.clipboard.writeText(frischerSchluessel);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 3000);
    } catch {
      setFehler('Kopieren nicht möglich. Bitte den Schlüssel von Hand markieren.');
    }
  }

  return (
    <section style={styles.wrap}>
      <h2 style={styles.h2}>Automatisierung</h2>
      <p style={styles.sub}>
        Ein API-Schlüssel erlaubt es einer Automatisierung — etwa n8n — im Namen deines Betriebs
        Preisauskünfte abzurufen. Jeder Betrieb hat seinen eigenen Schlüssel. Er ist die Zuordnung:
        was mit ihm abgefragt wird, gehört zu dir und zu niemandem sonst.
      </p>

      <div style={styles.card}>
        <div style={styles.kopf}>
          <span style={styles.titel}>🔑 API-Schlüssel</span>
          <span style={{ color: C.textDim, fontSize: 12.5 }}>
            {liste.length} von 5 aktiv
          </span>
        </div>

        {/* --- Der frisch erzeugte Schlüssel: EINMALIGE Anzeige --- */}
        {frischerSchluessel && (
          <div style={styles.frischBox}>
            <div style={{ color: C.warn, fontWeight: 700, marginBottom: 8 }}>
              ⚠ Jetzt kopieren — dieser Schlüssel wird nie wieder angezeigt.
            </div>
            <div style={styles.schluesselText}>{frischerSchluessel}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={kopieren} style={styles.goldBtn}>
                {kopiert ? '✓ In der Zwischenablage' : '📋 Kopieren'}
              </button>
              <button onClick={() => setFrischerSchluessel(null)} style={styles.ghostBtn}>
                Ich habe ihn sicher verwahrt
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 12, lineHeight: 1.55 }}>
              Auch ARGONAUT kann ihn nicht mehr anzeigen — gespeichert ist nur ein unumkehrbarer
              Fingerabdruck. Verloren? Dann widerrufen und einen neuen erzeugen, das dauert zehn Sekunden.
            </div>
          </div>
        )}

        {fehler && <div style={styles.err}>{fehler}</div>}
        {erfolg && <div style={styles.okBox}>{erfolg}</div>}

        {/* --- Liste --- */}
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : liste.length === 0 ? (
          <div style={styles.hint}>
            Noch kein Schlüssel vorhanden. Solange keiner existiert, kann keine Automatisierung
            auf deinen Betrieb zugreifen.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {liste.map((s) => (
              <div key={s.id} style={styles.zeile}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {s.bezeichnung} <code style={styles.code}>{s.hinweis}</code>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>
                    angelegt {datumHuebsch(s.erstellt_am)} · zuletzt genutzt {datumHuebsch(s.letzte_nutzung)}
                    {' · '}{s.nutzungen.toLocaleString('de-DE')} Abrufe
                  </div>
                </div>
                <button onClick={() => widerrufen(s)} disabled={laeuft} style={styles.rotBtn}>
                  Widerrufen
                </button>
              </div>
            ))}
          </div>
        )}

        {/* --- Neu erzeugen --- */}
        <div style={styles.sektion}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={styles.lbl}>Bezeichnung</label>
              <input style={styles.input} value={bezeichnung} placeholder="n8n"
                onChange={(e) => setBezeichnung(e.target.value)} />
            </div>
            <button onClick={erzeugen} disabled={laeuft || liste.length >= 5}
              style={{ ...styles.goldBtn, opacity: laeuft || liste.length >= 5 ? 0.5 : 1 }}>
              {laeuft ? 'Erzeugt …' : '+ Schlüssel erzeugen'}
            </button>
          </div>
          {liste.length >= 5 && (
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>
              Mehr als fünf aktive Schlüssel sind nicht vorgesehen. Widerrufe zuerst einen alten.
            </div>
          )}
        </div>

        {/* --- Verbindungstest --- */}
        <div style={styles.sektion}>
          <div style={{ ...styles.titel, fontSize: 13.5, marginBottom: 4 }}>Verbindung testen</div>
          <p style={{ fontSize: 12.5, color: C.textDim, margin: '0 0 12px', lineHeight: 1.55 }}>
            Füge einen Schlüssel ein und schick eine Testanfrage — genau so, wie es die Automatisierung
            später tut. Der Schlüssel wird nirgends gespeichert.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label style={styles.lbl}>Schlüssel</label>
              <input type="password" autoComplete="off" style={styles.input} placeholder="argo_…"
                value={testSchluessel} onChange={(e) => setTestSchluessel(e.target.value)} />
            </div>
            <button onClick={verbindungTesten} disabled={testLaeuft || !testSchluessel.trim()}
              style={{ ...styles.ghostBtn, opacity: testLaeuft || !testSchluessel.trim() ? 0.5 : 1 }}>
              {testLaeuft ? 'Prüft …' : '▶ Testanfrage senden'}
            </button>
          </div>

          {testErgebnis && (
            <div style={testErgebnis.ok ? styles.okBox : styles.warnBox}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{testErgebnis.text}</div>
            </div>
          )}
        </div>

        {/* --- Anleitung --- */}
        <div style={styles.infoBox}>
          <strong>So wird er benutzt</strong><br />
          Die Automatisierung schickt den Schlüssel im Kopf ihrer Anfrage mit:
          <div style={styles.codeBlock}>
            POST /api/preisauskunft<br />
            Authorization: Bearer <em>dein-schlüssel</em>
          </div>
          <span style={{ color: C.textDim }}>
            Niemals in einer Adresszeile oder in einem öffentlichen Verzeichnis ablegen — dort landet er in Protokollen.
          </span>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { marginTop: 40 },
  h2: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: C.text },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: '0 0 20px', lineHeight: 1.6, maxWidth: 640 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  titel: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 17, fontWeight: 700, color: C.text },

  frischBox: { background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.4)`, borderRadius: 12, padding: 16, marginBottom: 18 },
  schluesselText: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13.5, color: C.gold, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', wordBreak: 'break-all', lineHeight: 1.5 },

  zeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', flexWrap: 'wrap' },
  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, color: C.cyan, background: 'rgba(0,229,255,0.08)', borderRadius: 6, padding: '2px 7px', marginLeft: 6 },

  sektion: { marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` },
  lbl: { display: 'block', fontSize: 11.5, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },

  goldBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer' },
  rotBtn: { background: 'transparent', color: C.danger, border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },

  hint: { color: C.textDim, fontSize: 13.5, padding: '10px 0', lineHeight: 1.55 },
  err: { color: C.danger, fontSize: 13.5, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '11px 13px', marginBottom: 14 },
  warnBox: { color: C.text, fontSize: 13, background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, padding: '12px 14px', marginTop: 14, lineHeight: 1.6 },
  okBox: { color: C.green, fontSize: 13.5, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '11px 13px', marginBottom: 14 },
  infoBox: { marginTop: 18, padding: '13px 15px', background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
  codeBlock: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, background: C.navy, borderRadius: 8, padding: '10px 12px', margin: '10px 0', color: C.cyan, lineHeight: 1.7 },
};
