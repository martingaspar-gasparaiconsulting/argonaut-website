'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { NAV_LINKS } from '@/lib/rechte';
import {
  abbruchSatz,
  abbruchstellen,
  nachNutzung,
  nieBenutzt,
  summeAufrufe,
  HAENGT_AB_TAGEN,
  GRUNDSCHRITTE,
  type NutzungZeile,
  type OnboardingStand,
} from '@/lib/nutzung';

// ============================================================
// ARGONAUT OS · Command Center · Nutzung (Punkt 6.4)
//
// Zwei Fragen, mehr nicht:
//   1. Welche Module werden TATSÄCHLICH benutzt — und welche nie?
//   2. Wo bleibt das Onboarding stehen?
//
// ▄▄▄ WAS HIER BEWUSST FEHLT ▄▄▄
// Keine Zahl je Mitarbeiter, keine Bearbeitungsdauer, keine Klickzahl. Sobald
// auf Mitarbeiterebene gemessen wird, ist das Leistungs- und Verhaltens-
// kontrolle (§ 87 Abs. 1 Nr. 6 BetrVG) — und mitbestimmungspflichtig, weil die
// Einrichtung dazu GEEIGNET ist. Auf die Absicht kommt es nicht an. Das steht
// als Block I auf der Anwaltsliste und ist nicht freigegeben.
//
// Die technischen Antwortzeiten je Route misst Vercel bereits. Hier geht es um
// die andere Hälfte: wo der Mensch nicht weiterkommt.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

/** Alle Module, die es überhaupt gibt — für die Frage „was benutzt niemand?“. */
const ALLE_MODULE: string[] = Array.from(
  new Set(NAV_LINKS.map((l) => l.modul).filter((m): m is string => !!m)),
);

/** Anzeigename zu einem Modul-Schlüssel. */
const NAME_JE_MODUL = new Map<string, string>(
  NAV_LINKS.filter((l) => l.modul).map((l) => [l.modul as string, l.label ?? (l.modul as string)]),
);

function modulName(key: string): string {
  if (key === 'uebersicht') return 'Übersicht';
  if (key === 'sonstiges') return 'Sonstige Seiten';
  return NAME_JE_MODUL.get(key) ?? key;
}

const ZEITRAEUME = [7, 30, 90];

export default function CcNutzung() {
  const [tage, setTage] = useState(30);
  const [module, setModule] = useState<NutzungZeile[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingStand[]>([]);
  const [modulLesbar, setModulLesbar] = useState(true);
  const [onbLesbar, setOnbLesbar] = useState(true);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const holen = useCallback(async (t: number) => {
    setLaden(true); setFehler(null);
    try {
      const r = await fetch(`/api/admin/nutzung?tage=${t}`);
      const d = await r.json();
      if (d?.ok) {
        setModule(Array.isArray(d.module) ? d.module : []);
        setOnboarding(Array.isArray(d.onboarding) ? d.onboarding : []);
        setModulLesbar(d.modulLesbar !== false);
        setOnbLesbar(d.onboardingLesbar !== false);
      } else {
        setFehler(d?.error || 'Konnte die Zahlen nicht laden.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setLaden(false);
  }, []);

  useEffect(() => { holen(tage); }, [holen, tage]);

  const sortiert = nachNutzung(module);
  const gesamt = summeAufrufe(module);
  const ungenutzt = nieBenutzt(ALLE_MODULE, module);
  const stellen = abbruchstellen(onboarding, GRUNDSCHRITTE);
  const satz = abbruchSatz(stellen);
  const haengende = stellen.reduce((s, x) => s + x.betriebe, 0);
  const hoechste = sortiert.length ? sortiert[0].aufrufe : 0;

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>

        <div style={s.kopf}>
          <div>
            <h1 style={s.h1}>📊 Nutzung</h1>
            <p style={s.sub}>
              Was wird wirklich benutzt — und wo bleibt das Onboarding stehen? Gezählt wird
              je Betrieb und Tag, nie je Mitarbeiter.
            </p>
          </div>
          <a href="/admin/command-center" style={s.btnGhost}>‹ Command Center</a>
        </div>

        {fehler && <div style={s.fehlerBox}>{fehler}</div>}

        <div style={{ ...s.zeile, marginBottom: 18 }}>
          {ZEITRAEUME.map((t) => (
            <button
              key={t}
              onClick={() => setTage(t)}
              style={{ ...s.wahl, ...(tage === t ? s.wahlAn : {}) }}
            >
              {t} Tage
            </button>
          ))}
        </div>

        {laden ? (
          <div style={s.hint}>Lädt …</div>
        ) : (
          <>
            <div style={s.kpiZeile}>
              <div style={s.kpi}><b>{gesamt.toLocaleString('de-DE')}</b><span style={s.kpiText}>Modul-Aufrufe</span></div>
              <div style={s.kpi}><b>{sortiert.length}</b><span style={s.kpiText}>Module in Benutzung</span></div>
              <div style={s.kpi}>
                <b style={{ color: ungenutzt.length > 0 ? C.warn : C.green }}>{ungenutzt.length}</b>
                <span style={s.kpiText}>Module ohne einen Aufruf</span>
              </div>
              <div style={s.kpi}>
                <b style={{ color: haengende > 0 ? C.gold : C.green }}>{haengende}</b>
                <span style={s.kpiText}>Betriebe im Onboarding hängen</span>
              </div>
            </div>

            {/* --- Was benutzt wird ------------------------------------------ */}
            <div style={s.karte}>
              <div style={s.karteTitel}>Benutzte Module</div>
              {!modulLesbar && (
                <div style={s.warnBox}>
                  Die Zähltabelle war nicht lesbar. Was hier steht, ist unvollständig — das ist
                  kein „niemand benutzt etwas“.
                </div>
              )}
              {sortiert.length === 0 ? (
                <p style={s.hinweis}>
                  Noch keine Aufrufe im gewählten Zeitraum. Gezählt wird erst seit dem Einbau —
                  frühere Nutzung steht nirgends, weil sie nie erfasst wurde.
                </p>
              ) : (
                sortiert.map((z) => (
                  <div key={z.modul_key} style={s.balkenZeile}>
                    <div style={s.balkenName}>{modulName(z.modul_key)}</div>
                    <div style={s.balkenAussen}>
                      <div style={{ ...s.balkenInnen, width: `${hoechste ? Math.max(2, (z.aufrufe / hoechste) * 100) : 2}%` }} />
                    </div>
                    <div style={s.balkenZahl}>
                      {z.aufrufe.toLocaleString('de-DE')}
                      <span style={{ color: C.textDim, fontWeight: 400 }}> · {z.betriebe} {z.betriebe === 1 ? 'Betrieb' : 'Betriebe'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* --- Was niemand benutzt --------------------------------------- */}
            <div style={s.karte}>
              <div style={s.karteTitel}>Kein einziger Aufruf</div>
              <p style={s.hinweis}>
                Die eigentliche Frage. Ein Modul ganz oben in der Liste bestätigt nur, was man
                ohnehin ahnt. Ein Modul mit null Aufrufen ist entweder überflüssig, unauffindbar
                oder kaputt — alle drei Fälle sind einen Blick wert.
              </p>
              {ungenutzt.length === 0 ? (
                <p style={{ ...s.hinweis, color: C.green }}>Jedes Modul wurde mindestens einmal geöffnet.</p>
              ) : (
                <div style={{ ...s.zeile, marginTop: 12 }}>
                  {ungenutzt.map((m) => (
                    <span key={m} style={s.pille}>{modulName(m)}</span>
                  ))}
                </div>
              )}
            </div>

            {/* --- Wo das Onboarding stehenbleibt ---------------------------- */}
            <div style={s.karte}>
              <div style={s.karteTitel}>Wo das Onboarding stehenbleibt</div>
              {!onbLesbar ? (
                <div style={s.warnBox}>Die Onboarding-Stände waren nicht lesbar.</div>
              ) : stellen.length === 0 ? (
                <p style={{ ...s.hinweis, color: C.green }}>
                  Kein Betrieb hängt fest. Als hängend gilt, wer nicht fertig ist und seit
                  mindestens {HAENGT_AB_TAGEN} Tagen keinen Schritt mehr erledigt hat.
                </p>
              ) : (
                <>
                  <p style={{ ...s.hinweis, color: '#fff', fontSize: 14.5 }}>{satz}</p>
                  <table style={s.tabelle}>
                    <thead>
                      <tr>
                        <th style={s.th}>Erledigte Schritte</th>
                        <th style={{ ...s.th, textAlign: 'right' }}>Betriebe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stellen.map((x) => (
                        <tr key={x.erledigte}>
                          <td style={s.td}>{x.erledigte}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{x.betriebe}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={s.hinweis}>
                    Die Häufung ist die Antwort: Bleiben mehrere Betriebe bei genau derselben
                    Zahl stehen, ist der nächste Schritt das Problem — nicht die Betriebe.
                  </p>
                </>
              )}
            </div>

            <div style={s.grenzeBox}>
              <b style={{ color: C.gold }}>Wo diese Seite bewusst aufhört</b>
              <p style={{ ...s.hinweis, marginTop: 8 }}>
                Keine Zahl je Mitarbeiter, keine Bearbeitungsdauer, keine Klickzahl. Sobald auf
                Mitarbeiterebene gemessen wird, ist das Leistungs- und Verhaltenskontrolle nach
                § 87 Abs. 1 Nr. 6 BetrVG — mitbestimmungspflichtig, weil die Einrichtung dazu
                <b> geeignet</b> ist. Auf die Absicht kommt es nicht an. Das steht als Block I
                auf der Anwaltsliste und ist nicht freigegeben.
              </p>
              <p style={{ ...s.hinweis, marginTop: 8 }}>
                Die technischen Antwortzeiten je Seite misst Vercel bereits — dafür muss hier
                nichts gebaut werden.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 16 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 2.4vw, 2.1rem)', fontWeight: 700, color: C.gold, margin: 0 },
  sub: { fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '8px 0 0', maxWidth: '62ch', lineHeight: 1.6 },
  btnGhost: { background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },

  zeile: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  wahl: { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 999, padding: '8px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  wahlAn: { background: C.gold, color: C.navy, borderColor: C.gold },

  kpiZeile: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 },
  kpi: { background: C.navy2, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 20px', fontFamily: 'DM Sans, sans-serif', minWidth: 165, color: '#fff', fontSize: 24, fontWeight: 700 },
  kpiText: { display: 'block', color: C.textDim, fontSize: 12.5, fontWeight: 400, marginTop: 2 },

  karte: { background: C.navy2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', marginBottom: 18, fontFamily: 'DM Sans, sans-serif' },
  karteTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, color: '#fff', fontSize: '1.15rem', marginBottom: 12 },
  hinweis: { color: C.textDim, fontSize: 13, lineHeight: 1.55, margin: '8px 0 0', maxWidth: '74ch' },

  balkenZeile: { display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr minmax(120px, auto)', gap: 12, alignItems: 'center', padding: '7px 0' },
  balkenName: { color: '#fff', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  balkenAussen: { background: 'rgba(255,255,255,0.07)', borderRadius: 999, height: 8, overflow: 'hidden' },
  balkenInnen: { height: '100%', borderRadius: 999, background: C.cyan },
  balkenZahl: { color: '#fff', fontSize: 13, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' },

  pille: { color: C.warn, border: `1px solid ${C.warn}66`, borderRadius: 999, padding: '5px 13px', fontSize: 13, fontWeight: 700 },

  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12, maxWidth: 420 },
  th: { textAlign: 'left', color: C.textDim, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0 12px 8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  td: { padding: '10px 12px 10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff' },

  grenzeBox: { background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.gold}55`, borderRadius: 14, padding: '18px 22px', marginBottom: 18, fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#fff' },
  warnBox: { background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '11px 14px', marginBottom: 12, color: '#fff', fontSize: 13.5, lineHeight: 1.55 },
  hint: { color: C.textDim, fontFamily: 'DM Sans, sans-serif', padding: 20 },
  fehlerBox: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.danger}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' },
};
