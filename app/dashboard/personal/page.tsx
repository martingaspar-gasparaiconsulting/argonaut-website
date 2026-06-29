'use client';

// ============================================================
// ARGONAUT OS · Modul 1: HR/Personal — Vorzeige-Tiefe
// Liste + Anlegen · Personalakte-Cockpit (Detail-Drawer):
// Stammdaten · Dokumente(Kategorie) · Abwesenheiten · Schulungen · Auswertung
// Inline-Styles · Navy #0A1628 / Gold #C9A84C / Cyan #00e5ff
// Pfad: app/dashboard/personal/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties, ChangeEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const BUCKET = 'hr-dokumente';

const C = {
  navy: '#0A1628', navySoft: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)', inputBg: 'rgba(255,255,255,0.05)', danger: '#E06666', warn: '#E0A24C',
};

// --- Typen --------------------------------------------------
type Mitarbeiter = {
  id: string; vorname: string; nachname: string; email: string | null; telefon: string | null;
  position: string | null; status: string; eintrittsdatum: string | null;
  geburtsdatum: string | null; adresse: string | null; sv_nummer: string | null;
  steuer_id: string | null; iban: string | null; notfall_kontakt: string | null;
  urlaubsanspruch_tage: number | null; auth_user_id: string | null;
};
type Bewerber = {
  id: string; vorname: string; nachname: string; email: string | null; telefon: string | null;
  position: string | null; quelle: string | null; status: string; bewerbungsdatum: string | null; mitarbeiter_id: string | null;
};
type HrDokument = { id: string; dateiname: string; storage_pfad: string; groesse_bytes: number | null; mime_type: string | null; kategorie: string; hochgeladen_am: string };
type Abwesenheit = { id: string; typ: string; von: string; bis: string; tage: number | null; status: string; au_vorhanden: boolean; notiz: string | null };
type Schulung = { id: string; titel: string; kategorie: string; absolviert_am: string | null; gueltig_bis: string | null; status: string; notiz: string | null };
type Checkliste = { id: string; art: string; aufgabe: string; erledigt: boolean; erledigt_am: string | null; notiz: string | null; reihenfolge: number };

type Tab = 'mitarbeiter' | 'bewerber';
type Selected = { typ: Tab; id: string } | null;
type Benachrichtigung = { id: string; typ: string; titel: string; text: string | null; gelesen: boolean; created_at: string };

const MA_STATUS = ['aktiv', 'inaktiv', 'beurlaubt'];
const BW_STATUS = ['neu', 'in_pruefung', 'eingeladen', 'abgesagt', 'eingestellt'];
const DOK_KATEGORIEN = ['vertrag', 'bewerbung', 'lohn', 'zeugnis', 'zertifikat', 'sonstiges'];
const SCHUL_KATEGORIEN = ['arbeitsschutz', 'mutterschutz', 'brandschutz', 'datenschutz', 'erste_hilfe', 'sonstiges'];

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv', inaktiv: 'Inaktiv', beurlaubt: 'Beurlaubt',
  neu: 'Neu', in_pruefung: 'In Prüfung', eingeladen: 'Eingeladen', abgesagt: 'Abgesagt', eingestellt: 'Eingestellt',
  beantragt: 'Beantragt', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt', erfasst: 'Erfasst',
  offen: 'Offen', absolviert: 'Absolviert',
};
const KAT_LABEL: Record<string, string> = {
  vertrag: 'Vertrag', bewerbung: 'Bewerbung', lohn: 'Lohn/Gehalt', zeugnis: 'Zeugnis', zertifikat: 'Zertifikat', sonstiges: 'Sonstiges',
  arbeitsschutz: 'Arbeitsschutz', mutterschutz: 'Mutterschutz', brandschutz: 'Brandschutz', datenschutz: 'Datenschutz', erste_hilfe: 'Erste Hilfe',
};

function statusColor(s: string): string {
  if (s === 'aktiv' || s === 'eingestellt' || s === 'genehmigt' || s === 'absolviert') return C.green;
  if (s === 'abgesagt' || s === 'inaktiv' || s === 'abgelehnt') return C.danger;
  if (s === 'neu') return C.cyan;
  return C.gold;
}
function formatDate(d: string | null): React.ReactNode {
  if (!d) return <Dim>—</Dim>;
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
}
function dStr(d: string | null): string { if (!d) return ''; try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; } }
function formatBytes(b: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
// ---- Arbeitstage & Feiertage (DE, pro Bundesland) — wartungsfrei berechnet ----
// Feiertage werden für jedes Jahr automatisch berechnet (Oster-Algorithmus +
// feste/bewegliche Feiertage je Bundesland). Keine jährliche Pflege nötig.
function osterSonntag(jahr: number): Date {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tg = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tg);
}
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseLocal(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function feiertageSet(jahr: number, bl: string): Set<string> {
  const s = new Set<string>();
  const add = (d: Date) => s.add(ymdLocal(d));
  const fix = (m: number, t: number) => new Date(jahr, m - 1, t);
  const ostern = osterSonntag(jahr);
  const off = (n: number) => { const d = new Date(ostern); d.setDate(d.getDate() + n); return d; };
  add(fix(1, 1)); add(off(-2)); add(off(1)); add(fix(5, 1)); add(off(39)); add(off(50));
  add(fix(10, 3)); add(fix(12, 25)); add(fix(12, 26));
  if (['BW', 'BY', 'ST'].includes(bl)) add(fix(1, 6));
  if (['BE', 'MV'].includes(bl)) add(fix(3, 8));
  if (['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(bl)) add(off(60));
  if (['SL'].includes(bl)) add(fix(8, 15));
  if (['TH'].includes(bl)) add(fix(9, 20));
  if (['BB', 'MV', 'SN', 'ST', 'TH', 'HB', 'HH', 'NI', 'SH'].includes(bl)) add(fix(10, 31));
  if (['BW', 'BY', 'NW', 'RP', 'SL'].includes(bl)) add(fix(11, 1));
  if (['SN'].includes(bl)) { const d = fix(11, 23); let back = ((d.getDay() - 3 + 7) % 7); if (back === 0) back = 7; d.setDate(23 - back); add(d); }
  return s;
}
function kalendertage(von: string, bis: string): number {
  try { const a = parseLocal(von), b = parseLocal(bis); const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1; return diff > 0 ? diff : 1; } catch { return 1; }
}
function arbeitstage(von: string, bis: string, bl: string): number {
  try {
    const a = parseLocal(von), b = parseLocal(bis);
    if (b < a) return 1;
    const fset = new Set<string>();
    [a.getFullYear(), b.getFullYear()].forEach((j) => feiertageSet(j, bl).forEach((x) => fset.add(x)));
    let count = 0; const d = new Date(a);
    while (d <= b) { const wd = d.getDay(); if (wd !== 0 && wd !== 6 && !fset.has(ymdLocal(d))) count++; d.setDate(d.getDate() + 1); }
    return count;
  } catch { return 1; }
}
// Dauer je nach Typ: Urlaub = Arbeitstage (ohne WE/Feiertage), Krankheit = Kalendertage
function dauerTage(typ: string, von: string, bis: string, bl: string): number {
  return typ === 'urlaub' ? arbeitstage(von, bis, bl) : kalendertage(von, bis);
}
function tageBis(d: string | null): number | null {
  if (!d) return null;
  try { return Math.round((new Date(d).getTime() - Date.now()) / 86400000); } catch { return null; }
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
  const [selected, setSelected] = useState<Selected>(null);

  // Benachrichtigungen (Glocke)
  const [benach, setBenach] = useState<Benachrichtigung[]>([]);
  const [glockeOffen, setGlockeOffen] = useState(false);

  // Bundesland (für Feiertags-/Arbeitstage-Berechnung) — Einstellung des Betriebs
  const [bundesland, setBundesland] = useState('BW');
  const [blSaving, setBlSaving] = useState(false);

  const ladeBundesland = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;
    const { data } = await supabase.from('hr_einstellungen').select('bundesland').eq('owner_user_id', uid).maybeSingle();
    if (data?.bundesland) setBundesland(data.bundesland);
  }, []);
  useEffect(() => { ladeBundesland(); }, [ladeBundesland]);

  async function bundeslandSpeichern(neu: string) {
    setBundesland(neu); setBlSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return;
      await supabase.from('hr_einstellungen').upsert({ owner_user_id: uid, bundesland: neu }, { onConflict: 'owner_user_id' });
    } finally { setBlSaving(false); }
  }

  const ladeBenach = useCallback(async () => {
    const { data } = await supabase.from('hr_benachrichtigungen')
      .select('id,typ,titel,text,gelesen,created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    setBenach((data as Benachrichtigung[]) ?? []);
  }, []);

  useEffect(() => { ladeBenach(); }, [ladeBenach]);

  async function alsGelesen(id: string) {
    await supabase.from('hr_benachrichtigungen').update({ gelesen: true }).eq('id', id);
    setBenach((prev) => prev.map((b) => (b.id === id ? { ...b, gelesen: true } : b)));
  }
  async function alleGelesen() {
    const offene = benach.filter((b) => !b.gelesen).map((b) => b.id);
    if (offene.length === 0) return;
    await supabase.from('hr_benachrichtigungen').update({ gelesen: true }).in('id', offene);
    setBenach((prev) => prev.map((b) => ({ ...b, gelesen: true })));
  }
  const ungelesen = benach.filter((b) => !b.gelesen).length;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (tab === 'mitarbeiter') {
        const { data, error } = await supabase.from('mitarbeiter')
          .select('id,vorname,nachname,email,telefon,position,status,eintrittsdatum,geburtsdatum,adresse,sv_nummer,steuer_id,iban,notfall_kontakt,urlaubsanspruch_tage,auth_user_id')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setMitarbeiter((data as Mitarbeiter[]) ?? []);
      } else {
        const { data, error } = await supabase.from('bewerber')
          .select('id,vorname,nachname,email,telefon,position,quelle,status,bewerbungsdatum,mitarbeiter_id')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setBewerber((data as Bewerber[]) ?? []);
      }
    } catch (e: unknown) {
      setError('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const count = tab === 'mitarbeiter' ? mitarbeiter.length : bewerber.length;
  const selectedMA = selected?.typ === 'mitarbeiter' ? mitarbeiter.find((m) => m.id === selected.id) ?? null : null;
  const selectedBW = selected?.typ === 'bewerber' ? bewerber.find((b) => b.id === selected.id) ?? null : null;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>ARGONAUT OS · HR</div>
          <h1 style={styles.h1}>Personal</h1>
          <p style={styles.sub}>Mitarbeitende und Bewerbungen an einem Ort.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <select
            value={bundesland}
            onChange={(e) => bundeslandSpeichern(e.target.value)}
            style={styles.blSelect}
            title="Bundesland (für Feiertage / Urlaubsberechnung)"
            disabled={blSaving}
          >
            <option value="BW">Baden-Württemberg</option>
            <option value="BY">Bayern</option>
            <option value="BE">Berlin</option>
            <option value="BB">Brandenburg</option>
            <option value="HB">Bremen</option>
            <option value="HH">Hamburg</option>
            <option value="HE">Hessen</option>
            <option value="MV">Mecklenburg-Vorpommern</option>
            <option value="NI">Niedersachsen</option>
            <option value="NW">Nordrhein-Westfalen</option>
            <option value="RP">Rheinland-Pfalz</option>
            <option value="SL">Saarland</option>
            <option value="SN">Sachsen</option>
            <option value="ST">Sachsen-Anhalt</option>
            <option value="SH">Schleswig-Holstein</option>
            <option value="TH">Thüringen</option>
          </select>
          <a href="/dashboard/team-kalender" style={styles.kalenderLink}>📅 Team-Kalender</a>
          <div style={{ position: 'relative' }}>
            <button
              style={styles.glockeBtn}
              onClick={() => setGlockeOffen((o) => !o)}
              title="Benachrichtigungen"
            >
              🔔
              {ungelesen > 0 && <span style={styles.glockeBadge}>{ungelesen}</span>}
            </button>
            {glockeOffen && (
              <div style={styles.glockePanel}>
                <div style={styles.glockeHead}>
                  <span style={{ fontWeight: 700, color: C.text }}>Benachrichtigungen</span>
                  {ungelesen > 0 && <button style={styles.glockeMarkAll} onClick={alleGelesen}>Alle gelesen</button>}
                </div>
                {benach.length === 0 && <div style={styles.glockeEmpty}>Keine Benachrichtigungen.</div>}
                {benach.map((b) => (
                  <div key={b.id} style={{ ...styles.glockeItem, opacity: b.gelesen ? 0.5 : 1 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{b.titel}</div>
                      {b.text && <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>{b.text}</div>}
                      <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{new Date(b.created_at).toLocaleString('de-DE')}</div>
                    </div>
                    {!b.gelesen && <button style={styles.glockeDot} onClick={() => alsGelesen(b.id)} title="Als gelesen markieren" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button style={styles.primaryBtn} onClick={() => setModalOpen(true)}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}>
            + {tab === 'mitarbeiter' ? 'Mitarbeiter anlegen' : 'Bewerber anlegen'}
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        <TabButton active={tab === 'mitarbeiter'} onClick={() => setTab('mitarbeiter')}>Mitarbeiter</TabButton>
        <TabButton active={tab === 'bewerber'} onClick={() => setTab('bewerber')}>Bewerber</TabButton>
        <div style={styles.countPill}>{count}</div>
      </div>

      <div style={styles.card}>
        {loading && <div style={styles.stateBox}>Lädt …</div>}
        {!loading && error && (
          <div style={{ ...styles.stateBox, color: C.danger }}>{error}
            <div><button style={styles.ghostBtn} onClick={load}>Erneut versuchen</button></div>
          </div>
        )}
        {!loading && !error && tab === 'mitarbeiter' && (
          <MitarbeiterTabelle rows={mitarbeiter} onAdd={() => setModalOpen(true)} onSelect={(id) => setSelected({ typ: 'mitarbeiter', id })} />
        )}
        {!loading && !error && tab === 'bewerber' && (
          <BewerberTabelle rows={bewerber} onAdd={() => setModalOpen(true)} onSelect={(id) => setSelected({ typ: 'bewerber', id })} />
        )}
      </div>

      {modalOpen && <NeuModal tab={tab} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />}
      {selectedMA && <DetailDrawer typ="mitarbeiter" ma={selectedMA} bundesland={bundesland} onClose={() => setSelected(null)} onChanged={load} />}
      {selectedBW && <DetailDrawer typ="bewerber" bw={selectedBW} bundesland={bundesland} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ ...styles.tabBtn, color: active ? C.navy : C.textDim, background: active ? C.gold : 'transparent', borderColor: active ? C.gold : C.line }}>
      {children}
    </button>
  );
}

// ============================================================
// Tabellen
// ============================================================
function MitarbeiterTabelle({ rows, onAdd, onSelect }: { rows: Mitarbeiter[]; onAdd: () => void; onSelect: (id: string) => void }) {
  if (rows.length === 0) return <EmptyState title="Noch keine Mitarbeitenden" text="Leg die erste Person an — Name genügt, der Rest später." onAdd={onAdd} addLabel="Mitarbeiter anlegen" />;
  return (
    <table style={styles.table}>
      <thead><tr><Th>Name</Th><Th>Position</Th><Th>Kontakt</Th><Th>Eintritt</Th><Th>Status</Th></tr></thead>
      <tbody>{rows.map((m) => (
        <ClickRow key={m.id} onClick={() => onSelect(m.id)}>
          <Td><span style={styles.name}>{m.vorname} {m.nachname}</span></Td>
          <Td>{m.position || <Dim>—</Dim>}</Td>
          <Td><KontaktZelle email={m.email} telefon={m.telefon} /></Td>
          <Td>{formatDate(m.eintrittsdatum)}</Td>
          <Td><StatusBadge status={m.status} /></Td>
        </ClickRow>
      ))}</tbody>
    </table>
  );
}
function BewerberTabelle({ rows, onAdd, onSelect }: { rows: Bewerber[]; onAdd: () => void; onSelect: (id: string) => void }) {
  if (rows.length === 0) return <EmptyState title="Noch keine Bewerbungen" text="Trag die erste Bewerbung ein, um die Pipeline zu starten." onAdd={onAdd} addLabel="Bewerber anlegen" />;
  return (
    <table style={styles.table}>
      <thead><tr><Th>Name</Th><Th>Beworben als</Th><Th>Kontakt</Th><Th>Quelle</Th><Th>Eingegangen</Th><Th>Status</Th></tr></thead>
      <tbody>{rows.map((b) => (
        <ClickRow key={b.id} onClick={() => onSelect(b.id)}>
          <Td><span style={styles.name}>{b.vorname} {b.nachname}</span></Td>
          <Td>{b.position || <Dim>—</Dim>}</Td>
          <Td><KontaktZelle email={b.email} telefon={b.telefon} /></Td>
          <Td>{b.quelle || <Dim>—</Dim>}</Td>
          <Td>{formatDate(b.bewerbungsdatum)}</Td>
          <Td><StatusBadge status={b.status} /></Td>
        </ClickRow>
      ))}</tbody>
    </table>
  );
}
function ClickRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <tr onClick={onClick} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,168,76,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      {children}
    </tr>
  );
}

// ============================================================
// DETAIL-DRAWER (Cockpit)
// ============================================================
type DetailTab = 'stamm' | 'docs' | 'abw' | 'schul' | 'check' | 'auswertung';

function DetailDrawer(props: { typ: Tab; ma?: Mitarbeiter; bw?: Bewerber; bundesland: string; onClose: () => void; onChanged: () => void }) {
  const { typ, ma, bw, bundesland, onClose, onChanged } = props;
  const istMA = typ === 'mitarbeiter';
  const id = istMA ? ma!.id : bw!.id;

  const [detailTab, setDetailTab] = useState<DetailTab>('stamm');

  // Stammdaten
  const [vorname, setVorname] = useState(istMA ? ma!.vorname : bw!.vorname);
  const [nachname, setNachname] = useState(istMA ? ma!.nachname : bw!.nachname);
  const [email, setEmail] = useState((istMA ? ma!.email : bw!.email) ?? '');
  const [telefon, setTelefon] = useState((istMA ? ma!.telefon : bw!.telefon) ?? '');
  const [position, setPosition] = useState((istMA ? ma!.position : bw!.position) ?? '');
  const [quelle, setQuelle] = useState(istMA ? '' : bw!.quelle ?? '');
  const [status, setStatus] = useState(istMA ? ma!.status : bw!.status);
  // erweiterte MA-Stammdaten
  const [geburtsdatum, setGeburtsdatum] = useState(ma?.geburtsdatum ?? '');
  const [adresse, setAdresse] = useState(ma?.adresse ?? '');
  const [svNummer, setSvNummer] = useState(ma?.sv_nummer ?? '');
  const [steuerId, setSteuerId] = useState(ma?.steuer_id ?? '');
  const [iban, setIban] = useState(ma?.iban ?? '');
  const [notfall, setNotfall] = useState(ma?.notfall_kontakt ?? '');
  const [urlaubsanspruch, setUrlaubsanspruch] = useState(String(ma?.urlaubsanspruch_tage ?? 30));

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hiring, setHiring] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [eingeladen, setEingeladen] = useState(!!ma?.auth_user_id);
  const [zugang, setZugang] = useState<{ email: string; passwort: string; loginUrl: string } | null>(null);

  // Datensätze
  const [docs, setDocs] = useState<HrDokument[]>([]);
  const [abw, setAbw] = useState<Abwesenheit[]>([]);
  const [schul, setSchul] = useState<Schulung[]>([]);
  const [check, setCheck] = useState<Checkliste[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listMsg, setListMsg] = useState<string | null>(null);

  const ladeDocs = useCallback(async () => {
    setListLoading(true);
    try {
      const spalte = istMA ? 'mitarbeiter_id' : 'bewerber_id';
      const { data, error } = await supabase.from('hr_dokumente')
        .select('id,dateiname,storage_pfad,groesse_bytes,mime_type,kategorie,hochgeladen_am')
        .eq(spalte, id).order('hochgeladen_am', { ascending: false });
      if (error) throw error;
      setDocs((data as HrDokument[]) ?? []);
    } catch { setListMsg('Dokumente konnten nicht geladen werden.'); } finally { setListLoading(false); }
  }, [id, istMA]);

  const ladeAbw = useCallback(async () => {
    setListLoading(true);
    try {
      const { data, error } = await supabase.from('hr_abwesenheiten')
        .select('id,typ,von,bis,tage,status,au_vorhanden,notiz').eq('mitarbeiter_id', id).order('von', { ascending: false });
      if (error) throw error;
      setAbw((data as Abwesenheit[]) ?? []);
    } catch { setListMsg('Abwesenheiten konnten nicht geladen werden.'); } finally { setListLoading(false); }
  }, [id]);

  const ladeSchul = useCallback(async () => {
    setListLoading(true);
    try {
      const { data, error } = await supabase.from('hr_schulungen')
        .select('id,titel,kategorie,absolviert_am,gueltig_bis,status,notiz').eq('mitarbeiter_id', id).order('gueltig_bis', { ascending: true });
      if (error) throw error;
      setSchul((data as Schulung[]) ?? []);
    } catch { setListMsg('Schulungen konnten nicht geladen werden.'); } finally { setListLoading(false); }
  }, [id]);

  const ladeCheck = useCallback(async () => {
    setListLoading(true);
    try {
      const { data, error } = await supabase.from('hr_checklisten')
        .select('id,art,aufgabe,erledigt,erledigt_am,notiz,reihenfolge').eq('mitarbeiter_id', id)
        .order('reihenfolge', { ascending: true }).order('created_at', { ascending: true });
      if (error) throw error;
      setCheck((data as Checkliste[]) ?? []);
    } catch { setListMsg('Checklisten konnten nicht geladen werden.'); } finally { setListLoading(false); }
  }, [id]);

  useEffect(() => {
    setListMsg(null);
    if (detailTab === 'docs') ladeDocs();
    if (detailTab === 'abw') ladeAbw();
    if (detailTab === 'schul') ladeSchul();
    if (detailTab === 'check') ladeCheck();
    if (detailTab === 'auswertung') { ladeAbw(); ladeSchul(); }
  }, [detailTab, ladeDocs, ladeAbw, ladeSchul, ladeCheck]);

  async function stammSpeichern() {
    setSaving(true); setMsg(null);
    try {
      if (!vorname.trim() || !nachname.trim()) { setMsg('Vor- und Nachname sind Pflicht.'); setSaving(false); return; }
      if (istMA) {
        const { error } = await supabase.from('mitarbeiter').update({
          vorname: vorname.trim(), nachname: nachname.trim(), email: email.trim() || null, telefon: telefon.trim() || null,
          position: position.trim() || null, status,
          geburtsdatum: geburtsdatum || null, adresse: adresse.trim() || null, sv_nummer: svNummer.trim() || null,
          steuer_id: steuerId.trim() || null, iban: iban.trim() || null, notfall_kontakt: notfall.trim() || null,
          urlaubsanspruch_tage: parseInt(urlaubsanspruch, 10) || 30,
        }).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bewerber').update({
          vorname: vorname.trim(), nachname: nachname.trim(), email: email.trim() || null, telefon: telefon.trim() || null,
          position: position.trim() || null, quelle: quelle.trim() || null, status,
        }).eq('id', id);
        if (error) throw error;
      }
      setMsg('Gespeichert.'); onChanged();
    } catch (e: unknown) { setMsg('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setSaving(false); }
  }

  async function einladen() {
    if (!istMA) return;
    if (!email.trim()) { setMsg('Bitte zuerst eine E-Mail-Adresse in den Stammdaten eintragen und speichern.'); return; }
    if (!window.confirm(`${vorname} ${nachname} zum Self-Service einladen?\n\nEs wird eine Einladungs-Mail an ${email.trim()} versendet, mit der die Person ihr Passwort festlegt und ihren eigenen Bereich nutzen kann.`)) return;
    setInviting(true); setMsg(null);
    try {
      const res = await fetch('/api/hr/mitarbeiter-einladen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mitarbeiter_id: id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Einladung fehlgeschlagen.');
      setEingeladen(true);
      setZugang({ email: j.email, passwort: j.temp_passwort, loginUrl: j.login_url });
      setMsg(null);
      onChanged();
    } catch (e: unknown) { setMsg('Einladung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setInviting(false); }
  }

  async function zugangZuruecksetzen() {
    if (!istMA) return;
    if (!email.trim()) { setMsg('Für diesen Mitarbeiter ist keine E-Mail hinterlegt.'); return; }
    if (!window.confirm(`Zugang von ${vorname} ${nachname} zurücksetzen?\n\nEs wird ein NEUES Einmal-Passwort erzeugt. Das bisherige Passwort des Mitarbeiters wird damit ungültig. Anschließend gibst du ihm den neuen Zugang weiter.`)) return;
    setInviting(true); setMsg(null);
    try {
      const res = await fetch('/api/hr/zugang-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mitarbeiter_id: id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Zurücksetzen fehlgeschlagen.');
      setEingeladen(true);
      setZugang({ email: j.email, passwort: j.temp_passwort, loginUrl: j.login_url });
      setMsg(null);
      onChanged();
    } catch (e: unknown) { setMsg('Zurücksetzen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setInviting(false); }
  }

  async function uebernehmen() {
    if (istMA) return;
    if (!window.confirm(`${vorname} ${nachname} als Mitarbeiter übernehmen?\n\nDie Person wird als aktiver Mitarbeiter angelegt und der Bewerber-Status auf „Eingestellt" gesetzt.`)) return;
    setHiring(true); setMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setMsg('Keine aktive Sitzung gefunden.'); setHiring(false); return; }
      const { data: neu, error: insErr } = await supabase.from('mitarbeiter').insert({
        owner_user_id: ownerId, vorname: vorname.trim(), nachname: nachname.trim(), email: email.trim() || null,
        telefon: telefon.trim() || null, position: position.trim() || null, status: 'aktiv',
        eintrittsdatum: new Date().toISOString().slice(0, 10),
      }).select('id').single();
      if (insErr) throw insErr;
      const { error: updErr } = await supabase.from('bewerber').update({ mitarbeiter_id: neu!.id, status: 'eingestellt' }).eq('id', id);
      if (updErr) throw updErr;
      setStatus('eingestellt'); setMsg('Als Mitarbeiter übernommen.'); onChanged();
    } catch (e: unknown) { setMsg('Übernahme fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setHiring(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={styles.drawerHead}>
          <div>
            <div style={styles.eyebrowSmall}>{istMA ? 'Mitarbeiter' : 'Bewerber'}</div>
            <h2 style={styles.drawerTitle}>{vorname} {nachname}</h2>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Schließen">×</button>
        </div>

        <div style={styles.detailTabs}>
          <DetailTabBtn active={detailTab === 'stamm'} onClick={() => setDetailTab('stamm')}>Stammdaten</DetailTabBtn>
          <DetailTabBtn active={detailTab === 'docs'} onClick={() => setDetailTab('docs')}>Dokumente</DetailTabBtn>
          {istMA && <DetailTabBtn active={detailTab === 'abw'} onClick={() => setDetailTab('abw')}>Abwesenheiten</DetailTabBtn>}
          {istMA && <DetailTabBtn active={detailTab === 'schul'} onClick={() => setDetailTab('schul')}>Schulungen</DetailTabBtn>}
          {istMA && <DetailTabBtn active={detailTab === 'check'} onClick={() => setDetailTab('check')}>Checklisten</DetailTabBtn>}
          {istMA && <DetailTabBtn active={detailTab === 'auswertung'} onClick={() => setDetailTab('auswertung')}>Auswertung</DetailTabBtn>}
        </div>

        <div style={styles.drawerBody}>
          {detailTab === 'stamm' && (
            <>
              <div style={styles.formGrid}>
                <Field label="Vorname *"><input style={styles.input} value={vorname} onChange={(e) => setVorname(e.target.value)} /></Field>
                <Field label="Nachname *"><input style={styles.input} value={nachname} onChange={(e) => setNachname(e.target.value)} /></Field>
                <Field label="E-Mail"><input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                <Field label="Telefon"><input style={styles.input} value={telefon} onChange={(e) => setTelefon(e.target.value)} /></Field>
                <Field label={istMA ? 'Position' : 'Beworben als'}><input style={styles.input} value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
                {!istMA && <Field label="Quelle"><input style={styles.input} value={quelle} onChange={(e) => setQuelle(e.target.value)} /></Field>}
                <Field label="Status">
                  <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {(istMA ? MA_STATUS : BW_STATUS).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </Field>
              </div>

              {istMA && (
                <>
                  <div style={styles.sectionDivider}>Weitere Angaben</div>
                  <div style={styles.formGrid}>
                    <Field label="Geburtsdatum"><input type="date" style={styles.input} value={geburtsdatum} onChange={(e) => setGeburtsdatum(e.target.value)} /></Field>
                    <Field label="Urlaubsanspruch (Tage)"><input type="number" style={styles.input} value={urlaubsanspruch} onChange={(e) => setUrlaubsanspruch(e.target.value)} /></Field>
                    <Field label="Adresse"><input style={styles.input} value={adresse} onChange={(e) => setAdresse(e.target.value)} /></Field>
                    <Field label="Notfallkontakt"><input style={styles.input} value={notfall} onChange={(e) => setNotfall(e.target.value)} /></Field>
                    <Field label="SV-Nummer"><input style={styles.input} value={svNummer} onChange={(e) => setSvNummer(e.target.value)} /></Field>
                    <Field label="Steuer-ID"><input style={styles.input} value={steuerId} onChange={(e) => setSteuerId(e.target.value)} /></Field>
                    <Field label="IBAN"><input style={styles.input} value={iban} onChange={(e) => setIban(e.target.value)} /></Field>
                  </div>
                </>
              )}

              {msg && <div style={styles.infoMsg}>{msg}</div>}
              <div style={styles.drawerActions}>
                <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={stammSpeichern} disabled={saving}>{saving ? 'Speichert …' : 'Speichern'}</button>
                {!istMA && status !== 'eingestellt' && (
                  <button style={{ ...styles.hireBtn, opacity: hiring ? 0.6 : 1 }} onClick={uebernehmen} disabled={hiring}>{hiring ? 'Übernimmt …' : '✓ Als Mitarbeiter übernehmen'}</button>
                )}
                {!istMA && status === 'eingestellt' && <span style={styles.hiredHint}>Bereits als Mitarbeiter übernommen</span>}
                {istMA && !eingeladen && (
                  <button style={{ ...styles.inviteBtn, opacity: inviting ? 0.6 : 1 }} onClick={einladen} disabled={inviting}>{inviting ? 'Lädt ein …' : '✉ Zum Self-Service einladen'}</button>
                )}
                {istMA && eingeladen && (
                  <>
                    <span style={styles.invitedHint}>✓ Zum Self-Service eingeladen</span>
                    <button style={{ ...styles.resetBtn, opacity: inviting ? 0.6 : 1 }} onClick={zugangZuruecksetzen} disabled={inviting}>{inviting ? 'Setzt zurück …' : '↻ Zugang zurücksetzen'}</button>
                  </>
                )}
              </div>

              {zugang && (
                <div style={styles.zugangBox}>
                  <div style={{ fontWeight: 700, color: C.cyan, marginBottom: 4 }}>Neuer Zugang bereit</div>
                  <div style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>Bitte sicher an den Mitarbeiter weitergeben (Mail, WhatsApp, persönlich). Das Einmal-Passwort wird nur jetzt angezeigt.</div>
                  <ZugangZeile label="E-Mail" wert={zugang.email} />
                  <ZugangZeile label="Einmal-Passwort" wert={zugang.passwort} />
                  <ZugangZeile label="Login-Link" wert={zugang.loginUrl} />
                  <button
                    style={{ ...styles.primaryBtn, marginTop: 10 }}
                    onClick={() => navigator.clipboard?.writeText(`Dein ARGONAUT-Zugang:\nLogin: ${zugang.loginUrl}\nE-Mail: ${zugang.email}\nEinmal-Passwort: ${zugang.passwort}\n\nBitte einloggen und anschließend dein Passwort ändern.`)}
                  >
                    Alles kopieren
                  </button>
                  <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>Der Mitarbeiter loggt sich damit ein und kann sein Passwort danach jederzeit ändern.</div>
                </div>
              )}
            </>
          )}

          {detailTab === 'docs' && (
            <DokumenteTab typ={typ} id={id} docs={docs} loading={listLoading} msg={listMsg} setMsg={setListMsg} reload={ladeDocs} />
          )}
          {detailTab === 'abw' && (
            <AbwesenheitenTab id={id} rows={abw} loading={listLoading} msg={listMsg} setMsg={setListMsg} reload={ladeAbw} urlaubsanspruch={parseInt(urlaubsanspruch, 10) || 30} bundesland={bundesland} />
          )}
          {detailTab === 'schul' && (
            <SchulungenTab id={id} rows={schul} loading={listLoading} msg={listMsg} setMsg={setListMsg} reload={ladeSchul} />
          )}
          {detailTab === 'check' && (
            <ChecklistenTab id={id} rows={check} loading={listLoading} msg={listMsg} setMsg={setListMsg} reload={ladeCheck} />
          )}
          {detailTab === 'auswertung' && (
            <AuswertungTab abw={abw} schul={schul} loading={listLoading} urlaubsanspruch={parseInt(urlaubsanspruch, 10) || 30} stammVollstaendig={!!(geburtsdatum && adresse && iban && svNummer)} />
          )}
        </div>
      </div>
    </div>
  );
}

function DetailTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 4px', marginRight: 20, fontSize: 14, fontWeight: 600,
      fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
      color: active ? C.gold : C.textDim, borderBottom: active ? `2px solid ${C.gold}` : '2px solid transparent',
    }}>{children}</button>
  );
}

// ============================================================
// TAB: Dokumente (mit Kategorie)
// ============================================================
function DokumenteTab({ typ, id, docs, loading, msg, setMsg, reload }: {
  typ: Tab; id: string; docs: HrDokument[]; loading: boolean; msg: string | null; setMsg: (s: string | null) => void; reload: () => void;
}) {
  const istMA = typ === 'mitarbeiter';
  const [kategorie, setKategorie] = useState('sonstiges');
  const [uploading, setUploading] = useState(false);

  async function hochladen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setMsg('Keine aktive Sitzung gefunden.'); setUploading(false); return; }
      const sauber = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const pfad = `${ownerId}/${typ}/${id}/${Date.now()}-${sauber}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(pfad, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('hr_dokumente').insert({
        owner_user_id: ownerId, dateiname: file.name, storage_pfad: pfad, groesse_bytes: file.size,
        mime_type: file.type || null, kategorie, bewerber_id: istMA ? null : id, mitarbeiter_id: istMA ? id : null,
      });
      if (insErr) throw insErr;
      setMsg('Hochgeladen.'); reload();
    } catch (err: unknown) { setMsg('Upload fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setUploading(false); e.target.value = ''; }
  }
  async function oeffnen(d: HrDokument) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_pfad, 60);
      if (error || !data) throw error ?? new Error('Kein Link');
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch { setMsg('Datei konnte nicht geöffnet werden.'); }
  }
  async function loeschen(d: HrDokument) {
    if (!window.confirm(`„${d.dateiname}" löschen?`)) return;
    try {
      await supabase.storage.from(BUCKET).remove([d.storage_pfad]);
      const { error } = await supabase.from('hr_dokumente').delete().eq('id', d.id);
      if (error) throw error;
      reload();
    } catch { setMsg('Löschen fehlgeschlagen.'); }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <Field label="Kategorie">
          <select style={{ ...styles.input, minWidth: 160 }} value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
            {DOK_KATEGORIEN.map((k) => <option key={k} value={k}>{KAT_LABEL[k]}</option>)}
          </select>
        </Field>
        <label style={{ ...styles.primaryBtn, opacity: uploading ? 0.6 : 1, display: 'inline-flex', alignItems: 'center' }}>
          <input type="file" style={{ display: 'none' }} onChange={hochladen} disabled={uploading} />
          {uploading ? 'Lädt hoch …' : '＋ Datei hochladen'}
        </label>
      </div>
      {msg && <div style={styles.infoMsg}>{msg}</div>}
      <div style={{ marginTop: 14 }}>
        {loading && <div style={styles.listHint}>Lädt …</div>}
        {!loading && docs.length === 0 && <div style={styles.listHint}>Noch keine Dokumente hinterlegt.</div>}
        {!loading && docs.map((d) => (
          <div key={d.id} style={styles.docRow}>
            <div style={{ minWidth: 0 }}>
              <div style={styles.docName} title={d.dateiname}>{d.dateiname}</div>
              <div style={styles.docMeta}>
                <span style={styles.katBadge}>{KAT_LABEL[d.kategorie] || d.kategorie}</span>
                {formatBytes(d.groesse_bytes)} · {dStr(d.hochgeladen_am)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button style={styles.miniBtn} onClick={() => oeffnen(d)}>Öffnen</button>
              <button style={{ ...styles.miniBtn, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => loeschen(d)}>Löschen</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================
// TAB: Abwesenheiten
// ============================================================
function AbwesenheitenTab({ id, rows, loading, msg, setMsg, reload, urlaubsanspruch, bundesland }: {
  id: string; rows: Abwesenheit[]; loading: boolean; msg: string | null; setMsg: (s: string | null) => void; reload: () => void; urlaubsanspruch: number; bundesland: string;
}) {
  const [typ, setTyp] = useState('urlaub');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [au, setAu] = useState(false);
  const [saving, setSaving] = useState(false);

  const jahr = new Date().getFullYear();
  const genommen = rows.filter((r) => r.typ === 'urlaub' && r.status === 'genehmigt' && new Date(r.von).getFullYear() === jahr)
    .reduce((s, r) => s + (r.tage ?? 0), 0);
  const rest = urlaubsanspruch - genommen;
  const krankTage = rows.filter((r) => r.typ === 'krankheit' && new Date(r.von).getFullYear() === jahr).reduce((s, r) => s + (r.tage ?? 0), 0);

  async function hinzufuegen() {
    setMsg(null);
    if (!von || !bis) { setMsg('Von- und Bis-Datum sind Pflicht.'); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setMsg('Keine aktive Sitzung gefunden.'); setSaving(false); return; }
      const { error } = await supabase.from('hr_abwesenheiten').insert({
        owner_user_id: ownerId, mitarbeiter_id: id, typ, von, bis, tage: dauerTage(typ, von, bis, bundesland),
        status: typ === 'urlaub' ? 'beantragt' : 'erfasst', au_vorhanden: typ === 'krankheit' ? au : false,
      });
      if (error) throw error;
      setVon(''); setBis(''); setAu(false); reload();
    } catch (e: unknown) { setMsg('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setSaving(false); }
  }
  async function statusSetzen(r: Abwesenheit, neu: string) {
    try { const { error } = await supabase.from('hr_abwesenheiten').update({ status: neu }).eq('id', r.id); if (error) throw error; reload(); }
    catch { setMsg('Status konnte nicht geändert werden.'); }
  }
  async function loeschen(r: Abwesenheit) {
    if (!window.confirm('Eintrag löschen?')) return;
    try { const { error } = await supabase.from('hr_abwesenheiten').delete().eq('id', r.id); if (error) throw error; reload(); }
    catch { setMsg('Löschen fehlgeschlagen.'); }
  }

  return (
    <>
      <div style={styles.statGrid}>
        <Stat label="Urlaubsanspruch" value={`${urlaubsanspruch} Tage`} />
        <Stat label="Genommen" value={`${genommen} Tage`} />
        <Stat label="Resturlaub" value={`${rest} Tage`} accent={rest <= 5 ? C.warn : C.green} />
        <Stat label={`Krank ${jahr}`} value={`${krankTage} Tage`} />
      </div>

      <div style={styles.miniForm}>
        <select style={{ ...styles.input, maxWidth: 130 }} value={typ} onChange={(e) => setTyp(e.target.value)}>
          <option value="urlaub">Urlaub</option><option value="krankheit">Krankheit</option>
        </select>
        <input type="date" style={styles.input} value={von} onChange={(e) => setVon(e.target.value)} />
        <input type="date" style={styles.input} value={bis} onChange={(e) => setBis(e.target.value)} />
        {typ === 'krankheit' && (
          <label style={styles.checkLabel}><input type="checkbox" checked={au} onChange={(e) => setAu(e.target.checked)} /> AU liegt vor</label>
        )}
        <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={hinzufuegen} disabled={saving}>+ Hinzufügen</button>
      </div>
      {von && bis && (
        <div style={{ fontSize: 12, color: C.textDim, marginTop: -4, marginBottom: 10 }}>
          {typ === 'urlaub'
            ? `= ${arbeitstage(von, bis, bundesland)} Arbeitstage (Wochenenden & Feiertage werden nicht als Urlaub gezählt)`
            : `= ${kalendertage(von, bis)} Kalendertage`}
        </div>
      )}
      {msg && <div style={styles.infoMsg}>{msg}</div>}

      <div style={{ marginTop: 14 }}>
        {loading && <div style={styles.listHint}>Lädt …</div>}
        {!loading && rows.length === 0 && <div style={styles.listHint}>Noch keine Einträge.</div>}
        {!loading && rows.map((r) => (
          <div key={r.id} style={styles.docRow}>
            <div style={{ minWidth: 0 }}>
              <div style={styles.docName}>{r.typ === 'urlaub' ? 'Urlaub' : 'Krankheit'} · {dStr(r.von)}–{dStr(r.bis)}</div>
              <div style={styles.docMeta}>{r.tage ?? 0} Tage{r.typ === 'krankheit' ? (r.au_vorhanden ? ' · AU liegt vor' : ' · keine AU') : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <StatusBadge status={r.status} />
              {r.typ === 'urlaub' && r.status === 'beantragt' && (
                <>
                  <button style={{ ...styles.miniBtn, color: C.green, borderColor: 'rgba(76,175,125,0.4)' }} onClick={() => statusSetzen(r, 'genehmigt')}>Genehmigen</button>
                  <button style={{ ...styles.miniBtn, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => statusSetzen(r, 'abgelehnt')}>Ablehnen</button>
                </>
              )}
              <button style={{ ...styles.miniBtn, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => loeschen(r)}>×</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================
// TAB: Schulungen
// ============================================================
function SchulungenTab({ id, rows, loading, msg, setMsg, reload }: {
  id: string; rows: Schulung[]; loading: boolean; msg: string | null; setMsg: (s: string | null) => void; reload: () => void;
}) {
  const [titel, setTitel] = useState('');
  const [kategorie, setKategorie] = useState('arbeitsschutz');
  const [absolviert, setAbsolviert] = useState('');
  const [gueltig, setGueltig] = useState('');
  const [saving, setSaving] = useState(false);

  async function hinzufuegen() {
    setMsg(null);
    if (!titel.trim()) { setMsg('Titel ist Pflicht.'); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setMsg('Keine aktive Sitzung gefunden.'); setSaving(false); return; }
      const { error } = await supabase.from('hr_schulungen').insert({
        owner_user_id: ownerId, mitarbeiter_id: id, titel: titel.trim(), kategorie,
        absolviert_am: absolviert || null, gueltig_bis: gueltig || null,
        status: absolviert ? 'absolviert' : 'offen',
      });
      if (error) throw error;
      setTitel(''); setAbsolviert(''); setGueltig(''); reload();
    } catch (e: unknown) { setMsg('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setSaving(false); }
  }
  async function loeschen(r: Schulung) {
    if (!window.confirm('Schulung löschen?')) return;
    try { const { error } = await supabase.from('hr_schulungen').delete().eq('id', r.id); if (error) throw error; reload(); }
    catch { setMsg('Löschen fehlgeschlagen.'); }
  }

  return (
    <>
      <div style={{ ...styles.miniForm, flexWrap: 'wrap' }}>
        <input style={{ ...styles.input, minWidth: 180, flex: 1 }} placeholder="Titel, z. B. Arbeitsschutz-Unterweisung" value={titel} onChange={(e) => setTitel(e.target.value)} />
        <select style={{ ...styles.input, maxWidth: 150 }} value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
          {SCHUL_KATEGORIEN.map((k) => <option key={k} value={k}>{KAT_LABEL[k] || k}</option>)}
        </select>
      </div>
      <div style={{ ...styles.miniForm, marginTop: 8, flexWrap: 'wrap' }}>
        <Field label="Absolviert am"><input type="date" style={styles.input} value={absolviert} onChange={(e) => setAbsolviert(e.target.value)} /></Field>
        <Field label="Gültig bis"><input type="date" style={styles.input} value={gueltig} onChange={(e) => setGueltig(e.target.value)} /></Field>
        <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1, alignSelf: 'flex-end' }} onClick={hinzufuegen} disabled={saving}>+ Hinzufügen</button>
      </div>
      {msg && <div style={styles.infoMsg}>{msg}</div>}

      <div style={{ marginTop: 14 }}>
        {loading && <div style={styles.listHint}>Lädt …</div>}
        {!loading && rows.length === 0 && <div style={styles.listHint}>Noch keine Schulungen erfasst.</div>}
        {!loading && rows.map((r) => {
          const tb = tageBis(r.gueltig_bis);
          const abgelaufen = tb !== null && tb < 0;
          const baldFaellig = tb !== null && tb >= 0 && tb <= 30;
          return (
            <div key={r.id} style={styles.docRow}>
              <div style={{ minWidth: 0 }}>
                <div style={styles.docName}>{r.titel}</div>
                <div style={styles.docMeta}>
                  <span style={styles.katBadge}>{KAT_LABEL[r.kategorie] || r.kategorie}</span>
                  {r.gueltig_bis ? `gültig bis ${dStr(r.gueltig_bis)}` : 'ohne Ablauf'}
                  {abgelaufen && <span style={{ color: C.danger, fontWeight: 700 }}> · abgelaufen</span>}
                  {baldFaellig && <span style={{ color: C.warn, fontWeight: 700 }}> · läuft in {tb} Tagen ab</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <StatusBadge status={r.status} />
                <button style={{ ...styles.miniBtn, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => loeschen(r)}>×</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================================================
// TAB: Auswertung — regelbasierte Hinweise (sofort) + KI-Einschätzung (auf Knopfdruck)
// KI bekommt nur anonyme Eckdaten (keine Namen, keine Dokumente) → DSGVO-sparsam.
// ============================================================
function AuswertungTab({ abw, schul, loading, urlaubsanspruch, stammVollstaendig }: {
  abw: Abwesenheit[]; schul: Schulung[]; loading: boolean; urlaubsanspruch: number; stammVollstaendig: boolean;
}) {
  // --- KI-Einschätzung (auf Knopfdruck) — Hooks zuerst, vor jedem early return ---
  const [kiText, setKiText] = useState<string | null>(null);
  const [kiLoading, setKiLoading] = useState(false);
  const [kiError, setKiError] = useState<string | null>(null);

  const jahr = new Date().getFullYear();
  const genommen = abw.filter((r) => r.typ === 'urlaub' && r.status === 'genehmigt' && new Date(r.von).getFullYear() === jahr).reduce((s, r) => s + (r.tage ?? 0), 0);
  const rest = urlaubsanspruch - genommen;
  const krankEintraege = abw.filter((r) => r.typ === 'krankheit' && new Date(r.von).getFullYear() === jahr);
  const krankTage = krankEintraege.reduce((s, r) => s + (r.tage ?? 0), 0);
  // Krankmeldungen, die an ein Wochenende grenzen (Mo-Start oder Fr-Ende)
  const wochenendNah = krankEintraege.filter((r) => {
    const vonTag = new Date(r.von).getDay(); const bisTag = new Date(r.bis).getDay();
    return vonTag === 1 || bisTag === 5;
  }).length;

  const hinweise: { text: string; farbe: string }[] = [];
  if (rest > 5) hinweise.push({ text: `Resturlaub von ${rest} Tagen offen — rechtzeitig verplanen, sonst droht Verfall zum Jahres-/Quartalsende.`, farbe: C.warn });
  if (krankEintraege.length >= 2 && wochenendNah >= Math.ceil(krankEintraege.length / 2)) {
    hinweise.push({ text: `${wochenendNah} von ${krankEintraege.length} Krankmeldungen grenzen direkt an ein Wochenende — auffälliges Muster, im Blick behalten.`, farbe: C.gold });
  }
  const abgelaufen = schul.filter((s) => { const t = tageBis(s.gueltig_bis); return t !== null && t < 0; });
  const baldFaellig = schul.filter((s) => { const t = tageBis(s.gueltig_bis); return t !== null && t >= 0 && t <= 30; });
  if (abgelaufen.length > 0) hinweise.push({ text: `${abgelaufen.length} Pflicht-Schulung(en) abgelaufen — Haftungsrisiko, dringend erneuern.`, farbe: C.danger });
  if (baldFaellig.length > 0) hinweise.push({ text: `${baldFaellig.length} Schulung(en) laufen in den nächsten 30 Tagen ab.`, farbe: C.warn });
  if (!stammVollstaendig) hinweise.push({ text: 'Stammdaten unvollständig (Geburtsdatum, Adresse, IBAN oder SV-Nummer fehlt).', farbe: C.cyan });
  if (hinweise.length === 0) hinweise.push({ text: 'Alles im grünen Bereich — keine offenen Auffälligkeiten.', farbe: C.green });

  async function kiAuswerten() {
    setKiLoading(true); setKiError(null); setKiText(null);
    try {
      const resp = await fetch('/api/hr/ki-auswertung', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          urlaubsanspruch,
          genommen,
          rest,
          krankTage,
          krankEintraege: krankEintraege.length,
          wochenendNah,
          stammVollstaendig,
          schulungen: schul.map((s) => ({ kategorie: s.kategorie, status: s.status, tageBis: tageBis(s.gueltig_bis) })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { setKiError(data?.error ?? 'KI-Auswertung fehlgeschlagen.'); return; }
      setKiText((data?.auswertung as string) ?? '');
    } catch { setKiError('Verbindung zur KI-Auswertung fehlgeschlagen.'); }
    finally { setKiLoading(false); }
  }

  if (loading) return <div style={styles.listHint}>Wertet aus …</div>;
  return (
    <>
      <div style={styles.statGrid}>
        <Stat label="Resturlaub" value={`${rest} Tage`} accent={rest <= 5 ? C.warn : C.green} />
        <Stat label={`Krank ${jahr}`} value={`${krankTage} Tage`} />
        <Stat label="Schulungen offen/abgelaufen" value={`${schul.filter((s) => s.status !== 'absolviert').length + abgelaufen.length}`} />
        <Stat label="Schulungen gesamt" value={`${schul.length}`} />
      </div>
      <div style={styles.sectionDivider}>Proaktive Hinweise</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {hinweise.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: `${h.farbe}14`, border: `1px solid ${h.farbe}40`, borderRadius: 10, padding: '12px 14px' }}>
            <span style={{ color: h.farbe, fontWeight: 700, lineHeight: 1.4 }}>•</span>
            <span style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{h.text}</span>
          </div>
        ))}
      </div>

      <div style={styles.sectionDivider}>KI-Einschätzung</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button style={{ ...styles.primaryBtn, opacity: kiLoading ? 0.6 : 1, cursor: kiLoading ? 'wait' : 'pointer' }} onClick={kiAuswerten} disabled={kiLoading}>
            {kiLoading ? 'KI denkt nach …' : kiText ? '🤖 Neu auswerten' : '🤖 KI-Einschätzung erstellen'}
          </button>
          <span style={{ fontSize: 12, color: C.textDim }}>Es werden nur anonyme Eckdaten gesendet — keine Namen, keine Dokumente.</span>
        </div>
        {kiError && <div style={styles.formError}>{kiError}</div>}
        {kiText && (
          <div style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 12, padding: '16px 18px', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65, color: C.text }}>
            {kiText}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// TAB: Checklisten (Onboarding / Offboarding) — Stufe 1
// ============================================================
const CHECK_ARTEN: { key: string; label: string }[] = [
  { key: 'onboarding', label: 'Onboarding (Eintritt)' },
  { key: 'offboarding', label: 'Offboarding (Austritt)' },
];

type Vorlage = { id: string; name: string; art: string; punkte: string[] };

// Eingebaute, branchenneutrale Bibliothek (Vorschläge — für alle Branchen)
const CHECK_BIBLIOTHEK: Record<'onboarding' | 'offboarding', { kategorie: string; punkte: string[] }[]> = {
  onboarding: [
    { kategorie: 'Zugang & Schlüssel', punkte: ['Schlüssel/Transponder ausgehändigt', 'Zugangskarte/Chip aktiviert', 'Alarmcode erklärt', 'Spind zugewiesen'] },
    { kategorie: 'IT & Kommunikation', punkte: ['E-Mail-Konto angelegt', 'Benutzerkonto/Logins eingerichtet', 'Laptop/PC ausgehändigt', 'Diensthandy ausgehändigt', 'Telefon/Durchwahl eingerichtet'] },
    { kategorie: 'Arbeitsmittel', punkte: ['Arbeitskleidung ausgegeben', 'Schutzausrüstung (PSA) ausgegeben', 'Werkzeug/Ausrüstung übergeben', 'Stempelkarte/Zeiterfassung eingerichtet'] },
    { kategorie: 'Unterlagen & Recht', punkte: ['Arbeitsvertrag unterschrieben', 'Personalbogen ausgefüllt', 'SV-Ausweis/Steuer-ID erfasst', 'Bankverbindung erfasst', 'Datenschutzerklärung unterzeichnet'] },
    { kategorie: 'Einarbeitung & Sicherheit', punkte: ['Sicherheitsunterweisung durchgeführt', 'Brandschutzunterweisung durchgeführt', 'Ersthelfer & Fluchtwege gezeigt', 'Einarbeitungsplan besprochen', 'Team vorgestellt', 'Ansprechpartner/Pate benannt'] },
  ],
  offboarding: [
    { kategorie: 'Rückgabe', punkte: ['Schlüssel/Transponder zurückerhalten', 'Zugangskarte/Chip eingezogen', 'Laptop/PC zurückerhalten', 'Diensthandy zurückerhalten', 'Arbeitskleidung/PSA zurückerhalten', 'Werkzeug/Ausrüstung zurückerhalten'] },
    { kategorie: 'IT & Zugänge', punkte: ['E-Mail-Konto deaktiviert', 'Alle Logins/Zugänge gesperrt', 'E-Mail-Weiterleitung eingerichtet', 'Daten gesichert/übergeben'] },
    { kategorie: 'Abschluss', punkte: ['Resturlaub abgegolten/geklärt', 'Arbeitszeugnis erstellt', 'Letzte Lohnabrechnung veranlasst', 'Abmeldung Sozialversicherung', 'Übergabe/Wissenstransfer dokumentiert', 'Austrittsgespräch geführt'] },
  ],
};

function ChecklistenTab({ id, rows, loading, msg, setMsg, reload }: {
  id: string; rows: Checkliste[]; loading: boolean; msg: string | null; setMsg: (s: string | null) => void; reload: () => void;
}) {
  const [neuArt, setNeuArt] = useState('onboarding');
  const [neuAufgabe, setNeuAufgabe] = useState('');
  const [saving, setSaving] = useState(false);

  async function hinzufuegen() {
    if (!neuAufgabe.trim()) { setMsg('Bitte einen Punkt eingeben.'); return; }
    setSaving(true); setMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setMsg('Keine aktive Sitzung gefunden.'); setSaving(false); return; }
      const maxR = rows.filter((r) => r.art === neuArt).reduce((m, r) => Math.max(m, r.reihenfolge ?? 0), 0);
      const { error } = await supabase.from('hr_checklisten').insert({
        owner_user_id: ownerId, mitarbeiter_id: id, art: neuArt, aufgabe: neuAufgabe.trim(), reihenfolge: maxR + 1,
      });
      if (error) throw error;
      setNeuAufgabe(''); reload();
    } catch (e: unknown) { setMsg('Hinzufügen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setSaving(false); }
  }

  async function umschalten(r: Checkliste) {
    const neu = !r.erledigt;
    try {
      const { error } = await supabase.from('hr_checklisten')
        .update({ erledigt: neu, erledigt_am: neu ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (error) throw error; reload();
    } catch { setMsg('Konnte nicht gespeichert werden.'); }
  }

  async function notizSpeichern(r: Checkliste, text: string) {
    const wert = text.trim();
    if (wert === (r.notiz ?? '')) return;
    try {
      const { error } = await supabase.from('hr_checklisten').update({ notiz: wert || null, updated_at: new Date().toISOString() }).eq('id', r.id);
      if (error) throw error; reload();
    } catch { setMsg('Notiz konnte nicht gespeichert werden.'); }
  }

  async function loeschen(r: Checkliste) {
    if (!window.confirm(`„${r.aufgabe}" löschen?`)) return;
    try {
      const { error } = await supabase.from('hr_checklisten').delete().eq('id', r.id);
      if (error) throw error; reload();
    } catch { setMsg('Löschen fehlgeschlagen.'); }
  }

  return (
    <>
      <VorlagenPanel id={id} rows={rows} onAdded={reload} setMsg={setMsg} />
      <div style={styles.miniForm}>
        <select style={{ ...styles.input, minWidth: 190 }} value={neuArt} onChange={(e) => setNeuArt(e.target.value)}>
          {CHECK_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <input
          style={{ ...styles.input, minWidth: 220, flex: 1 }}
          placeholder="z. B. Schlüssel ausgehändigt"
          value={neuAufgabe}
          onChange={(e) => setNeuAufgabe(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') hinzufuegen(); }}
        />
        <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={hinzufuegen} disabled={saving}>{saving ? 'Fügt hinzu …' : '＋ Punkt hinzufügen'}</button>
      </div>
      {msg && <div style={styles.infoMsg}>{msg}</div>}

      {loading && <div style={styles.listHint}>Lädt …</div>}
      {!loading && CHECK_ARTEN.map((a) => {
        const liste = rows.filter((r) => r.art === a.key);
        const erledigt = liste.filter((r) => r.erledigt).length;
        return (
          <div key={a.key} style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={styles.sectionDivider}>{a.label}</div>
              {liste.length > 0 && (
                <span style={{ fontSize: 13, fontWeight: 700, color: erledigt === liste.length ? C.green : C.gold, whiteSpace: 'nowrap' }}>
                  {erledigt} / {liste.length} erledigt
                </span>
              )}
            </div>
            {liste.length === 0 && <div style={styles.listHint}>Noch keine Punkte. Oben hinzufügen.</div>}
            {liste.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 8, background: r.erledigt ? 'rgba(76,175,125,0.06)' : C.cardBg }}>
                <input type="checkbox" checked={r.erledigt} onChange={() => umschalten(r)} style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer', accentColor: C.green, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, textDecoration: r.erledigt ? 'line-through' : 'none', opacity: r.erledigt ? 0.7 : 1 }}>{r.aufgabe}</div>
                  {r.erledigt && r.erledigt_am && <div style={{ fontSize: 12, color: C.green, marginTop: 2 }}>Erledigt am {dStr(r.erledigt_am)}</div>}
                  <input
                    style={{ ...styles.input, marginTop: 8, fontSize: 13, padding: '7px 10px' }}
                    placeholder="Notiz (optional)"
                    defaultValue={r.notiz ?? ''}
                    onBlur={(e) => notizSpeichern(r, e.target.value)}
                  />
                </div>
                <button style={{ ...styles.miniBtn, color: C.danger, borderColor: 'rgba(224,102,102,0.4)', flexShrink: 0 }} onClick={() => loeschen(r)}>Löschen</button>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// ============================================================
// Checklisten · Vorlagen & Bibliothek (Stufe 2)
// ============================================================
function VorlagenPanel({ id, rows, onAdded, setMsg }: {
  id: string; rows: Checkliste[]; onAdded: () => void; setMsg: (s: string | null) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [bibArt, setBibArt] = useState<'onboarding' | 'offboarding'>('onboarding');
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [busy, setBusy] = useState(false);

  const ladeVorlagen = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('hr_checklisten_vorlagen')
        .select('id,name,art,punkte').order('created_at', { ascending: false });
      if (error) throw error;
      setVorlagen((data as Vorlage[]) ?? []);
    } catch { /* leise */ }
  }, []);

  useEffect(() => { if (offen) ladeVorlagen(); }, [offen, ladeVorlagen]);

  function toggle(p: string) {
    setAuswahl((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  }
  async function ownerId(): Promise<string | null> {
    const { data } = await supabase.auth.getUser(); return data?.user?.id ?? null;
  }

  async function punkteEinfuegen(art: string, punkte: string[]) {
    if (punkte.length === 0) { setMsg('Nichts ausgewählt.'); return; }
    setBusy(true); setMsg(null);
    try {
      const oid = await ownerId();
      if (!oid) { setMsg('Keine aktive Sitzung gefunden.'); setBusy(false); return; }
      let r = rows.filter((x) => x.art === art).reduce((m, x) => Math.max(m, x.reihenfolge ?? 0), 0);
      const insertRows = punkte.map((p) => ({ owner_user_id: oid, mitarbeiter_id: id, art, aufgabe: p, reihenfolge: ++r }));
      const { error } = await supabase.from('hr_checklisten').insert(insertRows);
      if (error) throw error;
      setAuswahl(new Set());
      onAdded();
    } catch (e: unknown) { setMsg('Hinzufügen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setBusy(false); }
  }

  async function alsVorlageSpeichern() {
    const punkte = Array.from(auswahl);
    if (punkte.length === 0) { setMsg('Bitte zuerst Punkte in der Bibliothek auswählen.'); return; }
    const name = window.prompt('Name der Vorlage (z. B. „Onboarding Büro"):');
    if (!name || !name.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const oid = await ownerId();
      if (!oid) { setMsg('Keine aktive Sitzung gefunden.'); setBusy(false); return; }
      const { error } = await supabase.from('hr_checklisten_vorlagen').insert({ owner_user_id: oid, name: name.trim(), art: bibArt, punkte });
      if (error) throw error;
      setMsg('Vorlage gespeichert.');
      ladeVorlagen();
    } catch (e: unknown) { setMsg('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setBusy(false); }
  }

  async function vorlageLoeschen(vrl: Vorlage) {
    if (!window.confirm(`Vorlage „${vrl.name}" löschen?`)) return;
    try {
      const { error } = await supabase.from('hr_checklisten_vorlagen').delete().eq('id', vrl.id);
      if (error) throw error; ladeVorlagen();
    } catch { setMsg('Löschen fehlgeschlagen.'); }
  }

  if (!offen) {
    return <button style={{ ...styles.ghostBtn, marginBottom: 14 }} onClick={() => setOffen(true)}>📋 Aus Vorlage / Bibliothek hinzufügen</button>;
  }

  const meineVorlagen = vorlagen.filter((vrl) => vrl.art === bibArt);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 16, background: C.cardBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ color: C.gold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>Vorlagen &amp; Bibliothek</strong>
        <button style={styles.closeBtn} onClick={() => setOffen(false)} aria-label="Schließen">×</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['onboarding', 'offboarding'] as const).map((a) => (
          <button key={a} onClick={() => { setBibArt(a); setAuswahl(new Set()); }}
            style={{ ...styles.tabBtn, borderColor: bibArt === a ? C.gold : C.line, color: bibArt === a ? C.navy : C.text, background: bibArt === a ? C.gold : 'transparent' }}>
            {a === 'onboarding' ? 'Onboarding' : 'Offboarding'}
          </button>
        ))}
      </div>

      {meineVorlagen.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 8 }}>Meine Vorlagen</div>
          {meineVorlagen.map((vrl) => (
            <div key={vrl.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 14, color: C.text }}>{vrl.name} <span style={{ color: C.textDim }}>({vrl.punkte.length} Punkte)</span></span>
              <button style={styles.miniBtn} disabled={busy} onClick={() => punkteEinfuegen(vrl.art, vrl.punkte)}>Übernehmen</button>
              <button style={{ ...styles.miniBtn, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => vorlageLoeschen(vrl)}>Löschen</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 10 }}>Bibliothek — Punkte antippen zum Auswählen</div>
      {CHECK_BIBLIOTHEK[bibArt].map((grp) => (
        <div key={grp.kategorie} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.cyan, marginBottom: 6 }}>{grp.kategorie}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {grp.punkte.map((p) => {
              const aktiv = auswahl.has(p);
              return (
                <button key={p} onClick={() => toggle(p)}
                  style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    border: `1px solid ${aktiv ? C.gold : C.line}`, background: aktiv ? 'rgba(201,168,76,0.16)' : 'transparent', color: aktiv ? C.gold : C.text }}>
                  {aktiv ? '✓ ' : '＋ '}{p}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <button style={{ ...styles.primaryBtn, opacity: busy || auswahl.size === 0 ? 0.6 : 1 }} disabled={busy || auswahl.size === 0}
          onClick={() => punkteEinfuegen(bibArt, Array.from(auswahl))}>
          Ausgewählte hinzufügen ({auswahl.size})
        </button>
        <button style={{ ...styles.ghostBtn, opacity: busy || auswahl.size === 0 ? 0.6 : 1 }} disabled={busy || auswahl.size === 0}
          onClick={alsVorlageSpeichern}>
          Als Vorlage speichern
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Modal: Neu anlegen
// ============================================================
function NeuModal({ tab, onClose, onSaved }: { tab: Tab; onClose: () => void; onSaved: () => void }) {
  const istMA = tab === 'mitarbeiter';
  const [vorname, setVorname] = useState(''); const [nachname, setNachname] = useState('');
  const [email, setEmail] = useState(''); const [telefon, setTelefon] = useState('');
  const [position, setPosition] = useState(''); const [quelle, setQuelle] = useState('');
  const [status, setStatus] = useState(istMA ? 'aktiv' : 'neu');
  const [saving, setSaving] = useState(false); const [err, setErr] = useState<string | null>(null);

  async function speichern() {
    setErr(null);
    if (!vorname.trim() || !nachname.trim()) { setErr('Vor- und Nachname sind Pflicht.'); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setErr('Keine aktive Sitzung gefunden. Bitte neu einloggen.'); setSaving(false); return; }
      if (istMA) {
        const { error } = await supabase.from('mitarbeiter').insert({ owner_user_id: ownerId, vorname: vorname.trim(), nachname: nachname.trim(), email: email.trim() || null, telefon: telefon.trim() || null, position: position.trim() || null, status });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bewerber').insert({ owner_user_id: ownerId, vorname: vorname.trim(), nachname: nachname.trim(), email: email.trim() || null, telefon: telefon.trim() || null, position: position.trim() || null, quelle: quelle.trim() || null, status });
        if (error) throw error;
      }
      onSaved();
    } catch (e: unknown) { setErr('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{istMA ? 'Neuer Mitarbeiter' : 'Neuer Bewerber'}</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div style={styles.formGrid}>
          <Field label="Vorname *"><input style={styles.input} value={vorname} onChange={(e) => setVorname(e.target.value)} /></Field>
          <Field label="Nachname *"><input style={styles.input} value={nachname} onChange={(e) => setNachname(e.target.value)} /></Field>
          <Field label="E-Mail"><input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Telefon"><input style={styles.input} value={telefon} onChange={(e) => setTelefon(e.target.value)} /></Field>
          <Field label={istMA ? 'Position' : 'Beworben als'}><input style={styles.input} value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
          {!istMA && <Field label="Quelle"><input style={styles.input} placeholder="z. B. Website, Empfehlung" value={quelle} onChange={(e) => setQuelle(e.target.value)} /></Field>}
          <Field label="Status">
            <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {(istMA ? MA_STATUS : BW_STATUS).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
        </div>
        {err && <div style={styles.formError}>{err}</div>}
        <div style={styles.modalFoot}>
          <button style={styles.ghostBtn} onClick={onClose} disabled={saving}>Abbrechen</button>
          <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={speichern} disabled={saving}>{saving ? 'Speichert …' : 'Speichern'}</button>
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
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: col, background: `${col}1A`, border: `1px solid ${col}40` }}>{STATUS_LABEL[status] || status}</span>;
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: accent ? `${accent}12` : C.cardBg, border: `1px solid ${accent ? `${accent}33` : C.line}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? C.text }}>{value}</div>
    </div>
  );
}
function KontaktZelle({ email, telefon }: { email: string | null; telefon: string | null }) {
  if (!email && !telefon) return <Dim>—</Dim>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }} onClick={(e) => e.stopPropagation()}>
      {email && <a href={`mailto:${email}`} style={styles.link}>{email}</a>}
      {telefon && <a href={`tel:${telefon}`} style={styles.link}>{telefon}</a>}
    </div>
  );
}
function EmptyState({ title, text, onAdd, addLabel }: { title: string; text: string; onAdd: () => void; addLabel: string }) {
  return (
    <div style={styles.empty}>
      <div style={styles.emptyTitle}>{title}</div>
      <div style={styles.emptyText}>{text}</div>
      <button style={styles.primaryBtn} onClick={onAdd}>+ {addLabel}</button>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={styles.field}><span style={styles.fieldLabel}>{label}</span>{children}</label>;
}
function ZugangZeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: C.textDim, width: 120, flexShrink: 0 }}>{label}</span>
      <code style={{ fontSize: 13, color: C.text, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 8px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wert}</code>
      <button style={styles.miniBtn} onClick={() => navigator.clipboard?.writeText(wert)}>Kopieren</button>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th style={styles.th}>{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td style={styles.td}>{children}</td>; }
function Dim({ children }: { children: React.ReactNode }) { return <span style={{ color: C.textDim }}>{children}</span>; }

// ============================================================
// Styles
// ============================================================
const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '32px 28px 64px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 24 },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  eyebrowSmall: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 4 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 34, fontWeight: 700, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 0', fontSize: 15 },
  primaryBtn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'opacity .15s ease' },
  hireBtn: { background: 'rgba(76,175,125,0.14)', color: C.green, border: `1px solid rgba(76,175,125,0.4)`, borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  hiredHint: { color: C.green, fontSize: 13, fontWeight: 600, alignSelf: 'center' },
  inviteBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.4)`, borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  invitedHint: { color: C.cyan, fontSize: 13, fontWeight: 600, alignSelf: 'center' },
  resetBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  zugangBox: { marginTop: 16, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 12, padding: 16 },
  glockeBtn: { position: 'relative', background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 12px', fontSize: 18, cursor: 'pointer', lineHeight: 1 },
  kalenderLink: { background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 600, color: C.text, textDecoration: 'none', whiteSpace: 'nowrap' },
  blSelect: { background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', outline: 'none' },
  glockeBadge: { position: 'absolute', top: -6, right: -6, background: C.danger, color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' },
  glockePanel: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxHeight: 420, overflowY: 'auto', background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 50, padding: 8 },
  glockeHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 10px', borderBottom: `1px solid ${C.line}` },
  glockeMarkAll: { background: 'transparent', color: C.cyan, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  glockeEmpty: { padding: 20, textAlign: 'center', color: C.textDim, fontSize: 13 },
  glockeItem: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  glockeDot: { width: 10, height: 10, borderRadius: 999, background: C.cyan, border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 4 },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  miniBtn: { background: 'transparent', color: C.cyan, border: `1px solid rgba(0,229,255,0.35)`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  tabs: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 },
  tabBtn: { border: '1px solid', borderRadius: 999, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .15s ease' },
  countPill: { marginLeft: 4, fontSize: 13, color: C.textDim, background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 999, padding: '4px 12px', fontWeight: 600 },
  card: { background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' },
  stateBox: { padding: 40, textAlign: 'center', color: C.textDim, fontSize: 15 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '14px 18px', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.textDim, fontWeight: 600, borderBottom: `1px solid ${C.line}` },
  td: { padding: '14px 18px', color: C.text, verticalAlign: 'top' },
  name: { fontWeight: 600, color: C.text },
  link: { color: C.cyan, textDecoration: 'none', fontSize: 13 },
  empty: { padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  emptyTitle: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.text },
  emptyText: { color: C.textDim, fontSize: 15, marginBottom: 10 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 },
  modal: { width: '100%', maxWidth: 540, background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, margin: 0, color: C.text },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },

  drawer: { width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden' },
  drawerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '22px 24px 0' },
  drawerTitle: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, margin: 0, color: C.text },
  detailTabs: { display: 'flex', padding: '8px 24px 0', borderBottom: `1px solid ${C.line}`, overflowX: 'auto' },
  drawerBody: { padding: 24, overflowY: 'auto' },
  drawerActions: { display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' },
  closeBtn: { background: 'transparent', border: 'none', color: C.textDim, fontSize: 26, lineHeight: 1, cursor: 'pointer' },

  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 12, color: C.textDim, fontWeight: 600, letterSpacing: 0.4 },
  input: { background: C.inputBg, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', color: C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box' },
  sectionDivider: { margin: '22px 0 12px', paddingTop: 16, borderTop: `1px solid ${C.line}`, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.gold, fontWeight: 700 },

  infoMsg: { marginTop: 14, color: C.text, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px' },
  formError: { marginTop: 14, color: C.danger, fontSize: 13, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '10px 12px' },
  listHint: { color: C.textDim, fontSize: 14, padding: '12px 0' },

  miniForm: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  checkLabel: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: C.textDim },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 18 },

  docRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 8 },
  docName: { fontWeight: 600, color: C.text, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  docMeta: { color: C.textDim, fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  katBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: C.gold, background: 'rgba(201,168,76,0.12)', border: `1px solid ${C.line}` },
};
