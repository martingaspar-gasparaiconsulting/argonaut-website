'use client';
import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ALLE_MODULE } from '@/lib/rechte';

// ============================================================
// ARGONAUT OS · Einstellungen · Modul-Freischaltung (Starter-Modus, P2-2)
// Der Chef blendet Bereiche aus, die er (noch) nicht braucht. Speichert die
// EINGESCHALTETEN modul-Schlüssel in profiles.sichtbare_module (jsonb).
// Sind ALLE an -> wird NULL gespeichert (= kein Starter-Modus, alles sichtbar).
// Ausblenden versteckt nur das Menü - Daten bleiben, jederzeit wieder anschaltbar.
//
// P22-Housekeeping: Die Modul-Liste kommt jetzt aus lib/rechte.ts (ALLE_MODULE),
// abgeleitet aus NAV_LINKS - der EINEN Quelle der Wahrheit. Damit erscheint jedes
// jetzige UND künftige Modul (Termine, Dispo, Werkstatt, GoBD ...) automatisch mit
// Schalter. Kein Nachpflegen von Hand mehr, kein "X von Y"-Verzähler.
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GOLD = '#C9A84C';
const CYAN = '#00e5ff';
const GREEN = '#4CAF7D';

type Modul = { key: string; label: string };

// Steuerbare Module = alle mit modul-Schlüssel aus NAV_LINKS.
// Übersicht/Rechte/Einstellungen/Mein-Bereich/Zeiterfassung haben KEINEN
// modul-Schlüssel (immer/nurChef/nurMitarbeiter) und sind darum korrekt
// NICHT dabei - sie bleiben ohnehin immer sichtbar.
const MODULE: Modul[] = ALLE_MODULE;

const ALLE_KEYS = MODULE.map((m) => m.key);

function Toggle({ an, onClick }: { an: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="switch"
      aria-checked={an}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        background: an ? GOLD : 'rgba(255,255,255,0.15)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 3,
          left: an ? 21 : 3,
          transition: 'left 0.15s ease',
        }}
      />
    </div>
  );
}

export default function ModulFreischaltung() {
  const [userId, setUserId] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  const [an, setAn] = useState<Set<string>>(new Set(ALLE_KEYS));
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('sichtbare_module')
          .eq('id', user.id)
          .maybeSingle();
        const sm = data?.sichtbare_module;
        // null/kein Array = alle an (kein Starter-Modus)
        setAn(Array.isArray(sm) ? new Set(sm as string[]) : new Set(ALLE_KEYS));
      }
      setGeladen(true);
    })();
  }, []);

  const anzahlAn = an.size;
  const alleAn = anzahlAn === MODULE.length;

  function toggle(key: string) {
    setGespeichert(false);
    setAn((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function alleEin() {
    setGespeichert(false);
    setAn(new Set(ALLE_KEYS));
  }

  async function speichere() {
    if (!userId) {
      setFehler('Nicht eingeloggt. Bitte Seite neu laden.');
      return;
    }
    setSpeichern(true);
    setFehler(null);
    // Alle an -> NULL (kein Starter-Modus). Sonst Array der eingeschalteten Keys.
    const wert = alleAn ? null : ALLE_KEYS.filter((k) => an.has(k));
    const { error } = await supabase
      .from('profiles')
      .update({ sichtbare_module: wert })
      .eq('id', userId);
    setSpeichern(false);
    if (error) {
      setFehler('Speichern fehlgeschlagen: ' + error.message);
      return;
    }
    setGespeichert(true);
  }

  // ---------- Styles ----------
  const card: React.CSSProperties = {
    background: '#0F1F33',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '22px 24px',
    marginTop: 28,
  };
  const btnGold: React.CSSProperties = {
    padding: '11px 20px',
    borderRadius: 8,
    border: 'none',
    background: GOLD,
    color: '#0A1628',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  };
  const btnGhost: React.CSSProperties = {
    padding: '10px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  };

  return (
    <div style={card}>
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>
        🧩 Module &amp; Ansicht
      </h2>
      <p
        style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.55)',
          margin: '0 0 4px',
          lineHeight: 1.6,
          maxWidth: 640,
        }}
      >
        Blende Bereiche aus, die du (noch) nicht brauchst – so bleibt dein Menü
        übersichtlich. Ausgeblendete Module verschwinden nur aus der Navigation;
        deine Daten bleiben vollständig erhalten und du kannst jedes Modul
        jederzeit wieder einschalten.
      </p>
      <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', margin: '0 0 18px' }}>
        Übersicht, Rechte und Einstellungen bleiben immer sichtbar.
      </p>

      {!geladen ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '10px 0' }}>
          Lade Einstellungen…
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '2px 24px',
              marginBottom: 20,
            }}
          >
            {MODULE.map((m) => {
              const ein = an.has(m.key);
              return (
                <div
                  key={m.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '9px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      color: ein ? '#fff' : 'rgba(255,255,255,0.45)',
                      fontWeight: 600,
                    }}
                  >
                    {m.label}
                  </span>
                  <Toggle an={ein} onClick={() => toggle(m.key)} />
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <button
              style={{ ...btnGold, opacity: speichern ? 0.6 : 1 }}
              onClick={speichere}
              disabled={speichern}
            >
              {speichern ? 'Speichere…' : 'Speichern'}
            </button>
            {!alleAn && (
              <button style={btnGhost} onClick={alleEin} disabled={speichern}>
                Alle einschalten
              </button>
            )}
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              {alleAn
                ? 'Alle Module sichtbar (Starter-Modus aus)'
                : `${anzahlAn} von ${MODULE.length} Modulen sichtbar`}
            </span>
          </div>

          {gespeichert && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 8,
                background: 'rgba(76,175,125,0.12)',
                border: '1px solid rgba(76,175,125,0.4)',
                color: GREEN,
                fontSize: 13.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span>✅ Gespeichert. Das Menü oben aktualisiert sich beim nächsten Laden.</span>
              <button
                style={{
                  ...btnGhost,
                  color: CYAN,
                  borderColor: 'rgba(0,229,255,0.4)',
                }}
                onClick={() => window.location.reload()}
              >
                Menü jetzt aktualisieren
              </button>
            </div>
          )}

          {fehler && (
            <div
              style={{
                marginTop: 16,
                color: '#E06666',
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              {fehler}
            </div>
          )}
        </>
      )}
    </div>
  );
}
