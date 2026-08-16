'use client';

// ============================================================================
// ARGONAUT OS · app/admin/dossiers/page.tsx  (Control-Room · Branchen-Dossiers)
//
// Der Knopf, mit dem Martin die Branchen-PDFs erzeugt — einzeln, kategorieweise
// oder alle fehlenden am Stueck.
//
// WAS HIER SICHTBAR WIRD
//   · Welche der Branchen haben ein PDF in der AKTUELLEN Fassung?
//   · Wie viele veraltete Dateien liegen noch herum (nach einer Layout-Aenderung)?
//   · Wie viele Interessenten sind eingegangen, wie viele haben bestaetigt?
//
// WARUM DIE ARBEIT IN HAEPPCHEN LAEUFT
// Ein PDF braucht ueber Gotenberg ein bis drei Sekunden. Alle Branchen auf
// einmal waeren zwanzig Minuten — laenger als jede Serverlaufzeit. Die Seite
// ruft die Route deshalb wiederholt mit kleinen Paketen auf und zeigt den
// Fortschritt. Wer den Tab schliesst, verliert nur den Rest; das bereits
// Erzeugte liegt im Ablageort.
//
// Liegt unter /admin -> hinter dem Admin-Schloss (app/admin/layout.tsx).
// Die Route prueft zusaetzlich selbst: eine geschuetzte Seite schuetzt keine
// Route, die per URL direkt erreichbar ist.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { websiteKategorien, type WebBranche } from '../../vorschau/_lib/branchen-web';

const NAVY = '#0A1628';
const NAVY2 = '#0F2036';
const CYAN = '#00e5ff';
const GOLD = '#C9A84C';
const GRUEN = '#4CAF7D';
const ROT = '#E06666';
const DIM = '#8FA3BE';
const RAND = 'rgba(143,163,190,0.18)';

type Bestand = {
  version: string;
  vorhanden: string[];
  veraltetAnzahl: number;
  maxJeLauf: number;
  leads: { gesamt: number; aktiv: number; offen: number };
  gotenberg: boolean;
};

export default function AdminDossiers() {
  const kategorien = useMemo(() => websiteKategorien(), []);
  const alleBranchen = useMemo<WebBranche[]>(
    () => kategorien.flatMap((k) => k.branchen), [kategorien]);

  const [bestand, setBestand] = useState<Bestand | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const [laeuft, setLaeuft] = useState(false);
  const [abbrechen, setAbbrechen] = useState(false);
  const [fortschritt, setFortschritt] = useState({ erledigt: 0, gesamt: 0, aktuell: '' });
  const [suche, setSuche] = useState('');
  const [offeneKat, setOffeneKat] = useState<Set<string>>(new Set());

  const holen = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const r = await fetch('/api/admin/dossiers');
      const j = await r.json();
      if (!r.ok || !j.ok) { setFehler(j.error || 'Bestand nicht lesbar.'); setLaden(false); return; }
      setBestand(j as Bestand);
    } catch {
      setFehler('Bestand nicht lesbar.');
    }
    setLaden(false);
  }, []);

  useEffect(() => { holen(); }, [holen]);

  const da = useMemo(() => new Set(bestand?.vorhanden ?? []), [bestand]);
  const fehlende = useMemo(
    () => alleBranchen.filter((b) => !da.has(b.slug)), [alleBranchen, da]);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return null;
    return alleBranchen.filter(
      (b) => b.name.toLowerCase().includes(q) || b.slug.includes(q)).slice(0, 40);
  }, [suche, alleBranchen]);

  // ---- Der Stapellauf ------------------------------------------------------
  const erzeuge = async (liste: WebBranche[], neu = false) => {
    if (liste.length === 0) { setMeldung('Es fehlt nichts.'); return; }
    const paket = bestand?.maxJeLauf ?? 8;
    setLaeuft(true); setAbbrechen(false); setFehler(null); setMeldung(null);
    setFortschritt({ erledigt: 0, gesamt: liste.length, aktuell: '' });

    let erledigt = 0;
    const gescheitert: string[] = [];

    for (let i = 0; i < liste.length; i += paket) {
      if (abbrechen) break;
      const haeppchen = liste.slice(i, i + paket);
      setFortschritt({ erledigt, gesamt: liste.length, aktuell: haeppchen[0]?.name ?? '' });
      try {
        const r = await fetch('/api/admin/dossiers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchen: haeppchen.map((b) => b.slug), neu }),
        });
        const j = await r.json();
        if (Array.isArray(j?.fehler)) {
          for (const f of j.fehler) gescheitert.push(`${f.branche}: ${f.grund}`);
        }
        if (!r.ok && j?.error) gescheitert.push(j.error);
      } catch {
        gescheitert.push(`${haeppchen[0]?.name ?? 'Paket'}: Verbindung unterbrochen.`);
      }
      erledigt += haeppchen.length;
      setFortschritt({ erledigt, gesamt: liste.length, aktuell: '' });
    }

    setLaeuft(false);
    await holen();
    if (gescheitert.length > 0) {
      setFehler(`${gescheitert.length} nicht erzeugt: ${gescheitert.slice(0, 3).join(' · ')}${gescheitert.length > 3 ? ' …' : ''}`);
    } else {
      setMeldung(`${erledigt} ${erledigt === 1 ? 'Dossier' : 'Dossiers'} erzeugt.`);
    }
  };

  const katUmschalten = (k: string) => {
    setOffeneKat((alt) => {
      const neu = new Set(alt);
      if (neu.has(k)) neu.delete(k); else neu.add(k);
      return neu;
    });
  };

  const prozent = fortschritt.gesamt > 0
    ? Math.round((fortschritt.erledigt / fortschritt.gesamt) * 100) : 0;

  return (
    <div style={s.seite}>
      <h1 style={s.h1}>📄 Branchen-Dossiers</h1>
      <p style={s.sub}>
        Jede Branchenseite bietet ihr Dossier als PDF an. Wird es zum ersten Mal angefordert,
        entsteht es in dem Moment — und der Interessent wartet. Hier erzeugen Sie die Dateien
        vorab, damit niemand wartet.
      </p>

      {bestand && !bestand.gotenberg && (
        <div style={s.warn}>
          Der PDF-Dienst ist nicht eingerichtet (GOTENBERG_URL fehlt). Erzeugen ist derzeit nicht möglich.
        </div>
      )}
      {fehler && <div style={s.err}>{fehler}<button style={s.x} onClick={() => setFehler(null)}>✕</button></div>}
      {meldung && <div style={s.ok}>{meldung}<button style={s.x} onClick={() => setMeldung(null)}>✕</button></div>}

      {/* ---------- Zahlen ---------- */}
      <div style={s.kacheln}>
        <Kachel zahl={alleBranchen.length} text="Branchen gesamt" farbe={CYAN} />
        <Kachel zahl={da.size} text={`fertig (Fassung ${bestand?.version ?? '—'})`} farbe={GRUEN} />
        <Kachel zahl={fehlende.length} text="fehlen noch" farbe={fehlende.length > 0 ? GOLD : GRUEN} />
        <Kachel zahl={bestand?.leads.aktiv ?? 0} text="bestätigte Interessenten" farbe={GOLD} />
        <Kachel zahl={bestand?.leads.offen ?? 0} text="noch unbestätigt" farbe={DIM} />
      </div>

      {(bestand?.veraltetAnzahl ?? 0) > 0 && (
        <p style={s.hint}>
          {bestand?.veraltetAnzahl} Dateien stammen aus einer älteren Fassung. Sie werden nicht mehr
          ausgeliefert und stören nicht — sie belegen nur Platz.
        </p>
      )}

      {/* ---------- Stapellauf ---------- */}
      <section style={s.karte}>
        <h2 style={s.h2}>Alle fehlenden erzeugen</h2>
        <p style={s.hint}>
          Läuft in Paketen zu {bestand?.maxJeLauf ?? 8} Stück. Bei {fehlende.length} fehlenden
          dauert das etwa {Math.max(1, Math.round((fehlende.length * 2) / 60))} Minuten. Das Fenster
          muss so lange offen bleiben; bereits erzeugte Dateien bleiben aber erhalten.
        </p>

        {laeuft ? (
          <div style={{ marginTop: 12 }}>
            <div style={s.balkenAussen}>
              <div style={{ ...s.balkenInnen, width: `${prozent}%` }} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ color: DIM, fontSize: 13, flex: 1 }}>
                {fortschritt.erledigt} von {fortschritt.gesamt}
                {fortschritt.aktuell ? ` · gerade: ${fortschritt.aktuell}` : ''}
              </span>
              <button style={s.knopfGrau} onClick={() => setAbbrechen(true)}>Nach diesem Paket anhalten</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button
              style={fehlende.length > 0 ? s.knopfGold : s.knopfAus}
              disabled={fehlende.length === 0 || !bestand?.gotenberg}
              onClick={() => erzeuge(fehlende)}
            >
              {fehlende.length} fehlende erzeugen
            </button>
            <button style={s.knopfGrau} onClick={holen} disabled={laden}>Bestand neu einlesen</button>
          </div>
        )}
      </section>

      {/* ---------- Suche ---------- */}
      <section style={s.karte}>
        <h2 style={s.h2}>Einzelne Branche</h2>
        <input
          style={s.eingabe}
          placeholder="Branche suchen …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        {treffer && treffer.length === 0 && <p style={s.dim}>Kein Treffer.</p>}
        {treffer && treffer.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {treffer.map((b) => (
              <BranchenZeile key={b.slug} b={b} fertig={da.has(b.slug)} laeuft={laeuft}
                aktiv={Boolean(bestand?.gotenberg)}
                aufNeu={() => erzeuge([b], true)} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- Nach Kategorie ---------- */}
      <section style={s.karte}>
        <h2 style={s.h2}>Nach Kategorie</h2>
        {kategorien.map((k) => {
          const offen = offeneKat.has(k.kategorie);
          const fertigK = k.branchen.filter((b) => da.has(b.slug)).length;
          const fehltK = k.branchen.filter((b) => !da.has(b.slug));
          return (
            <div key={k.kategorie} style={s.katBlock}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button style={s.katKopf} onClick={() => katUmschalten(k.kategorie)}>
                  {offen ? '▾' : '▸'} {k.kategorie}
                </button>
                <span style={{ color: fertigK === k.branchen.length ? GRUEN : DIM, fontSize: 13 }}>
                  {fertigK}/{k.branchen.length}
                </span>
                {fehltK.length > 0 && (
                  <button style={s.knopfMini} disabled={laeuft || !bestand?.gotenberg}
                    onClick={() => erzeuge(fehltK)}>
                    {fehltK.length} fehlende
                  </button>
                )}
              </div>
              {offen && (
                <div style={{ marginTop: 8 }}>
                  {k.branchen.map((b) => (
                    <BranchenZeile key={b.slug} b={b} fertig={da.has(b.slug)} laeuft={laeuft}
                      aktiv={Boolean(bestand?.gotenberg)}
                      aufNeu={() => erzeuge([b], true)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function BranchenZeile({ b, fertig, laeuft, aktiv, aufNeu }: {
  b: WebBranche; fertig: boolean; laeuft: boolean; aktiv: boolean; aufNeu: () => void;
}) {
  return (
    <div style={s.zeile}>
      <span style={{ ...s.punkt, background: fertig ? GRUEN : 'rgba(143,163,190,0.35)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span>
      {fertig && (
        <a href={`/api/oeffentlich/dossier-pdf?branche=${encodeURIComponent(b.slug)}`}
           target="_blank" rel="noreferrer" style={s.link}>ansehen</a>
      )}
      <button style={s.knopfMini} disabled={laeuft || !aktiv} onClick={aufNeu}>
        {fertig ? 'neu bauen' : 'erzeugen'}
      </button>
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
  katBlock: { borderTop: `1px solid ${RAND}`, padding: '10px 0' },
  katKopf: { background: 'transparent', border: 'none', color: '#E8EDF4', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left', flex: 1, minWidth: 200 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: NAVY, border: `1px solid ${RAND}`, borderRadius: 9, padding: '7px 12px', marginBottom: 6, fontSize: 14 },
  punkt: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  link: { color: CYAN, fontSize: 13, textDecoration: 'none' },
  eingabe: { background: NAVY, border: `1px solid ${RAND}`, borderRadius: 9, padding: '9px 12px', color: '#E8EDF4', fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box', marginTop: 8 },
  knopfGold: { background: GOLD, color: NAVY, border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  knopfAus: { background: 'rgba(201,168,76,0.2)', color: 'rgba(255,255,255,0.45)', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'not-allowed', fontFamily: 'inherit', fontSize: 14 },
  knopfGrau: { background: 'transparent', color: DIM, border: `1px solid ${RAND}`, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  knopfMini: { background: 'transparent', color: CYAN, border: `1px solid ${CYAN}55`, borderRadius: 8, padding: '4px 11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 },
  balkenAussen: { height: 8, background: 'rgba(143,163,190,0.15)', borderRadius: 999, overflow: 'hidden' },
  balkenInnen: { height: '100%', background: GOLD, transition: 'width .3s' },
  hint: { color: DIM, fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0' },
  dim: { color: DIM, fontSize: 14, marginTop: 8 },
  warn: { color: GOLD, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: ROT, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', gap: 10 },
  ok: { color: GRUEN, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', gap: 10 },
  x: { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: 0 },
};
