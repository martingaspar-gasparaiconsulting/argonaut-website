'use client';

// ============================================================================
// ARGONAUT OS · app/admin/inhalte/page.tsx  (Control-Room · Inhalts-Werkstatt)
//
// Hier entstehen die Kapitel der Branchen-Handbücher: erzeugen lassen, lesen,
// nachschärfen, Haken setzen. Ohne Haken erscheint nichts in einem E-Book.
//
// DIE REIHENFOLGE IST DIE EIGENTLICHE ARBEITSERSPARNIS
// Die Liste zeigt oben, was noch nicht freigegeben ist — und davon zuerst das,
// woran die Prüfung etwas auszusetzen hatte. Bei 113 Kapiteln ist das der
// Unterschied zwischen „ich lese alles der Reihe nach" und „ich sehe mir die
// zwölf an, die auffällig sind".
//
// WARUM ES KEINEN KNOPF „ALLES FREIGEBEN" GIBT
// Weil er benutzt würde. Freigeben geht nur für angehakte Zeilen — man muss
// also wenigstens hinsehen. Die Sammelfreigabe nimmt die Klickarbeit ab,
// nicht die Entscheidung.
//
// Liegt unter /admin -> hinter dem Admin-Schloss (app/admin/layout.tsx).
// Beide Routen prüfen zusätzlich selbst: eine geschützte Seite schützt keine
// Route, die per URL direkt erreichbar ist.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';

const NAVY = '#0A1628';
const NAVY2 = '#0F2036';
const CYAN = '#00e5ff';
const GOLD = '#C9A84C';
const GRUEN = '#4CAF7D';
const ROT = '#E06666';
const DIM = '#8FA3BE';
const RAND = 'rgba(143,163,190,0.18)';

const TYP_LABEL: Record<string, string> = {
  modul_kapitel: 'Modul-Kapitel',
  kategorie_kapitel: 'Kategorie-Kapitel',
  branchen_vorwort: 'Branchen-Vorwort',
  ki_dialog: 'KI-Dialog',
};

type Stapel = { id: string; zweck: string | null; status: string; anzahl: number; erstellt_am: string } | null;

type Bestand = {
  mengen: { modulKapitel: number; kategorieKapitel: number; extras: number; kategorien: number };
  bestand: { gesamt: number; jeTyp: Record<string, { gesamt: number; freigegeben: number }> };
  offen: { anzahl: number; jeTyp: Array<{ typ: string; anzahl: number }> };
  modell: string;
  kostenUsd: number;
  kostenHinweis: string;
  laufenderStapel: Stapel;
  schluesselVorhanden: boolean;
};

type Zeile = {
  id: string;
  typ: string;
  schluessel: string;
  titel: string | null;
  text: string | null;
  notiz: string | null;
  quelle: string | null;
  freigegeben: boolean;
  version: number;
  aktualisiert_am: string;
  vorschau: string;
  zeichen: number;
};

type Zahlen = { gesamt: number; freigegeben: number; entwurf: number; beanstandet: number };

export default function AdminInhalte() {
  const [bestand, setBestand] = useState<Bestand | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [zahlen, setZahlen] = useState<Zahlen>({ gesamt: 0, freigegeben: 0, entwurf: 0, beanstandet: 0 });
  const [treffer, setTreffer] = useState(0);

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  const [typ, setTyp] = useState('');
  const [status, setStatus] = useState('entwurf');
  const [suche, setSuche] = useState('');
  const [versatz, setVersatz] = useState(0);
  const GRENZE = 50;

  const [offenId, setOffenId] = useState<string | null>(null);
  const [entwurfText, setEntwurfText] = useState('');
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());

  // ---- Laden ---------------------------------------------------------------
  const holeBestand = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/inhalte');
      const j = await r.json();
      if (r.ok && j.ok) setBestand(j as Bestand);
      else setFehler(j.error || 'Bestand nicht lesbar.');
    } catch { setFehler('Bestand nicht lesbar.'); }
  }, []);

  const holeListe = useCallback(async () => {
    setLaden(true);
    try {
      const p = new URLSearchParams({ status, versatz: String(versatz), grenze: String(GRENZE) });
      if (typ) p.set('typ', typ);
      if (suche.trim()) p.set('suche', suche.trim());
      const r = await fetch(`/api/admin/inhalte/liste?${p.toString()}`);
      const j = await r.json();
      if (!r.ok || !j.ok) { setFehler(j.error || 'Liste nicht lesbar.'); setLaden(false); return; }
      setZeilen(j.zeilen as Zeile[]);
      setZahlen(j.zahlen as Zahlen);
      setTreffer(Number(j.treffer) || 0);
    } catch { setFehler('Liste nicht lesbar.'); }
    setLaden(false);
  }, [typ, status, suche, versatz]);

  useEffect(() => { holeBestand(); }, [holeBestand]);
  useEffect(() => { holeListe(); }, [holeListe]);

  // Läuft ein Stapel, alle 30 Sekunden nachsehen — sonst nicht.
  useEffect(() => {
    if (!bestand?.laufenderStapel) return;
    const t = setInterval(() => { holeBestand(); holeListe(); }, 30000);
    return () => clearInterval(t);
  }, [bestand?.laufenderStapel, holeBestand, holeListe]);

  // ---- Erzeugen ------------------------------------------------------------
  const erzeugen = async () => {
    if (!bestand || bestand.offen.anzahl === 0) return;
    const frage =
      `${bestand.offen.anzahl} fehlende Kapitel erzeugen lassen?\n\n` +
      `Modell: ${bestand.modell}\n` +
      `Geschätzte Kosten: ${bestand.kostenUsd.toFixed(2)} USD (halber Preis über die Stapel-Schnittstelle)\n\n` +
      `Das Ergebnis kommt meist innerhalb einer Stunde, spätestens nach 24 Stunden, ` +
      `und landet als Entwurf in dieser Liste.`;
    if (!window.confirm(frage)) return;

    setBeschaeftigt(true); setFehler(null); setMeldung(null);
    try {
      const r = await fetch('/api/admin/inhalte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bestaetigt: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) setFehler(j.error || 'Der Stapel wurde nicht angenommen.');
      else setMeldung(j.hinweis ? `${j.abgeschickt} Kapitel abgeschickt. ${j.hinweis}` : `${j.abgeschickt} Kapitel abgeschickt.`);
    } catch { setFehler('Der Stapel konnte nicht abgeschickt werden.'); }
    setBeschaeftigt(false);
    await holeBestand();
  };

  // ---- Ändern --------------------------------------------------------------
  const aendern = async (koerper: Record<string, unknown>, erfolg: string) => {
    setBeschaeftigt(true); setFehler(null); setMeldung(null);
    try {
      const r = await fetch('/api/admin/inhalte/liste', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setFehler(j.error || 'Änderung fehlgeschlagen.'); setBeschaeftigt(false); return null; }
      setMeldung(j.hinweis ? `${erfolg} ${j.hinweis}` : erfolg);
      setBeschaeftigt(false);
      await holeListe();
      await holeBestand();
      return j;
    } catch {
      setFehler('Änderung fehlgeschlagen.');
      setBeschaeftigt(false);
      return null;
    }
  };

  const oeffne = async (z: Zeile) => {
    if (offenId === z.id) { setOffenId(null); return; }
    setOffenId(z.id);
    setEntwurfText('');
    try {
      // Gezielt über die ID — eine Suche nach dem Schlüssel könnte mehrere
      // Kapitel treffen und das gewünschte hinter der Seitengrenze lassen.
      const p = new URLSearchParams({ id: z.id, status: 'alle', volltext: '1', grenze: '1' });
      const r = await fetch(`/api/admin/inhalte/liste?${p.toString()}`);
      const j = await r.json();
      const voll = (j?.zeilen as Zeile[] | undefined)?.find((x) => x.id === z.id);
      setEntwurfText(voll?.text ?? '');
    } catch { setEntwurfText(''); }
  };

  const speichern = async (z: Zeile) => {
    const j = await aendern({ id: z.id, aktion: 'speichern', text: entwurfText }, 'Gespeichert.');
    if (j && Array.isArray(j.hinweise) && j.hinweise.length > 0) {
      setMeldung(`Gespeichert — die Prüfung merkt noch an: ${j.hinweise.join(' · ')}`);
    }
  };

  const waehleUm = (id: string) => {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id); else neu.add(id);
      return neu;
    });
  };

  const sichtbareIds = useMemo(() => zeilen.map((z) => z.id), [zeilen]);
  const alleGewaehlt = sichtbareIds.length > 0 && sichtbareIds.every((id) => gewaehlt.has(id));

  const filterSetzen = (setzer: () => void) => { setzer(); setVersatz(0); setGewaehlt(new Set()); };

  const stapel = bestand?.laufenderStapel;
  const prozent = zahlen.gesamt > 0 ? Math.round((zahlen.freigegeben / zahlen.gesamt) * 100) : 0;

  return (
    <div style={s.seite}>
      <h1 style={s.h1}>📚 Inhalts-Werkstatt</h1>
      <p style={s.sub}>
        Hier entstehen die Kapitel der Branchen-Handbücher. Erzeugt wird im Stapel über Nacht
        zum halben Preis; freigegeben wird von Hand. <b>Ohne Haken erscheint ein Kapitel in keinem Buch.</b>
      </p>

      {bestand && !bestand.schluesselVorhanden && (
        <div style={s.warn}>Der KI-Zugang ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt). Erzeugen ist derzeit nicht möglich.</div>
      )}
      {fehler && <div style={s.err}><span style={{ flex: 1 }}>{fehler}</span><button style={s.x} onClick={() => setFehler(null)}>✕</button></div>}
      {meldung && <div style={s.ok}><span style={{ flex: 1 }}>{meldung}</span><button style={s.x} onClick={() => setMeldung(null)}>✕</button></div>}

      {/* ---------- Zahlen ---------- */}
      <div style={s.kacheln}>
        <Kachel zahl={zahlen.gesamt} text="Kapitel vorhanden" farbe={CYAN} />
        <Kachel zahl={zahlen.freigegeben} text={`freigegeben (${prozent} %)`} farbe={GRUEN} />
        <Kachel zahl={zahlen.entwurf} text="noch Entwurf" farbe={zahlen.entwurf > 0 ? GOLD : GRUEN} />
        <Kachel zahl={zahlen.beanstandet} text="mit Anmerkung" farbe={zahlen.beanstandet > 0 ? ROT : GRUEN} />
        <Kachel zahl={bestand?.offen.anzahl ?? 0} text="noch nie erzeugt" farbe={DIM} />
      </div>

      {/* ---------- Erzeugen ---------- */}
      <section style={s.karte}>
        <h2 style={s.h2}>Fehlende Kapitel erzeugen</h2>

        {stapel ? (
          <>
            <p style={s.hint}>
              Ein Stapel läuft gerade: <b>{stapel.zweck ?? 'Inhalts-Werkstatt'}</b> ({stapel.anzahl} Kapitel,
              Stand „{stapel.status}"). Der Abhol-Dienst sieht alle 15 Minuten nach. Diese Seite frischt sich
              alle 30 Sekunden selbst auf — Sie können sie auch schließen, das ändert nichts.
            </p>
            <div style={s.balkenAussen}><div style={{ ...s.balkenInnen, width: '100%', opacity: 0.5 }} /></div>
          </>
        ) : (
          <>
            <p style={s.hint}>
              {bestand?.offen.anzahl ?? 0} Kapitel gibt es noch nicht.
              {bestand ? ` Modell: ${bestand.modell} · geschätzt ${bestand.kostenUsd.toFixed(2)} USD für alle zusammen.` : ''}
              {' '}Bestellt wird nur, was fehlt — an einem Entwurf, den Sie schon bearbeitet haben, rührt der Stapel nichts.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button
                style={(bestand?.offen.anzahl ?? 0) > 0 && bestand?.schluesselVorhanden ? s.knopfGold : s.knopfAus}
                disabled={beschaeftigt || (bestand?.offen.anzahl ?? 0) === 0 || !bestand?.schluesselVorhanden}
                onClick={erzeugen}
              >
                {bestand?.offen.anzahl ?? 0} fehlende erzeugen
              </button>
              <button style={s.knopfGrau} onClick={() => { holeBestand(); holeListe(); }} disabled={laden}>
                Neu einlesen
              </button>
            </div>
          </>
        )}
      </section>

      {/* ---------- Filter ---------- */}
      <section style={s.karte}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={s.auswahl} value={status} onChange={(e) => filterSetzen(() => setStatus(e.target.value))}>
            <option value="entwurf">Noch Entwurf</option>
            <option value="beanstandet">Mit Anmerkung</option>
            <option value="freigegeben">Freigegeben</option>
            <option value="alle">Alle</option>
          </select>
          <select style={s.auswahl} value={typ} onChange={(e) => filterSetzen(() => setTyp(e.target.value))}>
            <option value="">Alle Arten</option>
            {Object.entries(TYP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input
            style={{ ...s.eingabe, flex: 1, minWidth: 180, marginTop: 0 }}
            placeholder="Kapitel suchen …"
            value={suche}
            onChange={(e) => filterSetzen(() => setSuche(e.target.value))}
          />
        </div>

        {gewaehlt.size > 0 && (
          <div style={s.auswahlLeiste}>
            <span style={{ flex: 1, fontSize: 13.5 }}>{gewaehlt.size} ausgewählt</span>
            <button style={s.knopfMini} disabled={beschaeftigt}
              onClick={() => aendern({ ids: [...gewaehlt], aktion: 'freigeben' }, 'Freigegeben.').then(() => setGewaehlt(new Set()))}>
              Auswahl freigeben
            </button>
            <button style={s.knopfMini} disabled={beschaeftigt}
              onClick={() => aendern({ ids: [...gewaehlt], aktion: 'zuruecknehmen' }, 'Freigabe zurückgenommen.').then(() => setGewaehlt(new Set()))}>
              Freigabe zurücknehmen
            </button>
            <button style={s.knopfGrau} onClick={() => setGewaehlt(new Set())}>Auswahl leeren</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <label style={s.kaestchenZeile}>
            <input type="checkbox" checked={alleGewaehlt}
              onChange={() => setGewaehlt(alleGewaehlt ? new Set() : new Set(sichtbareIds))} />
            <span style={{ color: DIM, fontSize: 13 }}>alle {zeilen.length} auf dieser Seite</span>
          </label>
          <span style={{ color: DIM, fontSize: 13, flex: 1, textAlign: 'right' }}>
            {treffer} Treffer{treffer > GRENZE ? ` · Seite ${Math.floor(versatz / GRENZE) + 1} von ${Math.ceil(treffer / GRENZE)}` : ''}
          </span>
        </div>

        {laden && <p style={s.dim}>Wird geladen …</p>}
        {!laden && zeilen.length === 0 && <p style={s.dim}>Kein Kapitel in dieser Ansicht.</p>}

        <div style={{ marginTop: 10 }}>
          {zeilen.map((z) => (
            <div key={z.id}>
              <div style={{ ...s.zeile, borderColor: z.notiz ? 'rgba(224,102,102,0.4)' : RAND }}>
                <input type="checkbox" checked={gewaehlt.has(z.id)} onChange={() => waehleUm(z.id)} />
                <span style={{ ...s.punkt, background: z.freigegeben ? GRUEN : (z.notiz ? ROT : 'rgba(143,163,190,0.35)') }} />
                <button style={s.zeilenKnopf} onClick={() => oeffne(z)}>
                  <span style={{ fontWeight: 700 }}>{z.titel || z.schluessel}</span>
                  <span style={{ color: DIM, fontSize: 12, marginLeft: 8 }}>
                    {TYP_LABEL[z.typ] ?? z.typ} · {z.zeichen} Zeichen
                    {z.version > 1 ? ` · Fassung ${z.version}` : ''}
                  </span>
                  <div style={{ color: DIM, fontSize: 12.5, marginTop: 3 }}>{z.vorschau}</div>
                  {z.notiz && <div style={{ color: ROT, fontSize: 12.5, marginTop: 4 }}>⚠ {z.notiz}</div>}
                </button>
                <button
                  style={z.freigegeben ? s.knopfMiniAus : s.knopfMini}
                  disabled={beschaeftigt}
                  onClick={() => aendern(
                    { id: z.id, aktion: z.freigegeben ? 'zuruecknehmen' : 'freigeben' },
                    z.freigegeben ? 'Freigabe zurückgenommen.' : 'Freigegeben.',
                  )}
                >
                  {z.freigegeben ? 'freigegeben ✓' : 'freigeben'}
                </button>
              </div>

              {offenId === z.id && (
                <div style={s.editor}>
                  <textarea
                    style={s.textfeld}
                    value={entwurfText}
                    onChange={(e) => setEntwurfText(e.target.value)}
                    rows={18}
                    spellCheck
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button style={s.knopfGold} disabled={beschaeftigt} onClick={() => speichern(z)}>Speichern</button>
                    <button style={s.knopfGrau} onClick={() => setOffenId(null)}>Schließen</button>
                    <span style={{ color: DIM, fontSize: 12.5, flex: 1, textAlign: 'right' }}>
                      {entwurfText.length} Zeichen · Speichern prüft den Text erneut auf Anrede und Wortwahl
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {treffer > GRENZE && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
            <button style={s.knopfGrau} disabled={versatz === 0}
              onClick={() => { setVersatz(Math.max(0, versatz - GRENZE)); setGewaehlt(new Set()); }}>
              ← zurück
            </button>
            <button style={s.knopfGrau} disabled={versatz + GRENZE >= treffer}
              onClick={() => { setVersatz(versatz + GRENZE); setGewaehlt(new Set()); }}>
              weiter →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Kachel({ zahl, text, farbe }: { zahl: number; text: string; farbe: string }) {
  return (
    <div style={s.kachel}>
      <div style={{ fontSize: 24, fontWeight: 800, color: farbe }}>{zahl}</div>
      <div style={{ color: DIM, fontSize: 12.5, marginTop: 2 }}>{text}</div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { maxWidth: 1020, margin: '0 auto', padding: '24px 16px 60px', color: '#E8EDF4', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', background: NAVY, minHeight: '100vh' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 17, fontWeight: 700, margin: '0 0 6px' },
  sub: { color: DIM, fontSize: 14.5, lineHeight: 1.55, margin: '8px 0 0', maxWidth: 820 },
  kacheln: { display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  kachel: { background: NAVY2, border: `1px solid ${RAND}`, borderRadius: 12, padding: '12px 18px', minWidth: 130 },
  karte: { background: NAVY2, border: `1px solid ${RAND}`, borderRadius: 16, padding: 20, marginTop: 16 },
  zeile: { display: 'flex', gap: 10, alignItems: 'flex-start', background: NAVY, border: `1px solid ${RAND}`, borderRadius: 9, padding: '9px 12px', marginBottom: 6, fontSize: 14 },
  zeilenKnopf: { background: 'transparent', border: 'none', color: '#E8EDF4', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', padding: 0, textAlign: 'left', flex: 1, minWidth: 0 },
  punkt: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 6 },
  editor: { background: NAVY, border: `1px solid ${RAND}`, borderRadius: 10, padding: 12, marginBottom: 10 },
  textfeld: { width: '100%', boxSizing: 'border-box', background: NAVY2, border: `1px solid ${RAND}`, borderRadius: 8, padding: 12, color: '#E8EDF4', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, resize: 'vertical' },
  auswahlLeiste: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 10, padding: '8px 12px', marginTop: 10 },
  kaestchenZeile: { display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer' },
  eingabe: { background: NAVY, border: `1px solid ${RAND}`, borderRadius: 9, padding: '9px 12px', color: '#E8EDF4', fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box', marginTop: 8 },
  auswahl: { background: NAVY, border: `1px solid ${RAND}`, borderRadius: 9, padding: '9px 12px', color: '#E8EDF4', fontFamily: 'inherit', fontSize: 14 },
  knopfGold: { background: GOLD, color: NAVY, border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  knopfAus: { background: 'rgba(201,168,76,0.2)', color: 'rgba(255,255,255,0.45)', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'not-allowed', fontFamily: 'inherit', fontSize: 14 },
  knopfGrau: { background: 'transparent', color: DIM, border: `1px solid ${RAND}`, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  knopfMini: { background: 'transparent', color: CYAN, border: `1px solid ${CYAN}55`, borderRadius: 8, padding: '4px 11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, flexShrink: 0 },
  knopfMiniAus: { background: 'rgba(76,175,125,0.15)', color: GRUEN, border: `1px solid ${GRUEN}55`, borderRadius: 8, padding: '4px 11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, flexShrink: 0 },
  balkenAussen: { height: 8, background: 'rgba(143,163,190,0.15)', borderRadius: 999, overflow: 'hidden', marginTop: 10 },
  balkenInnen: { height: '100%', background: GOLD, transition: 'width .3s' },
  hint: { color: DIM, fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0' },
  dim: { color: DIM, fontSize: 14, marginTop: 8 },
  warn: { color: GOLD, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: ROT, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', gap: 10 },
  ok: { color: GRUEN, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', gap: 10 },
  x: { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: 0 },
};
