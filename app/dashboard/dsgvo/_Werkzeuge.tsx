'use client';

// ============================================================================
// ARGONAUT OS · app/dashboard/dsgvo/_Werkzeuge.tsx
//
// Der Arbeitsbereich des DSGVO-Centers. Die bestehende Seite verwaltet, WELCHE
// Anfragen offen sind — hier wird sie tatsaechlich BEANTWORTET:
//
//   1. Auskunft (Art. 15)   — eine fertige Datei zum Weitergeben
//   2. Loeschung (Art. 17)  — Vorschau, Freigabewort, Durchfuehrung
//   3. Nachweis             — Loeschprotokoll und Aenderungsprotokoll
//
// BEWUSST ALS EIGENE DATEI: die bestehende Seite (Verzeichnis + Fristen-Ampel)
// wird nicht umgebaut, nur ergaenzt. Ein Bauteil, das man wieder abnehmen
// kann, ohne dass etwas anderes mitgeht.
//
// Die Loesch-Reihenfolge in der Oberflaeche ist absichtlich umstaendlich:
// Kontakt waehlen -> Vorschau ansehen -> Wort abtippen -> ausloesen. Wer das
// versehentlich durchlaeuft, hat sich Muehe gegeben.
// ============================================================================

import { useState, useCallback, useEffect, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

const FREIGABE_WORT = 'LOESCHEN';

type Kontakt = { id: string; vorname: string | null; nachname: string | null; firma: string | null; email: string | null };
type Posten = { tabelle: string; label: string; anzahl: number; grund?: string };

type Vorschau = {
  person: string; zusammenfassung: string;
  geloescht: Posten[]; anonymisiert: Posten[]; behalten: Posten[];
  uebersprungen: number;
};
type LoeschAntwort = {
  ok: boolean; person: string; zusammenfassung: string;
  geloescht: Posten[]; anonymisiert: Posten[]; behalten: Posten[];
  fehler: string[]; antworttext: string;
};
type Protokoll = {
  id: string; kontakt_kennung: string | null; begonnen_am: string; fertig_am: string | null;
  geloescht: Record<string, number> | null; anonymisiert: Record<string, number> | null;
  behalten: Record<string, number> | null; fehler: string[] | null;
};
type AuditZeile = {
  id: number; tabelle: string; aktion: string; felder: string[] | null;
  kennung: string | null; geschehen_am: string;
};

function name(k: Kontakt): string {
  const n = [k.vorname, k.nachname].filter(Boolean).join(' ').trim();
  return n || (k.firma ?? '') || (k.email ?? '') || 'Kontakt';
}
function zeitpunkt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function summe(z: Record<string, number> | null | undefined): number {
  if (!z) return 0;
  return Object.values(z).reduce((a, b) => a + (Number(b) || 0), 0);
}

export default function DsgvoWerkzeuge() {
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Kontakt[]>([]);
  const [suchtLaeuft, setSuchtLaeuft] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<Kontakt | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const [auskunftLaeuft, setAuskunftLaeuft] = useState(false);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [vorschauLaeuft, setVorschauLaeuft] = useState(false);
  const [wort, setWort] = useState('');
  const [loeschtGerade, setLoeschtGerade] = useState(false);
  const [ergebnis, setErgebnis] = useState<LoeschAntwort | null>(null);

  const [protokolle, setProtokolle] = useState<Protokoll[]>([]);
  const [audit, setAudit] = useState<AuditZeile[]>([]);
  const [zeigeAudit, setZeigeAudit] = useState(false);

  // ---- Nachweise laden ----------------------------------------------------
  const ladeNachweise = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('dsgvo_loeschungen').select('*').order('begonnen_am', { ascending: false }).limit(20);
      setProtokolle((data as Protokoll[]) ?? []);
    } catch { /* Tabelle evtl. noch nicht eingespielt */ }
  }, []);

  const ladeAudit = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('audit_log').select('id,tabelle,aktion,felder,kennung,geschehen_am')
        .order('geschehen_am', { ascending: false }).limit(100);
      setAudit((data as AuditZeile[]) ?? []);
    } catch { /* dito */ }
  }, []);

  useEffect(() => { ladeNachweise(); }, [ladeNachweise]);

  // ---- Kontaktsuche -------------------------------------------------------
  const suchen = useCallback(async () => {
    // Kommas und Klammern wuerden die Supabase-Oder-Abfrage zerlegen.
    const q = suche.replace(/[,()%*]/g, ' ').trim();
    if (q.length < 2) { setTreffer([]); return; }
    setSuchtLaeuft(true);
    setFehler(null);
    try {
      const { data, error } = await supabase
        .from('kontakte')
        .select('id,vorname,nachname,firma,email')
        .or(`vorname.ilike.%${q}%,nachname.ilike.%${q}%,firma.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(25);
      if (error) setFehler(error.message);
      setTreffer((data as Kontakt[]) ?? []);
    } catch {
      setFehler('Die Suche hat nicht funktioniert.');
    }
    setSuchtLaeuft(false);
  }, [suche]);

  const waehlen = (k: Kontakt) => {
    setGewaehlt(k);
    setTreffer([]);
    setSuche('');
    setVorschau(null);
    setErgebnis(null);
    setWort('');
    setMeldung(null);
    setFehler(null);
  };

  // ---- Auskunft -----------------------------------------------------------
  const auskunftErstellen = async () => {
    if (!gewaehlt) return;
    setAuskunftLaeuft(true);
    setFehler(null);
    setMeldung(null);
    try {
      const r = await fetch('/api/dsgvo/auskunft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kontakt_id: gewaehlt.id }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setFehler(j.error || 'Die Auskunft konnte nicht erstellt werden.'); setAuskunftLaeuft(false); return; }

      const blob = new Blob([j.html as string], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (j.dateiname as string) || 'auskunft.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      setMeldung(`Auskunft erstellt: ${j.bereiche} Bereiche, ${j.eintraege} Einträge. Die Datei liegt in Ihrem Download-Ordner und kann so weitergegeben werden.`);
    } catch {
      setFehler('Die Auskunft konnte nicht erstellt werden.');
    }
    setAuskunftLaeuft(false);
  };

  // ---- Loeschung: Vorschau ------------------------------------------------
  const vorschauHolen = async () => {
    if (!gewaehlt) return;
    setVorschauLaeuft(true);
    setFehler(null);
    setErgebnis(null);
    try {
      const r = await fetch('/api/dsgvo/loeschen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kontakt_id: gewaehlt.id, modus: 'vorschau' }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setFehler(j.error || 'Die Vorschau konnte nicht erstellt werden.'); setVorschauLaeuft(false); return; }
      setVorschau(j as Vorschau);
    } catch {
      setFehler('Die Vorschau konnte nicht erstellt werden.');
    }
    setVorschauLaeuft(false);
  };

  // ---- Loeschung: durchfuehren -------------------------------------------
  const loeschenAusloesen = async () => {
    if (!gewaehlt || !vorschau) return;
    if (wort.trim().toUpperCase() !== FREIGABE_WORT) return;
    setLoeschtGerade(true);
    setFehler(null);
    try {
      const r = await fetch('/api/dsgvo/loeschen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kontakt_id: gewaehlt.id, modus: 'loeschen', freigabe: wort.trim() }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(j.error || 'Die Löschung ist fehlgeschlagen.'); setLoeschtGerade(false); return; }
      setErgebnis(j as LoeschAntwort);
      setVorschau(null);
      setWort('');
      setGewaehlt(null);
      ladeNachweise();
    } catch {
      setFehler('Die Löschung ist fehlgeschlagen.');
    }
    setLoeschtGerade(false);
  };

  const textKopieren = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setMeldung('Der Text wurde kopiert.');
    } catch {
      setMeldung('Kopieren hat nicht geklappt — bitte markieren und mit Strg+C kopieren.');
    }
  };

  const freigabeBereit = wort.trim().toUpperCase() === FREIGABE_WORT;

  return (
    <section style={s.card}>
      <h2 style={s.h2}>⚖️ Auskunft und Löschung durchführen</h2>
      <p style={s.sub}>
        Hier wird eine Anfrage tatsächlich beantwortet. Die Auskunft nach Art. 15 trägt alles zusammen,
        was zu einer Person gespeichert ist. Die Löschung nach Art. 17 entfernt sie aus dem gesamten
        Betrieb — mit einer Ausnahme, die das Gesetz selbst vorschreibt: Rechnungen, Buchungen und
        SEPA-Mandate müssen zehn Jahre aufbewahrt werden (§ 147 AO). Was bleibt, sehen Sie vorher.
      </p>

      {fehler && <div style={s.err}>{fehler}</div>}
      {meldung && <div style={s.ok}>{meldung}</div>}

      {/* ---------------- Kontakt suchen ---------------- */}
      {!gewaehlt && (
        <div style={{ marginTop: 14 }}>
          <div style={s.reihe}>
            <input
              style={{ ...s.in, flex: 1, minWidth: 220 }}
              placeholder="Name, Firma oder E-Mail der betroffenen Person"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') suchen(); }}
            />
            <button style={s.btnGold} onClick={suchen} disabled={suchtLaeuft}>
              {suchtLaeuft ? 'Sucht …' : 'Suchen'}
            </button>
          </div>

          {treffer.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {treffer.map((k) => (
                <div key={k.id} style={s.zeile}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{name(k)}</b>
                    {k.firma && <span style={{ color: C.textDim }}> · {k.firma}</span>}
                    {k.email && <span style={{ color: C.textDim }}> · {k.email}</span>}
                  </span>
                  <button style={s.btnMini} onClick={() => waehlen(k)}>Auswählen</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Gewaehlter Kontakt ---------------- */}
      {gewaehlt && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...s.zeile, borderColor: C.gold }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: C.textDim, fontSize: 13 }}>Ausgewählt</span><br />
              <b style={{ fontSize: 16 }}>{name(gewaehlt)}</b>
              {gewaehlt.email && <span style={{ color: C.textDim }}> · {gewaehlt.email}</span>}
            </span>
            <button style={s.btnMiniGrau} onClick={() => { setGewaehlt(null); setVorschau(null); setWort(''); }}>Wechseln</button>
          </div>

          <div style={{ ...s.reihe, marginTop: 12 }}>
            <button style={s.btnCyan} onClick={auskunftErstellen} disabled={auskunftLaeuft}>
              {auskunftLaeuft ? 'Wird erstellt …' : '📄 Auskunft erstellen (Art. 15)'}
            </button>
            {!vorschau && (
              <button style={s.btnRot} onClick={vorschauHolen} disabled={vorschauLaeuft}>
                {vorschauLaeuft ? 'Prüft …' : '🗑 Löschung vorbereiten (Art. 17)'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Vorschau der Loeschung ---------------- */}
      {vorschau && (
        <div style={s.warnBlock}>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 17, color: C.warn }}>
            Das würde jetzt passieren
          </div>
          <p style={{ ...s.sub, marginTop: 6 }}>{vorschau.zusammenfassung}</p>

          <SpaltenBlock titel="Wird vollständig gelöscht" farbe={C.danger} posten={vorschau.geloescht} />
          <SpaltenBlock titel="Wird anonymisiert — der Vorgang bleibt, die Person geht" farbe={C.warn} posten={vorschau.anonymisiert} />
          <SpaltenBlock titel="Bleibt erhalten — gesetzliche Aufbewahrungspflicht" farbe={C.green} posten={vorschau.behalten} mitGrund />

          <div style={s.trenner} />

          <p style={{ ...s.sub, color: C.text }}>
            Dieser Schritt lässt sich <b>nicht rückgängig machen</b>. Tippen Sie zur Bestätigung
            das Wort <b style={{ color: C.gold, letterSpacing: 1 }}>{FREIGABE_WORT}</b> ein.
          </p>
          <div style={s.reihe}>
            <input
              style={{ ...s.in, width: 200, letterSpacing: 2, fontWeight: 700 }}
              placeholder={FREIGABE_WORT}
              value={wort}
              onChange={(e) => setWort(e.target.value)}
              autoComplete="off"
            />
            <button
              style={freigabeBereit ? s.btnRot : s.btnAus}
              onClick={loeschenAusloesen}
              disabled={!freigabeBereit || loeschtGerade}
            >
              {loeschtGerade ? 'Löscht …' : 'Endgültig löschen'}
            </button>
            <button style={s.btnMiniGrau} onClick={() => { setVorschau(null); setWort(''); }}>Abbrechen</button>
          </div>
          {vorschau.uebersprungen > 0 && (
            <p style={s.hint}>
              {vorschau.uebersprungen} Bereiche wurden übersprungen — das sind Module, die dieser Betrieb nicht nutzt.
            </p>
          )}
        </div>
      )}

      {/* ---------------- Ergebnis ---------------- */}
      {ergebnis && (
        <div style={{ ...s.warnBlock, borderColor: ergebnis.ok ? C.green : C.danger }}>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 17, color: ergebnis.ok ? C.green : C.danger }}>
            {ergebnis.ok ? '✅ Löschung durchgeführt' : '⚠️ Löschung mit Hinweisen abgeschlossen'}
          </div>
          <p style={{ ...s.sub, marginTop: 6 }}><b>{ergebnis.person}</b> — {ergebnis.zusammenfassung}</p>

          {ergebnis.fehler.length > 0 && (
            <ul style={{ color: C.danger, fontSize: 14, margin: '8px 0 0', paddingLeft: 20 }}>
              {ergebnis.fehler.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}

          <SpaltenBlock titel="Gelöscht" farbe={C.danger} posten={ergebnis.geloescht} />
          <SpaltenBlock titel="Anonymisiert" farbe={C.warn} posten={ergebnis.anonymisiert} />
          <SpaltenBlock titel="Erhalten geblieben" farbe={C.green} posten={ergebnis.behalten} />

          <div style={s.trenner} />
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Antwort an die betroffene Person</div>
          <p style={s.hint}>
            Diesen Text können Sie so versenden. Er nennt, was gelöscht wurde und was aus welchem
            gesetzlichen Grund bleiben musste — ohne diese Angabe wäre die Antwort unvollständig.
          </p>
          <textarea style={s.textarea} value={ergebnis.antworttext} readOnly rows={12} />
          <button style={{ ...s.btnGold, marginTop: 8 }} onClick={() => textKopieren(ergebnis.antworttext)}>
            Text kopieren
          </button>
        </div>
      )}

      {/* ---------------- Nachweise ---------------- */}
      <div style={s.trenner} />
      <h3 style={s.h3}>🧾 Nachweis: durchgeführte Löschungen</h3>
      <p style={s.hint}>
        Bei einer Prüfung ist das die entscheidende Frage: Können Sie belegen, dass und wann gelöscht wurde?
        Diese Liste lässt sich nicht bearbeiten und nicht entfernen.
      </p>
      {protokolle.length === 0 ? (
        <p style={s.dim}>Noch keine Löschung durchgeführt.</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          {protokolle.map((p) => (
            <div key={p.id} style={s.zeile}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{p.kontakt_kennung || 'Kontakt'}</b>
                <br />
                <span style={{ color: C.textDim, fontSize: 13 }}>
                  {zeitpunkt(p.begonnen_am)} · {summe(p.geloescht)} gelöscht · {summe(p.anonymisiert)} anonymisiert · {summe(p.behalten)} behalten
                </span>
              </span>
              <span style={{
                color: p.fertig_am ? C.green : C.warn, fontWeight: 700, fontSize: 13,
              }}>
                {p.fertig_am ? 'abgeschlossen' : 'unvollständig'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={s.trenner} />
      <h3 style={s.h3}>📋 Änderungsprotokoll</h3>
      <p style={s.hint}>
        Wer hat wann welchen Datensatz angelegt, geändert oder gelöscht. Aus gutem Grund werden nur die
        <b> Feldnamen</b> festgehalten, nie die Werte — ein Protokoll, das jede geänderte Telefonnummer
        mitschreibt, wäre selbst eine Datensammlung und damit ein neues Problem statt der Lösung.
      </p>
      {!zeigeAudit ? (
        <button style={s.btnMini} onClick={() => { setZeigeAudit(true); ladeAudit(); }}>
          Protokoll anzeigen
        </button>
      ) : audit.length === 0 ? (
        <p style={s.dim}>Noch keine Einträge.</p>
      ) : (
        <div style={{ marginTop: 10, maxHeight: 420, overflowY: 'auto' }}>
          {audit.map((z) => (
            <div key={z.id} style={{ ...s.zeile, padding: '8px 12px' }}>
              <span style={{
                ...s.pille,
                color: z.aktion === 'geloescht' ? C.danger : z.aktion === 'angelegt' ? C.green : C.cyan,
                borderColor: z.aktion === 'geloescht' ? C.danger : z.aktion === 'angelegt' ? C.green : C.cyan,
              }}>
                {z.aktion}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{z.tabelle}</b>
                {z.kennung && <span style={{ color: C.textDim }}> · {z.kennung}</span>}
                {z.felder && z.felder.length > 0 && (
                  <><br /><span style={{ color: C.textDim, fontSize: 13 }}>geändert: {z.felder.join(', ')}</span></>
                )}
              </span>
              <span style={{ color: C.textDim, fontSize: 13, whiteSpace: 'nowrap' }}>{zeitpunkt(z.geschehen_am)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function SpaltenBlock({ titel, farbe, posten, mitGrund }: {
  titel: string; farbe: string; posten: Posten[]; mitGrund?: boolean;
}) {
  if (!posten || posten.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ color: farbe, fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{titel}</div>
      <div style={s.gitter}>
        {posten.map((p) => (
          <div key={p.tabelle} style={s.posten}>
            <span style={{ flex: 1 }}>{p.label}</span>
            <b style={{ color: farbe }}>{p.anzahl}</b>
            {mitGrund && p.grund && <div style={s.grund}>{p.grund}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 16, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 18, fontWeight: 700, margin: '0 0 10px' },
  h3: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 16, fontWeight: 700, margin: '0 0 4px' },
  sub: { color: C.textDim, fontSize: 14.5, lineHeight: 1.55, margin: 0, maxWidth: 820 },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  in: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', color: C.text, fontFamily: 'inherit', fontSize: 14 },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  btnCyan: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  btnRot: { background: C.danger, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  btnAus: { background: 'rgba(224,102,102,0.18)', color: 'rgba(255,255,255,0.45)', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'not-allowed', fontFamily: 'inherit', fontSize: 14 },
  btnMini: { background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, padding: '5px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  btnMiniGrau: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8 },
  warnBlock: { background: C.navy, border: `1px solid ${C.warn}`, borderRadius: 14, padding: 18, marginTop: 16 },
  gitter: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 },
  posten: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 14 },
  grund: { flexBasis: '100%', color: C.textDim, fontSize: 12.5, lineHeight: 1.45, marginTop: 4 },
  trenner: { height: 1, background: C.border, margin: '20px 0 14px' },
  textarea: { width: '100%', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, resize: 'vertical' },
  pille: { border: '1px solid', borderRadius: 999, padding: '2px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
