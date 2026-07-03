'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · BLOCK 11 · KUNDENSERVICE — T3 Ticket-Detailseite
// Timeline (ticket_verlauf) + Statuswechsel + Notizen + Bearbeiten
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---- Farben ----
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

type Verlauf = {
  id: string;
  ticket_id: string;
  typ: string;
  inhalt: string | null;
  alt_status: string | null;
  neu_status: string | null;
  created_at: string;
};

// ---- SLA-Fristen je Prioritaet (Stunden) ----
const SLA_STUNDEN: Record<string, number> = {
  dringend: 4,
  hoch: 24,
  mittel: 72,
  niedrig: 168,
};

// ---- Labels ----
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

// ---- mögliche Folgestatus je Status ----
const STATUS_REIHENFOLGE = [
  'offen',
  'in_bearbeitung',
  'wartet',
  'geloest',
  'geschlossen',
];

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
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

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
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

function slaAmpel(t: Ticket): { farbe: string; text: string } {
  if (t.status === 'geloest' || t.status === 'geschlossen') {
    return { farbe: 'rgba(255,255,255,0.4)', text: 'erledigt' };
  }
  if (!t.faellig_am) return { farbe: 'rgba(255,255,255,0.4)', text: '—' };
  const diffStd = (new Date(t.faellig_am).getTime() - Date.now()) / 36e5;
  if (diffStd < 0) {
    return { farbe: '#ef5350', text: `überfällig (${Math.abs(Math.round(diffStd))}h)` };
  }
  if (diffStd < 8) {
    return { farbe: '#ffa726', text: `in ${Math.round(diffStd)}h fällig` };
  }
  return { farbe: '#66bb6a', text: `in ${Math.round(diffStd)}h fällig` };
}

function datumZeit(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function datumKurz(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ---- Timeline-Icon je Typ ----
function verlaufIcon(v: Verlauf): string {
  if (v.typ === 'statuswechsel') return '🔄';
  if (v.typ === 'notiz') return '📌';
  return '💬';
}

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = Array.isArray(params.id)
    ? params.id[0]
    : (params.id as string);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [verlauf, setVerlauf] = useState<Verlauf[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [aktion, setAktion] = useState(false);

  // Kommentar/Notiz
  const [neuerText, setNeuerText] = useState('');
  const [neuerTyp, setNeuerTyp] = useState<'kommentar' | 'notiz'>('kommentar');

  // Bearbeiten
  const [bearbeiten, setBearbeiten] = useState(false);
  const [editPrio, setEditPrio] = useState('mittel');
  const [editKategorie, setEditKategorie] = useState('anfrage');

  // Löschen
  const [loeschDialog, setLoeschDialog] = useState(false);

  // KI-Antwortentwurf
  const [kiLaden, setKiLaden] = useState(false);
  const [kiEntwurf, setKiEntwurf] = useState('');
  const [kiOffen, setKiOffen] = useState(false);
  const [kopiert, setKopiert] = useState(false);

  // ---- Laden ----
  const alles_laden = useCallback(async () => {
    if (!ticketId) return;
    setLaden(true);
    setFehler(null);

    const { data: tData, error: tErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (tErr) {
      setFehler(tErr.message);
      setLaden(false);
      return;
    }
    const tk = tData as Ticket;
    setTicket(tk);
    setEditPrio(tk.prioritaet);
    setEditKategorie(tk.kategorie);

    const { data: vData } = await supabase
      .from('ticket_verlauf')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });

    setVerlauf((vData as Verlauf[]) || []);
    setLaden(false);
  }, [ticketId]);

  useEffect(() => {
    alles_laden();
  }, [alles_laden]);

  // ---- Verlauf-Eintrag schreiben ----
  async function verlaufSchreiben(eintrag: {
    typ: string;
    inhalt?: string | null;
    alt_status?: string | null;
    neu_status?: string | null;
  }) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    await supabase.from('ticket_verlauf').insert({
      ticket_id: ticketId,
      owner_user_id: userData.user.id,
      typ: eintrag.typ,
      inhalt: eintrag.inhalt ?? null,
      alt_status: eintrag.alt_status ?? null,
      neu_status: eintrag.neu_status ?? null,
    });
  }

  // ---- Statuswechsel ----
  async function statusSetzen(neu: string) {
    if (!ticket || neu === ticket.status) return;
    setAktion(true);
    setFehler(null);

    const update: Record<string, unknown> = { status: neu };
    if (neu === 'geloest' && !ticket.geloest_am) {
      update.geloest_am = new Date().toISOString();
    }
    if (neu !== 'geloest' && neu !== 'geschlossen') {
      update.geloest_am = null;
    }

    const { error } = await supabase
      .from('tickets')
      .update(update)
      .eq('id', ticket.id);

    if (error) {
      setFehler(error.message);
      setAktion(false);
      return;
    }
    await verlaufSchreiben({
      typ: 'statuswechsel',
      alt_status: ticket.status,
      neu_status: neu,
    });
    setAktion(false);
    alles_laden();
  }

  // ---- Kommentar/Notiz hinzufügen ----
  async function textHinzufuegen() {
    if (!neuerText.trim()) return;
    setAktion(true);
    await verlaufSchreiben({ typ: neuerTyp, inhalt: neuerText.trim() });
    setNeuerText('');
    setAktion(false);
    alles_laden();
  }

  // ---- Bearbeiten speichern (Prio/Kategorie → SLA neu) ----
  async function bearbeitenSpeichern() {
    if (!ticket) return;
    setAktion(true);
    setFehler(null);

    const update: Record<string, unknown> = {
      prioritaet: editPrio,
      kategorie: editKategorie,
    };
    // SLA nur neu berechnen, wenn Ticket noch nicht erledigt
    if (ticket.status !== 'geloest' && ticket.status !== 'geschlossen') {
      const stunden = SLA_STUNDEN[editPrio] ?? 72;
      const basis = new Date(ticket.created_at).getTime();
      update.faellig_am = new Date(basis + stunden * 36e5).toISOString();
    }

    const { error } = await supabase
      .from('tickets')
      .update(update)
      .eq('id', ticket.id);

    if (error) {
      setFehler(error.message);
      setAktion(false);
      return;
    }
    setBearbeiten(false);
    setAktion(false);
    alles_laden();
  }

  // ---- Löschen ----
  async function ticketLoeschen() {
    if (!ticket) return;
    setAktion(true);
    const { error } = await supabase
      .from('tickets')
      .delete()
      .eq('id', ticket.id);
    if (error) {
      setFehler(error.message);
      setAktion(false);
      setLoeschDialog(false);
      return;
    }
    window.location.href = '/dashboard/service';
  }

  // ---- KI-Antwortentwurf erzeugen ----
  async function antwortErzeugen() {
    if (!ticket) return;
    setKiLaden(true);
    setKiOffen(true);
    setKiEntwurf('');
    setFehler(null);
    try {
      const res = await fetch('/api/ticket-antwort', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticket: {
            ticket_nummer: ticket.ticket_nummer,
            betreff: ticket.betreff,
            beschreibung: ticket.beschreibung,
            status: ticket.status,
            prioritaet: ticket.prioritaet,
            kategorie: ticket.kategorie,
            kanal: ticket.kanal,
            kunde_name: ticket.kunde_name,
            verlauf: verlauf,
          },
        }),
      });
      const data = await res.json();
      if (data?.fehler) {
        setFehler(data.fehler);
        setKiOffen(false);
      } else {
        setKiEntwurf(data?.text ?? '');
      }
    } catch {
      setFehler('Verbindungsfehler zur KI. Bitte erneut versuchen.');
      setKiOffen(false);
    }
    setKiLaden(false);
  }

  // ---- Entwurf kopieren ----
  async function entwurfKopieren() {
    try {
      await navigator.clipboard.writeText(kiEntwurf);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      setFehler('Kopieren nicht möglich. Bitte Text manuell markieren.');
    }
  }

  // ---- Styles ----
  const karte: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '18px 20px',
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
  const zeileStil: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize: '14px',
  };

  // ---- Render ----
  if (laden) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 4px' }}>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Lädt …</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 4px' }}>
        <a
          href="/dashboard/service"
          style={{ color: GOLD, textDecoration: 'none', fontSize: '14px' }}
        >
          ← Zurück zum Cockpit
        </a>
        <div style={{ ...karte, marginTop: '16px', color: '#ef5350' }}>
          ⚠️ Ticket nicht gefunden{fehler ? `: ${fehler}` : '.'}
        </div>
      </div>
    );
  }

  const ampel = slaAmpel(ticket);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '8px 4px' }}>
      {/* Zurück */}
      <a
        href="/dashboard/service"
        style={{
          color: GOLD,
          textDecoration: 'none',
          fontSize: '14px',
          display: 'inline-block',
          marginBottom: '16px',
        }}
      >
        ← Zurück zum Cockpit
      </a>

      {/* KOPF */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              color: GOLD,
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'monospace',
            }}
          >
            {ticket.ticket_nummer || '—'}
          </span>
          <span style={statusStil(ticket.status)}>
            {STATUS_LABEL[ticket.status] || ticket.status}
          </span>
          <span style={prioStil(ticket.prioritaet)}>
            {PRIO_LABEL[ticket.prioritaet] || ticket.prioritaet}
          </span>
          <span
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
          </span>
        </div>
        <h1
          style={{
            color: '#fff',
            fontSize: '26px',
            fontWeight: 700,
            margin: 0,
          }}
        >
          {ticket.betreff}
        </h1>
      </div>

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

      {/* STATUSWECHSEL */}
      <div style={{ ...karte, marginBottom: '16px' }}>
        <div style={{ ...labelStil, marginBottom: '10px' }}>STATUS ÄNDERN</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {STATUS_REIHENFOLGE.map((s) => {
            const aktiv = s === ticket.status;
            return (
              <button
                key={s}
                onClick={() => statusSetzen(s)}
                disabled={aktion || aktiv}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: aktiv || aktion ? 'default' : 'pointer',
                  border: aktiv
                    ? `1px solid ${GOLD}`
                    : '1px solid rgba(255,255,255,0.15)',
                  background: aktiv ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)',
                  color: aktiv ? GOLD : 'rgba(255,255,255,0.75)',
                  opacity: aktion && !aktiv ? 0.5 : 1,
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* KI-ANTWORTENTWURF */}
      <div style={{ ...karte, marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <div
              style={{
                color: GOLD,
                fontSize: '15px',
                fontWeight: 700,
                marginBottom: '2px',
              }}
            >
              ✨ Antwort-Entwurf
            </div>
            <div
              style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}
            >
              ARGONAUT formuliert einen Antwortvorschlag an den Kunden —
              editierbar, kein automatischer Versand.
            </div>
          </div>
          <button
            onClick={antwortErzeugen}
            disabled={kiLaden}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              background: GOLD,
              color: NAVY,
              border: 'none',
              fontSize: '14px',
              fontWeight: 700,
              cursor: kiLaden ? 'not-allowed' : 'pointer',
              opacity: kiLaden ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {kiLaden
              ? 'Erstellt Entwurf …'
              : kiEntwurf
              ? '↻ Neu generieren'
              : '✨ Entwurf erstellen'}
          </button>
        </div>

        {kiOffen && (
          <div style={{ marginTop: '14px' }}>
            {kiLaden ? (
              <div
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '14px',
                  padding: '12px 0',
                }}
              >
                ARGONAUT denkt nach und formuliert einen passenden Vorschlag …
              </div>
            ) : (
              <>
                <textarea
                  style={{
                    ...inputStil,
                    minHeight: '220px',
                    resize: 'vertical',
                    lineHeight: 1.5,
                    fontFamily: 'inherit',
                  }}
                  value={kiEntwurf}
                  onChange={(e) => setKiEntwurf(e.target.value)}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '10px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    onClick={entwurfKopieren}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '8px',
                      background: kopiert ? '#66bb6a' : 'rgba(255,255,255,0.08)',
                      color: kopiert ? '#fff' : 'rgba(255,255,255,0.85)',
                      border: '1px solid rgba(255,255,255,0.18)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {kopiert ? '✓ Kopiert' : '📋 In Zwischenablage kopieren'}
                  </button>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    Vor dem Versand prüfen und Platzhalter [in Klammern]
                    ersetzen.
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* GRID: Details + Timeline */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* DETAILS */}
        <div style={karte}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <div style={{ ...labelStil, margin: 0, fontSize: '13px' }}>
              TICKET-DETAILS
            </div>
            <button
              onClick={() => setBearbeiten(!bearbeiten)}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              {bearbeiten ? 'Abbrechen' : '✏️ Bearbeiten'}
            </button>
          </div>

          {bearbeiten ? (
            <div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStil}>Priorität</label>
                <select
                  style={inputStil}
                  value={editPrio}
                  onChange={(e) => setEditPrio(e.target.value)}
                >
                  <option value="niedrig">Niedrig (7 Tage)</option>
                  <option value="mittel">Mittel (3 Tage)</option>
                  <option value="hoch">Hoch (24 Std.)</option>
                  <option value="dringend">Dringend (4 Std.)</option>
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStil}>Kategorie</label>
                <select
                  style={inputStil}
                  value={editKategorie}
                  onChange={(e) => setEditKategorie(e.target.value)}
                >
                  <option value="anfrage">Anfrage</option>
                  <option value="support">Support</option>
                  <option value="reklamation">Reklamation</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
              </div>
              <button
                onClick={bearbeitenSpeichern}
                disabled={aktion}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  background: GOLD,
                  color: NAVY,
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: aktion ? 'not-allowed' : 'pointer',
                  opacity: aktion ? 0.6 : 1,
                }}
              >
                {aktion ? 'Speichert …' : 'Speichern'}
              </button>
              <div
                style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: '8px',
                }}
              >
                Hinweis: Bei offenem Ticket wird die SLA-Frist neu berechnet.
              </div>
            </div>
          ) : (
            <div>
              <div style={zeileStil}>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>Kunde</span>
                <span style={{ color: '#fff' }}>
                  {ticket.kunde_name || '—'}
                </span>
              </div>
              <div style={zeileStil}>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>E-Mail</span>
                <span>
                  {ticket.kunde_email ? (
                    <a
                      href={`mailto:${ticket.kunde_email}`}
                      style={{ color: CYAN, textDecoration: 'none' }}
                    >
                      {ticket.kunde_email}
                    </a>
                  ) : (
                    <span style={{ color: '#fff' }}>—</span>
                  )}
                </span>
              </div>
              <div style={zeileStil}>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>Telefon</span>
                <span>
                  {ticket.kunde_telefon ? (
                    <a
                      href={`tel:${ticket.kunde_telefon}`}
                      style={{ color: CYAN, textDecoration: 'none' }}
                    >
                      {ticket.kunde_telefon}
                    </a>
                  ) : (
                    <span style={{ color: '#fff' }}>—</span>
                  )}
                </span>
              </div>
              <div style={zeileStil}>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>Kategorie</span>
                <span style={{ color: '#fff' }}>
                  {KATEGORIE_LABEL[ticket.kategorie] || ticket.kategorie}
                </span>
              </div>
              <div style={zeileStil}>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>Kanal</span>
                <span style={{ color: '#fff' }}>
                  {KANAL_LABEL[ticket.kanal] || ticket.kanal}
                </span>
              </div>
              <div style={zeileStil}>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>Erstellt</span>
                <span style={{ color: '#fff' }}>
                  {datumKurz(ticket.created_at)}
                </span>
              </div>
              <div style={zeileStil}>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>SLA-Frist</span>
                <span style={{ color: '#fff' }}>
                  {datumZeit(ticket.faellig_am)}
                </span>
              </div>
              {ticket.geloest_am && (
                <div style={zeileStil}>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>Gelöst am</span>
                  <span style={{ color: '#66bb6a' }}>
                    {datumZeit(ticket.geloest_am)}
                  </span>
                </div>
              )}
              {ticket.beschreibung && (
                <div style={{ marginTop: '12px' }}>
                  <div style={labelStil}>Beschreibung</div>
                  <div
                    style={{
                      color: 'rgba(255,255,255,0.85)',
                      fontSize: '14px',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {ticket.beschreibung}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* TIMELINE */}
        <div style={karte}>
          <div style={{ ...labelStil, marginBottom: '12px', fontSize: '13px' }}>
            VERLAUF
          </div>

          {/* Eingabe */}
          <div style={{ marginBottom: '16px' }}>
            <textarea
              style={{ ...inputStil, minHeight: '70px', resize: 'vertical' }}
              value={neuerText}
              onChange={(e) => setNeuerText(e.target.value)}
              placeholder="Kommentar oder Notiz …"
            />
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginTop: '8px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <select
                style={{ ...inputStil, width: 'auto' }}
                value={neuerTyp}
                onChange={(e) =>
                  setNeuerTyp(e.target.value as 'kommentar' | 'notiz')
                }
              >
                <option value="kommentar">💬 Kommentar</option>
                <option value="notiz">📌 Notiz</option>
              </select>
              <button
                onClick={textHinzufuegen}
                disabled={aktion || !neuerText.trim()}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  background: GOLD,
                  color: NAVY,
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor:
                    aktion || !neuerText.trim() ? 'not-allowed' : 'pointer',
                  opacity: aktion || !neuerText.trim() ? 0.6 : 1,
                }}
              >
                Hinzufügen
              </button>
            </div>
          </div>

          {/* Liste */}
          {verlauf.length === 0 ? (
            <div
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: '14px',
                padding: '8px 0',
              }}
            >
              Noch kein Verlauf. Statuswechsel und Notizen erscheinen hier.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {verlauf.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    padding: '10px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: '16px', lineHeight: 1.4 }}>
                    {verlaufIcon(v)}
                  </div>
                  <div style={{ flex: 1 }}>
                    {v.typ === 'statuswechsel' ? (
                      <div style={{ fontSize: '14px', color: '#fff' }}>
                        Status:{' '}
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {STATUS_LABEL[v.alt_status || ''] || v.alt_status}
                        </span>{' '}
                        →{' '}
                        <span style={{ color: GOLD, fontWeight: 600 }}>
                          {STATUS_LABEL[v.neu_status || ''] || v.neu_status}
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: '14px',
                          color: '#fff',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {v.typ === 'notiz' && (
                          <span
                            style={{
                              color: GOLD,
                              fontSize: '11px',
                              fontWeight: 700,
                              marginRight: '6px',
                            }}
                          >
                            NOTIZ
                          </span>
                        )}
                        {v.inhalt}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.4)',
                        marginTop: '3px',
                      }}
                    >
                      {datumZeit(v.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* GEFAHRENZONE: Löschen */}
      <div
        style={{
          marginTop: '20px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={() => setLoeschDialog(true)}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            background: 'transparent',
            color: '#ef5350',
            border: '1px solid #ef535055',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🗑 Ticket löschen
        </button>
      </div>

      {/* LÖSCH-DIALOG */}
      {loeschDialog && (
        <div
          onClick={() => !aktion && setLoeschDialog(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: NAVY,
              border: '1px solid #ef535055',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
            }}
          >
            <h2
              style={{
                color: '#ef5350',
                fontSize: '18px',
                fontWeight: 700,
                margin: '0 0 12px 0',
              }}
            >
              Ticket wirklich löschen?
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: '14px',
                margin: '0 0 20px 0',
                lineHeight: 1.5,
              }}
            >
              {ticket.ticket_nummer} „{ticket.betreff}" und der gesamte Verlauf
              werden unwiderruflich gelöscht.
            </p>
            <div
              style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}
            >
              <button
                onClick={() => setLoeschDialog(false)}
                disabled={aktion}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: aktion ? 'not-allowed' : 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={ticketLoeschen}
                disabled={aktion}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: '#ef5350',
                  color: '#fff',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: aktion ? 'not-allowed' : 'pointer',
                  opacity: aktion ? 0.6 : 1,
                }}
              >
                {aktion ? 'Löscht …' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
