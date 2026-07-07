'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import ServiceAuge from "./ServiceAuge";

// ============================================================
// ARGONAUT OS · BLOCK 11 · KUNDENSERVICE — T2 Ticket-Cockpit
// tickets-Liste + Status/Prioritaet + SLA-Ampel + KPIs + CRUD
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
type Ticket = {
  id: string;
  ticket_nummer: string | null;
  betreff: string;
  beschreibung: string | null;
  status: string;
  prioritaet: string;
  kategorie: string;
  kanal: string;
  kunde_name: string | null;
  kunde_email: string | null;
  kunde_telefon: string | null;
  faellig_am: string | null;
  geloest_am: string | null;
  created_at: string;
  updated_at: string;
};

type NeuFormular = {
  betreff: string;
  beschreibung: string;
  prioritaet: string;
  kategorie: string;
  kanal: string;
  kunde_name: string;
  kunde_email: string;
  kunde_telefon: string;
};

// ---- SLA-Fristen je Prioritaet (in Stunden) ----
const SLA_STUNDEN: Record<string, number> = {
  dringend: 4,
  hoch: 24,
  mittel: 72,
  niedrig: 168,
};

// ---- Anzeige-Labels ----
const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  wartet: 'Wartet',
  geloest: 'Gelöst',
  geschlossen: 'Geschlossen',
};
const PRIO_LABEL: Record<string, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
  dringend: 'Dringend',
};
const KATEGORIE_LABEL: Record<string, string> = {
  anfrage: 'Anfrage',
  support: 'Support',
  reklamation: 'Reklamation',
  sonstiges: 'Sonstiges',
};
const KANAL_LABEL: Record<string, string> = {
  email: 'E-Mail',
  telefon: 'Telefon',
  web: 'Web',
  persoenlich: 'Persönlich',
};

// ---- Status-Badge-Farben ----
function statusStil(status: string): React.CSSProperties {
  const map: Record<string, { c: string; bg: string }> = {
    offen: { c: CYAN, bg: 'rgba(0,229,255,0.12)' },
    in_bearbeitung: { c: GOLD, bg: 'rgba(201,168,76,0.14)' },
    wartet: { c: '#b39ddb', bg: 'rgba(179,157,219,0.14)' },
    geloest: { c: '#66bb6a', bg: 'rgba(102,187,106,0.14)' },
    geschlossen: { c: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)' },
  };
  const s = map[status] || map.offen;
  return {
    color: s.c,
    background: s.bg,
    border: `1px solid ${s.c}55`,
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

// ---- Prioritaet-Badge-Farben ----
function prioStil(prio: string): React.CSSProperties {
  const map: Record<string, string> = {
    niedrig: 'rgba(255,255,255,0.55)',
    mittel: CYAN,
    hoch: '#ffa726',
    dringend: '#ef5350',
  };
  const c = map[prio] || CYAN;
  return {
    color: c,
    background: `${c}1f`,
    border: `1px solid ${c}55`,
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

// ---- SLA-Ampel: liest faellig_am + status ----
function slaAmpel(t: Ticket): { farbe: string; text: string } {
  if (t.status === 'geloest' || t.status === 'geschlossen') {
    return { farbe: 'rgba(255,255,255,0.4)', text: 'erledigt' };
  }
  if (!t.faellig_am) {
    return { farbe: 'rgba(255,255,255,0.4)', text: '—' };
  }
  const jetzt = Date.now();
  const faellig = new Date(t.faellig_am).getTime();
  const diffStd = (faellig - jetzt) / 36e5;
  if (diffStd < 0) {
    const ueber = Math.abs(Math.round(diffStd));
    return { farbe: '#ef5350', text: `überfällig (${ueber}h)` };
  }
  if (diffStd < 8) {
    return { farbe: '#ffa726', text: `in ${Math.round(diffStd)}h fällig` };
  }
  return { farbe: '#66bb6a', text: `in ${Math.round(diffStd)}h fällig` };
}

function datumKurz(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ---- leeres Formular ----
const LEER: NeuFormular = {
  betreff: '',
  beschreibung: '',
  prioritaet: 'mittel',
  kategorie: 'anfrage',
  kanal: 'email',
  kunde_name: '',
  kunde_email: '',
  kunde_telefon: '',
};

export default function ServicePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Filter/Suche
  const [suche, setSuche] = useState('');
  const [filterStatus, setFilterStatus] = useState('alle');
  const [filterPrio, setFilterPrio] = useState('alle');

  // Neu-Modal
  const [modalOffen, setModalOffen] = useState(false);
  const [form, setForm] = useState<NeuFormular>(LEER);
  const [speichern, setSpeichern] = useState(false);

  // ---- Laden ----
  const laden_tickets = useCallback(async () => {
    setLaden(true);
    setFehler(null);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setFehler('Nicht angemeldet.');
      setLaden(false);
      return;
    }
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setFehler(error.message);
      setLaden(false);
      return;
    }
    setTickets((data as Ticket[]) || []);
    setLaden(false);
  }, []);

  useEffect(() => {
    laden_tickets();
  }, [laden_tickets]);

  // ---- Ticket-Nummer TK-JJJJ-XXXX ----
  async function naechsteNummer(): Promise<string> {
    const jahr = new Date().getFullYear();
    const prefix = `TK-${jahr}-`;
    const { data } = await supabase
      .from('tickets')
      .select('ticket_nummer')
      .like('ticket_nummer', `${prefix}%`)
      .order('ticket_nummer', { ascending: false })
      .limit(1);
    let next = 1;
    if (data && data.length > 0 && data[0].ticket_nummer) {
      const rest = String(data[0].ticket_nummer).slice(prefix.length);
      const last = parseInt(rest, 10);
      if (!isNaN(last)) next = last + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  // ---- Speichern ----
  async function ticketAnlegen() {
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
    const stunden = SLA_STUNDEN[form.prioritaet] ?? 72;
    const faellig = new Date(Date.now() + stunden * 36e5).toISOString();

    const insertObj = {
      owner_user_id: userData.user.id,
      ticket_nummer: nummer,
      betreff: form.betreff.trim(),
      beschreibung: form.beschreibung.trim() || null,
      status: 'offen',
      prioritaet: form.prioritaet,
      kategorie: form.kategorie,
      kanal: form.kanal,
      kunde_name: form.kunde_name.trim() || null,
      kunde_email: form.kunde_email.trim() || null,
      kunde_telefon: form.kunde_telefon.trim() || null,
      faellig_am: faellig,
    };

    const { error } = await supabase.from('tickets').insert(insertObj);
    setSpeichern(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setModalOffen(false);
    setForm(LEER);
    laden_tickets();
  }

  // ---- Gefilterte Liste ----
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filterStatus !== 'alle' && t.status !== filterStatus) return false;
      if (filterPrio !== 'alle' && t.prioritaet !== filterPrio) return false;
      if (q) {
        const heu = [
          t.ticket_nummer,
          t.betreff,
          t.kunde_name,
          t.kunde_email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!heu.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, suche, filterStatus, filterPrio]);

  // ---- KPIs ----
  const kpi = useMemo(() => {
    const offen = tickets.filter((t) => t.status === 'offen').length;
    const bearbeitung = tickets.filter(
      (t) => t.status === 'in_bearbeitung'
    ).length;
    const ueberfaellig = tickets.filter((t) => {
      if (t.status === 'geloest' || t.status === 'geschlossen') return false;
      if (!t.faellig_am) return false;
      return new Date(t.faellig_am).getTime() < Date.now();
    }).length;
    const geloest = tickets.filter(
      (t) => t.status === 'geloest' || t.status === 'geschlossen'
    ).length;
    return { offen, bearbeitung, ueberfaellig, geloest, gesamt: tickets.length };
  }, [tickets]);

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
    fontSize: '14px',
    boxSizing: 'border-box',
  };
  const labelStil: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
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
            fontSize: '30px',
            fontWeight: 700,
            margin: '0 0 6px 0',
          }}
        >
          🎫 Kundenservice
        </h1>
        <p
          style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: '15px',
            margin: 0,
            maxWidth: '760px',
          }}
        >
          Anfragen, Support-Tickets und Reklamationen an einem Ort — mit Status,
          Priorität und SLA-Ampel. Keine Reklamation rutscht mehr durch.
        </p>
      </div>
      {/* KI-Auge: was heißt die Service-Lage gerade für mich? */}
      <ServiceAuge />

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
          { label: 'Offen', wert: kpi.offen, c: CYAN },
          { label: 'In Bearbeitung', wert: kpi.bearbeitung, c: GOLD },
          { label: 'Überfällig', wert: kpi.ueberfaellig, c: '#ef5350' },
          { label: 'Gelöst', wert: kpi.geloest, c: '#66bb6a' },
        ].map((k) => (
          <div key={k.label} style={karte}>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: k.c,
                lineHeight: 1.1,
              }}
            >
              {k.wert}
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'rgba(255,255,255,0.6)',
                marginTop: '4px',
              }}
            >
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Aktionsleiste: Neu + Suche + Filter ---- */}
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
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + Neues Ticket
        </button>

        <input
          placeholder="🔍 Suche (Nr., Betreff, Kunde) …"
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
          <option value="offen">Offen</option>
          <option value="in_bearbeitung">In Bearbeitung</option>
          <option value="wartet">Wartet</option>
          <option value="geloest">Gelöst</option>
          <option value="geschlossen">Geschlossen</option>
        </select>

        <select
          value={filterPrio}
          onChange={(e) => setFilterPrio(e.target.value)}
          style={{ ...inputStil, width: 'auto' }}
        >
          <option value="alle">Alle Prioritäten</option>
          <option value="dringend">Dringend</option>
          <option value="hoch">Hoch</option>
          <option value="mittel">Mittel</option>
          <option value="niedrig">Niedrig</option>
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
          <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)' }}>
            {tickets.length === 0
              ? 'Noch keine Tickets. Lege das erste über „+ Neues Ticket" an.'
              : 'Keine Tickets für diese Filter.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {gefiltert.map((t) => {
            const ampel = slaAmpel(t);
            return (
              <a
                key={t.id}
                href={`/dashboard/service/${t.id}`}
                style={{
                  ...karte,
                  textDecoration: 'none',
                  display: 'block',
                  transition: 'border-color 0.15s',
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
                          fontSize: '13px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.ticket_nummer || '—'}
                      </span>
                      <span style={statusStil(t.status)}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                      <span style={prioStil(t.prioritaet)}>
                        {PRIO_LABEL[t.prioritaet] || t.prioritaet}
                      </span>
                    </div>
                    <div
                      style={{
                        color: '#fff',
                        fontSize: '15px',
                        fontWeight: 600,
                        marginBottom: '3px',
                      }}
                    >
                      {t.betreff}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.55)',
                        fontSize: '13px',
                      }}
                    >
                      {t.kunde_name || 'Kein Kunde'} ·{' '}
                      {KATEGORIE_LABEL[t.kategorie] || t.kategorie} ·{' '}
                      {KANAL_LABEL[t.kanal] || t.kanal} · erstellt{' '}
                      {datumKurz(t.created_at)}
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                      minWidth: '130px',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: ampel.farbe,
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          background: ampel.farbe,
                          display: 'inline-block',
                        }}
                      />
                      {ampel.text}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: '12px',
                        marginTop: '3px',
                      }}
                    >
                      SLA: {datumKurz(t.faellig_am)}
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
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
              maxWidth: '560px',
            }}
          >
            <h2
              style={{
                color: GOLD,
                fontSize: '20px',
                fontWeight: 700,
                margin: '0 0 18px 0',
              }}
            >
              Neues Ticket
            </h2>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStil}>Betreff *</label>
              <input
                style={inputStil}
                value={form.betreff}
                onChange={(e) =>
                  setForm({ ...form, betreff: e.target.value })
                }
                placeholder="Kurze Zusammenfassung des Anliegens"
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStil}>Beschreibung</label>
              <textarea
                style={{ ...inputStil, minHeight: '90px', resize: 'vertical' }}
                value={form.beschreibung}
                onChange={(e) =>
                  setForm({ ...form, beschreibung: e.target.value })
                }
                placeholder="Details zum Anliegen …"
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <div>
                <label style={labelStil}>Priorität</label>
                <select
                  style={inputStil}
                  value={form.prioritaet}
                  onChange={(e) =>
                    setForm({ ...form, prioritaet: e.target.value })
                  }
                >
                  <option value="niedrig">Niedrig (7 Tage)</option>
                  <option value="mittel">Mittel (3 Tage)</option>
                  <option value="hoch">Hoch (24 Std.)</option>
                  <option value="dringend">Dringend (4 Std.)</option>
                </select>
              </div>
              <div>
                <label style={labelStil}>Kategorie</label>
                <select
                  style={inputStil}
                  value={form.kategorie}
                  onChange={(e) =>
                    setForm({ ...form, kategorie: e.target.value })
                  }
                >
                  <option value="anfrage">Anfrage</option>
                  <option value="support">Support</option>
                  <option value="reklamation">Reklamation</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStil}>Kanal</label>
              <select
                style={inputStil}
                value={form.kanal}
                onChange={(e) => setForm({ ...form, kanal: e.target.value })}
              >
                <option value="email">E-Mail</option>
                <option value="telefon">Telefon</option>
                <option value="web">Web</option>
                <option value="persoenlich">Persönlich</option>
              </select>
            </div>

            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: '14px',
                marginBottom: '14px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '10px',
                  fontWeight: 600,
                }}
              >
                KUNDE (optional)
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStil}>Name</label>
                <input
                  style={inputStil}
                  value={form.kunde_name}
                  onChange={(e) =>
                    setForm({ ...form, kunde_name: e.target.value })
                  }
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                }}
              >
                <div>
                  <label style={labelStil}>E-Mail</label>
                  <input
                    style={inputStil}
                    value={form.kunde_email}
                    onChange={(e) =>
                      setForm({ ...form, kunde_email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={labelStil}>Telefon</label>
                  <input
                    style={inputStil}
                    value={form.kunde_telefon}
                    onChange={(e) =>
                      setForm({ ...form, kunde_telefon: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end',
              }}
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
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: speichern ? 'not-allowed' : 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={ticketAnlegen}
                disabled={speichern}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: GOLD,
                  color: NAVY,
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: speichern ? 'not-allowed' : 'pointer',
                  opacity: speichern ? 0.6 : 1,
                }}
              >
                {speichern ? 'Speichert …' : 'Ticket anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
