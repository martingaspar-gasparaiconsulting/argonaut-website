'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · BLOCK 12 · KORRESPONDENZ — K2 Cockpit
// korrespondenz-Liste + Brief-Art/Status + KPIs + Filter + CRUD
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---- Farben (Dashboard-Standard) ----
const GOLD = '#C9A84C';
const NAVY = '#0A1628';
const CYAN = '#00e5ff';

// ---- Typen ----
type Brief = {
  id: string;
  brief_nummer: string | null;
  brief_art: string;
  status: string;
  betreff: string;
  brieftext: string | null;
  absender_name: string | null;
  absender_anschrift: string | null;
  empfaenger_name: string | null;
  empfaenger_anschrift: string | null;
  versendet_am: string | null;
  created_at: string;
  updated_at: string;
};

type NeuFormular = {
  brief_art: string;
  betreff: string;
  empfaenger_name: string;
  empfaenger_anschrift: string;
};

// ---- Anzeige-Labels ----
const ART_LABEL: Record<string, string> = {
  anschreiben: 'Anschreiben',
  angebot: 'Angebot',
  mahnung: 'Mahnung',
  kuendigung: 'Kündigung',
  allgemein: 'Allgemein',
};
const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf',
  final: 'Final',
  versendet: 'Versendet',
};

// ---- Status-Badge-Farben ----
function statusStil(status: string): React.CSSProperties {
  const map: Record<string, { c: string; bg: string }> = {
    entwurf: { c: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)' },
    final: { c: CYAN, bg: 'rgba(0,229,255,0.12)' },
    versendet: { c: '#66bb6a', bg: 'rgba(102,187,106,0.14)' },
  };
  const s = map[status] || map.entwurf;
  return {
    color: s.c,
    background: s.bg,
    border: `1px solid ${s.c}55`,
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: 'clamp(12px, 1.06vw, 17px)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

// ---- Brief-Art-Badge ----
function artStil(): React.CSSProperties {
  return {
    color: GOLD,
    background: 'rgba(201,168,76,0.14)',
    border: `1px solid ${GOLD}55`,
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: 'clamp(12px, 1.06vw, 17px)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

function datumKurz(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ---- leeres Formular ----
const LEER: NeuFormular = {
  brief_art: 'anschreiben',
  betreff: '',
  empfaenger_name: '',
  empfaenger_anschrift: '',
};

export default function KorrespondenzPage() {
  const [briefe, setBriefe] = useState<Brief[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Filter/Suche
  const [suche, setSuche] = useState('');
  const [filterStatus, setFilterStatus] = useState('alle');
  const [filterArt, setFilterArt] = useState('alle');

  // Neu-Modal
  const [modalOffen, setModalOffen] = useState(false);
  const [form, setForm] = useState<NeuFormular>(LEER);
  const [speichern, setSpeichern] = useState(false);

  // ---- Laden ----
  const laden_briefe = useCallback(async () => {
    setLaden(true);
    setFehler(null);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setFehler('Nicht angemeldet.');
      setLaden(false);
      return;
    }
    const { data, error } = await supabase
      .from('korrespondenz')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setFehler(error.message);
      setLaden(false);
      return;
    }
    setBriefe((data as Brief[]) || []);
    setLaden(false);
  }, []);

  useEffect(() => {
    laden_briefe();
  }, [laden_briefe]);

  // ---- Brief-Nummer BR-JJJJ-XXXX ----
  async function naechsteNummer(): Promise<string> {
    const jahr = new Date().getFullYear();
    const prefix = `BR-${jahr}-`;
    const { data } = await supabase
      .from('korrespondenz')
      .select('brief_nummer')
      .like('brief_nummer', `${prefix}%`)
      .order('brief_nummer', { ascending: false })
      .limit(1);
    let next = 1;
    if (data && data.length > 0 && data[0].brief_nummer) {
      const rest = String(data[0].brief_nummer).slice(prefix.length);
      const last = parseInt(rest, 10);
      if (!isNaN(last)) next = last + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  // ---- Speichern ----
  async function briefAnlegen() {
    if (!form.betreff.trim()) {
      setFehler('Betreff ist Pflicht.');
      return;
    }
    setSpeichern(true);
    setFehler(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setFehler('Nicht angemeldet.');
      setSpeichern(false);
      return;
    }

    const nummer = await naechsteNummer();

    const insertObj = {
      owner_user_id: userData.user.id,
      brief_nummer: nummer,
      brief_art: form.brief_art,
      status: 'entwurf',
      betreff: form.betreff.trim(),
      empfaenger_name: form.empfaenger_name.trim() || null,
      empfaenger_anschrift: form.empfaenger_anschrift.trim() || null,
    };

    const { data, error } = await supabase
      .from('korrespondenz')
      .insert(insertObj)
      .select('id')
      .single();

    setSpeichern(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setModalOffen(false);
    setForm(LEER);
    // direkt in den Brief-Editor springen
    if (data?.id) {
      window.location.href = `/dashboard/korrespondenz/${data.id}`;
    } else {
      laden_briefe();
    }
  }

  // ---- Gefilterte Liste ----
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return briefe.filter((b) => {
      if (filterStatus !== 'alle' && b.status !== filterStatus) return false;
      if (filterArt !== 'alle' && b.brief_art !== filterArt) return false;
      if (q) {
        const heu = [b.brief_nummer, b.betreff, b.empfaenger_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!heu.includes(q)) return false;
      }
      return true;
    });
  }, [briefe, suche, filterStatus, filterArt]);

  // ---- KPIs ----
  const kpi = useMemo(() => {
    const entwurf = briefe.filter((b) => b.status === 'entwurf').length;
    const final = briefe.filter((b) => b.status === 'final').length;
    const versendet = briefe.filter((b) => b.status === 'versendet').length;
    return { entwurf, final, versendet, gesamt: briefe.length };
  }, [briefe]);

  // ---- Styles ----
  const karte: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '16px 18px',
  };
  const inputStil: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#fff',
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    boxSizing: 'border-box',
  };
  const labelStil: React.CSSProperties = {
    display: 'block',
    fontSize: 'clamp(12px, 1.06vw, 17px)',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '4px',
    fontWeight: 600,
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '8px 4px' }}>
      {/* ---- MODUL-KOPF (neuer Standard) ---- */}
      <div style={{ marginBottom: '24px' }}>
        <h1
          style={{
            color: GOLD,
            fontSize: 'clamp(30px, 2.63vw, 42px)',
            fontWeight: 700,
            margin: '0 0 6px 0',
          }}
        >
          ✉️ Korrespondenz
        </h1>
        <p
          style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: 'clamp(15px, 1.31vw, 21px)',
            margin: 0,
            maxWidth: '760px',
          }}
        >
          Geschäftsbriefe nach DIN 5008 — Anschreiben, Angebote, Mahnungen und
          mehr. Als PDF erstellen, mit KI-Unterstützung formulieren.
        </p>
      </div>

      {/* ---- KPIs ---- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {[
          { label: 'Entwürfe', wert: kpi.entwurf, c: 'rgba(255,255,255,0.85)' },
          { label: 'Final', wert: kpi.final, c: CYAN },
          { label: 'Versendet', wert: kpi.versendet, c: '#66bb6a' },
          { label: 'Gesamt', wert: kpi.gesamt, c: GOLD },
        ].map((k) => (
          <div key={k.label} style={karte}>
            <div
              style={{
                fontSize: 'clamp(28px, 2.44vw, 39px)',
                fontWeight: 700,
                color: k.c,
                lineHeight: 1.1,
              }}
            >
              {k.wert}
            </div>
            <div
              style={{
                fontSize: 'clamp(13px, 1.13vw, 18px)',
                color: 'rgba(255,255,255,0.6)',
                marginTop: '4px',
              }}
            >
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Aktionsleiste ---- */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <button
          onClick={() => {
            setForm(LEER);
            setFehler(null);
            setModalOffen(true);
          }}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            background: GOLD,
            color: NAVY,
            border: 'none',
            fontSize: 'clamp(14px, 1.25vw, 20px)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + Neuer Brief
        </button>

        <input
          placeholder="🔍 Suche (Nr., Betreff, Empfänger) …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          style={{ ...inputStil, maxWidth: '300px', width: 'auto', flex: '1 1 220px' }}
        />

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ ...inputStil, width: 'auto' }}
        >
          <option value="alle">Alle Status</option>
          <option value="entwurf">Entwurf</option>
          <option value="final">Final</option>
          <option value="versendet">Versendet</option>
        </select>

        <select
          value={filterArt}
          onChange={(e) => setFilterArt(e.target.value)}
          style={{ ...inputStil, width: 'auto' }}
        >
          <option value="alle">Alle Arten</option>
          <option value="anschreiben">Anschreiben</option>
          <option value="angebot">Angebot</option>
          <option value="mahnung">Mahnung</option>
          <option value="kuendigung">Kündigung</option>
          <option value="allgemein">Allgemein</option>
        </select>
      </div>

      {/* ---- Fehler ---- */}
      {fehler && (
        <div
          style={{
            ...karte,
            borderColor: '#ef535055',
            color: '#ef5350',
            marginBottom: '16px',
          }}
        >
          ⚠️ {fehler}
        </div>
      )}

      {/* ---- Liste ---- */}
      {laden ? (
        <div style={{ color: 'rgba(255,255,255,0.6)', padding: '30px 0' }}>
          Lädt …
        </div>
      ) : gefiltert.length === 0 ? (
        <div style={{ ...karte, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 'clamp(15px, 1.31vw, 21px)', color: 'rgba(255,255,255,0.6)' }}>
            {briefe.length === 0
              ? 'Noch keine Briefe. Lege den ersten über „+ Neuer Brief" an.'
              : 'Keine Briefe für diese Filter.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {gefiltert.map((b) => (
            <a
              key={b.id}
              href={`/dashboard/korrespondenz/${b.id}`}
              style={{
                ...karte,
                textDecoration: 'none',
                display: 'block',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: '200px', flex: '1 1 300px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      marginBottom: '4px',
                    }}
                  >
                    <span
                      style={{
                        color: GOLD,
                        fontSize: 'clamp(13px, 1.13vw, 18px)',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }}
                    >
                      {b.brief_nummer || '—'}
                    </span>
                    <span style={artStil()}>
                      {ART_LABEL[b.brief_art] || b.brief_art}
                    </span>
                    <span style={statusStil(b.status)}>
                      {STATUS_LABEL[b.status] || b.status}
                    </span>
                  </div>
                  <div
                    style={{
                      color: '#fff',
                      fontSize: 'clamp(15px, 1.31vw, 21px)',
                      fontWeight: 600,
                      marginBottom: '3px',
                    }}
                  >
                    {b.betreff}
                  </div>
                  <div
                    style={{
                      color: 'rgba(255,255,255,0.55)',
                      fontSize: 'clamp(13px, 1.13vw, 18px)',
                    }}
                  >
                    {b.empfaenger_name || 'Kein Empfänger'} · erstellt{' '}
                    {datumKurz(b.created_at)}
                  </div>
                </div>

                <div style={{ textAlign: 'right', minWidth: '90px' }}>
                  <div
                    style={{
                      color: 'rgba(255,255,255,0.4)',
                      fontSize: 'clamp(12px, 1.06vw, 17px)',
                    }}
                  >
                    {b.status === 'versendet' && b.versendet_am
                      ? `versendet ${datumKurz(b.versendet_am)}`
                      : 'öffnen →'}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* ---- NEU-MODAL ---- */}
      {modalOffen && (
        <div
          onClick={() => !speichern && setModalOffen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '40px 16px',
            zIndex: 1000,
            overflowY: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: NAVY,
              border: `1px solid ${GOLD}44`,
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
            }}
          >
            <h2
              style={{
                color: GOLD,
                fontSize: 'clamp(20px, 1.75vw, 28px)',
                fontWeight: 700,
                margin: '0 0 18px 0',
              }}
            >
              Neuer Brief
            </h2>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStil}>Brief-Art</label>
              <select
                style={inputStil}
                value={form.brief_art}
                onChange={(e) =>
                  setForm({ ...form, brief_art: e.target.value })
                }
              >
                <option value="anschreiben">Anschreiben</option>
                <option value="angebot">Angebot</option>
                <option value="mahnung">Mahnung</option>
                <option value="kuendigung">Kündigung</option>
                <option value="allgemein">Allgemein</option>
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStil}>Betreff *</label>
              <input
                style={inputStil}
                value={form.betreff}
                onChange={(e) => setForm({ ...form, betreff: e.target.value })}
                placeholder="z.B. Angebot für Ihre Anfrage vom …"
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStil}>Empfänger-Name</label>
              <input
                style={inputStil}
                value={form.empfaenger_name}
                onChange={(e) =>
                  setForm({ ...form, empfaenger_name: e.target.value })
                }
                placeholder="z.B. Schäfer Holzernteservice"
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={labelStil}>Empfänger-Anschrift</label>
              <textarea
                style={{ ...inputStil, minHeight: '70px', resize: 'vertical' }}
                value={form.empfaenger_anschrift}
                onChange={(e) =>
                  setForm({ ...form, empfaenger_anschrift: e.target.value })
                }
                placeholder={'Straße Hausnummer\nPLZ Ort'}
              />
            </div>

            <div
              style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}
            >
              <button
                onClick={() => setModalOffen(false)}
                disabled={speichern}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: 'clamp(14px, 1.25vw, 20px)',
                  fontWeight: 600,
                  cursor: speichern ? 'not-allowed' : 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={briefAnlegen}
                disabled={speichern}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: GOLD,
                  color: NAVY,
                  border: 'none',
                  fontSize: 'clamp(14px, 1.25vw, 20px)',
                  fontWeight: 700,
                  cursor: speichern ? 'not-allowed' : 'pointer',
                  opacity: speichern ? 0.6 : 1,
                }}
              >
                {speichern ? 'Erstellt …' : 'Brief anlegen & öffnen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
