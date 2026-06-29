'use client';

// ============================================================
// ARGONAUT OS · WELLE 1 · Modul 1: HR/Personal (Phase 1)
// Dashboard-Seite: Personal- + Bewerberliste mit "Neu anlegen"
// Inline-Styles · Brand: Navy #0A1628 / Gold #C9A84C / Cyan #00e5ff
// Pfad-Empfehlung im Repo: app/dashboard/personal/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// --- Supabase Browser-Client (Cookie-Session, wie der Rest der App) ---
// Nutzt @supabase/ssr, damit die eingeloggte Session (Cookies) erkannt wird.
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

// --- Marken-Tokens ------------------------------------------
const C = {
  navy: '#0A1628',
  navySoft: '#0F2036',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  text: '#E8EDF4',
  textDim: '#8FA3BE',
  line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)',
  inputBg: 'rgba(255,255,255,0.05)',
  danger: '#E06666',
  green: '#4CAF7D',
};

// --- Typen --------------------------------------------------
type Mitarbeiter = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  position: string | null;
  status: string;
  eintrittsdatum: string | null;
};

type Bewerber = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  position: string | null;
  quelle: string | null;
  status: string;
  bewerbungsdatum: string | null;
};

type Tab = 'mitarbeiter' | 'bewerber';

// Status-Optionen
const MA_STATUS = ['aktiv', 'inaktiv', 'beurlaubt'];
const BW_STATUS = ['neu', 'in_pruefung', 'eingeladen', 'abgesagt', 'eingestellt'];

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv',
  inaktiv: 'Inaktiv',
  beurlaubt: 'Beurlaubt',
  neu: 'Neu',
  in_pruefung: 'In Prüfung',
  eingeladen: 'Eingeladen',
  abgesagt: 'Abgesagt',
  eingestellt: 'Eingestellt',
};

function statusColor(status: string): string {
  if (status === 'aktiv' || status === 'eingestellt') return C.green;
  if (status === 'abgesagt' || status === 'inaktiv') return C.danger;
  if (status === 'neu') return C.cyan;
  return C.gold; // in_pruefung, eingeladen, beurlaubt
}

// ============================================================
// Hauptkomponente
// ============================================================
export default function PersonalPage() {
  const [tab, setTab] = useState<Tab>('mitarbeiter');
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [bewerber, setBewerber] = useState<Bewerber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // --- Daten laden ------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'mitarbeiter') {
        const { data, error } = await supabase
          .from('mitarbeiter')
          .select('id,vorname,nachname,email,telefon,position,status,eintrittsdatum')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setMitarbeiter((data as Mitarbeiter[]) ?? []);
      } else {
        const { data, error } = await supabase
          .from('bewerber')
          .select('id,vorname,nachname,email,telefon,position,quelle,status,bewerbungsdatum')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setBewerber((data as Bewerber[]) ?? []);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      setError('Daten konnten nicht geladen werden: ' + msg);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const count = tab === 'mitarbeiter' ? mitarbeiter.length : bewerber.length;

  return (
    <div style={styles.page}>
      {/* Kopf */}
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>ARGONAUT OS · HR</div>
          <h1 style={styles.h1}>Personal</h1>
          <p style={styles.sub}>Mitarbeitende und Bewerbungen an einem Ort.</p>
        </div>
        <button
          style={styles.primaryBtn}
          onClick={() => setModalOpen(true)}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          + {tab === 'mitarbeiter' ? 'Mitarbeiter anlegen' : 'Bewerber anlegen'}
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <TabButton active={tab === 'mitarbeiter'} onClick={() => setTab('mitarbeiter')}>
          Mitarbeiter
        </TabButton>
        <TabButton active={tab === 'bewerber'} onClick={() => setTab('bewerber')}>
          Bewerber
        </TabButton>
        <div style={styles.countPill}>{count}</div>
      </div>

      {/* Inhalt */}
      <div style={styles.card}>
        {loading && <div style={styles.stateBox}>Lädt …</div>}

        {!loading && error && (
          <div style={{ ...styles.stateBox, color: C.danger }}>
            {error}
            <div>
              <button style={styles.ghostBtn} onClick={load}>
                Erneut versuchen
              </button>
            </div>
          </div>
        )}

        {!loading && !error && tab === 'mitarbeiter' && (
          <MitarbeiterTabelle rows={mitarbeiter} onAdd={() => setModalOpen(true)} />
        )}

        {!loading && !error && tab === 'bewerber' && (
          <BewerberTabelle rows={bewerber} onAdd={() => setModalOpen(true)} />
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <NeuModal
          tab={tab}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Tab-Button
// ============================================================
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tabBtn,
        color: active ? C.navy : C.textDim,
        background: active ? C.gold : 'transparent',
        borderColor: active ? C.gold : C.line,
      }}
    >
      {children}
    </button>
  );
}

// ============================================================
// Tabelle: Mitarbeiter
// ============================================================
function MitarbeiterTabelle({ rows, onAdd }: { rows: Mitarbeiter[]; onAdd: () => void }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Noch keine Mitarbeitenden"
        text="Leg die erste Person an — Name genügt, der Rest später."
        onAdd={onAdd}
        addLabel="Mitarbeiter anlegen"
      />
    );
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Position</Th>
          <Th>Kontakt</Th>
          <Th>Eintritt</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id} style={styles.tr}>
            <Td>
              <span style={styles.name}>
                {m.vorname} {m.nachname}
              </span>
            </Td>
            <Td>{m.position || <Dim>—</Dim>}</Td>
            <Td>
              <KontaktZelle email={m.email} telefon={m.telefon} />
            </Td>
            <Td>{formatDate(m.eintrittsdatum)}</Td>
            <Td>
              <StatusBadge status={m.status} />
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================
// Tabelle: Bewerber
// ============================================================
function BewerberTabelle({ rows, onAdd }: { rows: Bewerber[]; onAdd: () => void }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Noch keine Bewerbungen"
        text="Trag die erste Bewerbung ein, um die Pipeline zu starten."
        onAdd={onAdd}
        addLabel="Bewerber anlegen"
      />
    );
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Beworben als</Th>
          <Th>Kontakt</Th>
          <Th>Quelle</Th>
          <Th>Eingegangen</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.id} style={styles.tr}>
            <Td>
              <span style={styles.name}>
                {b.vorname} {b.nachname}
              </span>
            </Td>
            <Td>{b.position || <Dim>—</Dim>}</Td>
            <Td>
              <KontaktZelle email={b.email} telefon={b.telefon} />
            </Td>
            <Td>{b.quelle || <Dim>—</Dim>}</Td>
            <Td>{formatDate(b.bewerbungsdatum)}</Td>
            <Td>
              <StatusBadge status={b.status} />
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================
// Modal: Neu anlegen (Mitarbeiter ODER Bewerber)
// ============================================================
function NeuModal({
  tab,
  onClose,
  onSaved,
}: {
  tab: Tab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const istMA = tab === 'mitarbeiter';

  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [position, setPosition] = useState('');
  const [quelle, setQuelle] = useState('');
  const [status, setStatus] = useState(istMA ? 'aktiv' : 'neu');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function speichern() {
    setErr(null);
    if (!vorname.trim() || !nachname.trim()) {
      setErr('Vor- und Nachname sind Pflicht.');
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) {
        setErr('Keine aktive Sitzung gefunden. Bitte neu einloggen.');
        setSaving(false);
        return;
      }

      if (istMA) {
        const { error } = await supabase.from('mitarbeiter').insert({
          owner_user_id: ownerId,
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          email: email.trim() || null,
          telefon: telefon.trim() || null,
          position: position.trim() || null,
          status,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bewerber').insert({
          owner_user_id: ownerId,
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          email: email.trim() || null,
          telefon: telefon.trim() || null,
          position: position.trim() || null,
          quelle: quelle.trim() || null,
          status,
        });
        if (error) throw error;
      }
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      setErr('Speichern fehlgeschlagen: ' + msg);
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>
            {istMA ? 'Neuer Mitarbeiter' : 'Neuer Bewerber'}
          </h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div style={styles.formGrid}>
          <Field label="Vorname *">
            <input style={styles.input} value={vorname} onChange={(e) => setVorname(e.target.value)} />
          </Field>
          <Field label="Nachname *">
            <input style={styles.input} value={nachname} onChange={(e) => setNachname(e.target.value)} />
          </Field>
          <Field label="E-Mail">
            <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Telefon">
            <input style={styles.input} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
          </Field>
          <Field label={istMA ? 'Position' : 'Beworben als'}>
            <input style={styles.input} value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
          {!istMA && (
            <Field label="Quelle">
              <input
                style={styles.input}
                placeholder="z. B. Website, Empfehlung"
                value={quelle}
                onChange={(e) => setQuelle(e.target.value)}
              />
            </Field>
          )}
          <Field label="Status">
            <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {(istMA ? MA_STATUS : BW_STATUS).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {err && <div style={styles.formError}>{err}</div>}

        <div style={styles.modalFoot}>
          <button style={styles.ghostBtn} onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button
            style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }}
            onClick={speichern}
            disabled={saving}
          >
            {saving ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Kleine Bausteine
// ============================================================
function StatusBadge({ status }: { status: string }) {
  const col = statusColor(status);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: col,
        background: `${col}1A`,
        border: `1px solid ${col}40`,
      }}
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function KontaktZelle({ email, telefon }: { email: string | null; telefon: string | null }) {
  if (!email && !telefon) return <Dim>—</Dim>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {email && (
        <a href={`mailto:${email}`} style={styles.link}>
          {email}
        </a>
      )}
      {telefon && (
        <a href={`tel:${telefon}`} style={styles.link}>
          {telefon}
        </a>
      )}
    </div>
  );
}

function EmptyState({
  title,
  text,
  onAdd,
  addLabel,
}: {
  title: string;
  text: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div style={styles.empty}>
      <div style={styles.emptyTitle}>{title}</div>
      <div style={styles.emptyText}>{text}</div>
      <button style={styles.primaryBtn} onClick={onAdd}>
        + {addLabel}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={styles.th}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={styles.td}>{children}</td>;
}
function Dim({ children }: { children: React.ReactNode }) {
  return <span style={{ color: C.textDim }}>{children}</span>;
}

function formatDate(d: string | null): React.ReactNode {
  if (!d) return <Dim>—</Dim>;
  try {
    return new Date(d).toLocaleDateString('de-DE');
  } catch {
    return d;
  }
}

// ============================================================
// Styles
// ============================================================
const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: C.navy,
    color: C.text,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    padding: '32px 28px 64px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.gold,
    fontWeight: 600,
    marginBottom: 6,
  },
  h1: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 34,
    fontWeight: 700,
    margin: 0,
    color: C.text,
  },
  sub: { color: C.textDim, margin: '6px 0 0', fontSize: 15 },
  primaryBtn: {
    background: C.gold,
    color: C.navy,
    border: 'none',
    borderRadius: 10,
    padding: '11px 18px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'opacity .15s ease',
  },
  ghostBtn: {
    background: 'transparent',
    color: C.text,
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    padding: '11px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  tabs: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 },
  tabBtn: {
    border: '1px solid',
    borderRadius: 999,
    padding: '8px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'all .15s ease',
  },
  countPill: {
    marginLeft: 4,
    fontSize: 13,
    color: C.textDim,
    background: C.cardBg,
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    padding: '4px 12px',
    fontWeight: 600,
  },
  card: {
    background: C.navySoft,
    border: `1px solid ${C.line}`,
    borderRadius: 16,
    overflow: 'hidden',
  },
  stateBox: { padding: 40, textAlign: 'center', color: C.textDim, fontSize: 15 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left',
    padding: '14px 18px',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.textDim,
    fontWeight: 600,
    borderBottom: `1px solid ${C.line}`,
  },
  tr: { borderBottom: `1px solid rgba(255,255,255,0.04)` },
  td: { padding: '14px 18px', color: C.text, verticalAlign: 'top' },
  name: { fontWeight: 600, color: C.text },
  link: { color: C.cyan, textDecoration: 'none', fontSize: 13 },
  empty: {
    padding: '56px 24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.text },
  emptyText: { color: C.textDim, fontSize: 15, marginBottom: 10 },

  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5,10,20,0.66)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 1000,
  },
  modal: {
    width: '100%',
    maxWidth: 540,
    background: C.navySoft,
    border: `1px solid ${C.line}`,
    borderRadius: 18,
    padding: 24,
    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, margin: 0, color: C.text },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: C.textDim,
    fontSize: 26,
    lineHeight: 1,
    cursor: 'pointer',
  },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 12, color: C.textDim, fontWeight: 600, letterSpacing: 0.4 },
  input: {
    background: C.inputBg,
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    padding: '10px 12px',
    color: C.text,
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  formError: {
    marginTop: 14,
    color: C.danger,
    fontSize: 13,
    background: 'rgba(224,102,102,0.1)',
    border: `1px solid rgba(224,102,102,0.3)`,
    borderRadius: 10,
    padding: '10px 12px',
  },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
};
