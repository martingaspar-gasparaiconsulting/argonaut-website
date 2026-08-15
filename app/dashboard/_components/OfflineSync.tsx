'use client';

// ============================================================================
// ARGONAUT OS · _components/OfflineSync.tsx
//
// Der Postbote der Warteschlange. Laeuft im ganzen Dashboard mit und traegt
// nach, was ohne Netz eingegeben wurde — der Reihe nach, sobald es geht.
//
// WANN GEARBEITET WIRD
//   · beim Laden der Seite   · wenn das Geraet wieder online geht
//   · wenn der Tab wieder in den Vordergrund kommt   · alle 20 Sekunden
//
// WARUM STRENG DER REIHE NACH
//   Ein "Gehen" darf nie vor seinem "Kommen" ankommen. Klemmt der vorderste
//   Auftrag, wartet der Rest — lieber spaeter vollstaendig als jetzt verdreht.
//
// DER WICHTIGE SONDERFALL
//   Bricht die Verbindung ab, NACHDEM die Datenbank den Datensatz angenommen
//   hat, weiss das Geraet nichts davon und versucht es erneut. Weil jeder
//   Datensatz seine id schon beim Erfassen mitbekommt, meldet die Datenbank
//   dann "duplicate key" — und genau das ist der Beweis, dass es geklappt hat.
//   Der Auftrag gilt als erledigt statt ewig zu scheitern.
// ============================================================================

import { useEffect, useState, useCallback, useRef, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  browserSpeicher, alleAuftraege, naechster, entfernen, aktualisieren,
  stand, standText, fehlerText, sollAufgeben,
  type Auftrag, type Speicher, type Stand,
} from '@/lib/offlineWarteschlange';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

/** Andere Teile der App melden hierueber, dass etwas Neues in der Schlange liegt. */
export const WARTESCHLANGE_EVENT = 'argonaut-warteschlange';

const TAKT_MS = 20000;

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.22)',
  warn: '#E0A24C', danger: '#E06666',
};

export default function OfflineSync() {
  const [zustand, setZustand] = useState<Stand>({ offen: 0, aufgegeben: 0, gesamt: 0 });
  const [laeuft, setLaeuft] = useState(false);
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<Auftrag[]>([]);
  const [online, setOnline] = useState(true);
  const speicher = useRef<Speicher | null>(null);
  const arbeitet = useRef(false);

  if (typeof window !== 'undefined' && !speicher.current) speicher.current = browserSpeicher();

  const auffrischen = useCallback(() => {
    const sp = speicher.current;
    if (!sp) return;
    setZustand(stand(sp));
    setListe(alleAuftraege(sp));
  }, []);

  /** Arbeitet die Schlange ab, solange vorne etwas bereit ist. */
  const abarbeiten = useCallback(async () => {
    const sp = speicher.current;
    if (!sp || arbeitet.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    arbeitet.current = true;
    setLaeuft(true);
    try {
      // Deckel gegen Endlosschleifen bei einem hakeligen Netz.
      for (let runde = 0; runde < 50; runde++) {
        const jetzt = new Date();
        const a = naechster(sp, jetzt);
        if (!a) break;

        if (sollAufgeben(a, jetzt)) {
          aktualisieren(sp, a.id, { aufgegeben: true });
          auffrischen();
          continue;
        }

        const fehler = await senden(a);

        if (!fehler) { entfernen(sp, a.id); auffrischen(); continue; }

        const versuche = a.versuche + 1;
        aktualisieren(sp, a.id, {
          versuche,
          letzter_versuch_am: jetzt.toISOString(),
          letzter_fehler: fehlerText(fehler),
          aufgegeben: sollAufgeben({ ...a, versuche }, jetzt),
        });
        auffrischen();
        break;   // vorne klemmt es — der Rest wartet, damit die Reihenfolge haelt
      }
    } finally {
      arbeitet.current = false;
      setLaeuft(false);
      auffrischen();
    }
  }, [auffrischen]);

  useEffect(() => {
    auffrischen();
    const merkeNetz = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    merkeNetz();

    const beiOnline = () => { merkeNetz(); abarbeiten(); };
    const beiOffline = () => merkeNetz();
    const beiNeu = () => { auffrischen(); abarbeiten(); };
    const beiSichtbar = () => { if (document.visibilityState === 'visible') abarbeiten(); };

    window.addEventListener('online', beiOnline);
    window.addEventListener('offline', beiOffline);
    window.addEventListener(WARTESCHLANGE_EVENT, beiNeu);
    document.addEventListener('visibilitychange', beiSichtbar);
    const takt = setInterval(abarbeiten, TAKT_MS);

    abarbeiten();

    return () => {
      window.removeEventListener('online', beiOnline);
      window.removeEventListener('offline', beiOffline);
      window.removeEventListener(WARTESCHLANGE_EVENT, beiNeu);
      document.removeEventListener('visibilitychange', beiSichtbar);
      clearInterval(takt);
    };
  }, [abarbeiten, auffrischen]);

  function nochmal(a: Auftrag) {
    const sp = speicher.current;
    if (!sp) return;
    aktualisieren(sp, a.id, { aufgegeben: false, versuche: 0, letzter_versuch_am: undefined, letzter_fehler: undefined });
    auffrischen();
    abarbeiten();
  }

  function verwerfen(a: Auftrag) {
    const sp = speicher.current;
    if (!sp) return;
    if (typeof window !== 'undefined' && !window.confirm(`„${a.beschreibung}" endgültig verwerfen? Die Eingabe ist dann weg.`)) return;
    entfernen(sp, a.id);
    auffrischen();
  }

  if (zustand.gesamt === 0) return null;

  const farbe = zustand.aufgegeben > 0 ? C.danger : online ? C.cyan : C.warn;

  return (
    <div style={stile.ecke}>
      <button type="button" onClick={() => setOffen((o) => !o)} style={{ ...stile.pille, borderColor: farbe }}>
        <span style={{ ...stile.punkt, background: farbe }} />
        <span style={{ fontWeight: 700 }}>
          {laeuft ? 'Wird übertragen …' : standText(zustand)}
        </span>
        <span style={{ color: C.dim, fontSize: 12 }}>{offen ? '▾' : '▸'}</span>
      </button>

      {offen && (
        <div style={stile.klappe}>
          <div style={stile.kopf}>
            {online
              ? 'Verbindung da — die Eingaben werden der Reihe nach übertragen.'
              : 'Kein Netz. Ihre Eingaben sind gespeichert und gehen automatisch raus, sobald wieder Empfang da ist.'}
          </div>

          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {liste.map((a) => (
              <div key={a.id} style={stile.zeile}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.beschreibung}</div>
                  <div style={{ color: a.aufgegeben ? C.danger : C.dim, fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
                    {a.aufgegeben
                      ? `Nicht übertragen: ${a.letzter_fehler ?? 'unbekannter Grund'}`
                      : a.versuche > 0
                        ? `${a.versuche}. Versuch — ${a.letzter_fehler ?? 'wird wiederholt'}`
                        : 'wartet'}
                  </div>
                </div>
                {a.aufgegeben && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => nochmal(a)} style={stile.klein}>Nochmal</button>
                    <button type="button" onClick={() => verwerfen(a)} style={{ ...stile.klein, color: C.danger, borderColor: 'rgba(224,102,102,0.45)' }}>Verwerfen</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {online && zustand.offen > 0 && (
            <button type="button" onClick={abarbeiten} disabled={laeuft} style={{ ...stile.klein, width: '100%', marginTop: 8, padding: '9px 12px', opacity: laeuft ? 0.6 : 1 }}>
              {laeuft ? 'Läuft …' : 'Jetzt übertragen'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Schickt einen Auftrag zur Datenbank. Gibt null bei Erfolg, sonst den Fehlertext. */
async function senden(a: Auftrag): Promise<string | null> {
  try {
    if (a.art === 'insert') {
      const { error } = await supabase.from(a.tabelle).insert(a.werte);
      if (!error) return null;
      // Schon angekommen (unsere eigene id liegt bereits in der Tabelle) -> erledigt.
      if (istSchonDa(error.message)) return null;
      return error.message;
    }
    if (!a.zielId) return 'Auftrag ohne Ziel — kann nicht übertragen werden.';
    const { error } = await supabase.from(a.tabelle).update(a.werte).eq('id', a.zielId);
    return error ? error.message : null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : 'Unbekannter Fehler';
  }
}

function istSchonDa(meldung: string): boolean {
  const t = (meldung || '').toLowerCase();
  return t.includes('duplicate key') || t.includes('already exists') || t.includes('23505');
}

const stile: Record<string, CSSProperties> = {
  ecke: {
    position: 'fixed', right: 12, bottom: 12, zIndex: 61,
    maxWidth: 'min(400px, calc(100vw - 24px))',
    fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
  },
  pille: {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
    background: C.navy2, border: '1px solid', borderRadius: 999,
    padding: '9px 14px', color: C.text, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 6px 22px rgba(0,0,0,0.4)',
  },
  punkt: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  klappe: {
    marginTop: 8, background: C.navy2, border: `1px solid ${C.border}`,
    borderRadius: 13, padding: 13, color: C.text,
    boxShadow: '0 10px 34px rgba(0,0,0,0.45)',
  },
  kopf: { color: C.dim, fontSize: 12.5, lineHeight: 1.55, marginBottom: 10 },
  zeile: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '8px 0', borderTop: `1px solid ${C.border}`,
  },
  klein: {
    padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
    background: 'transparent', color: C.text, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
};
