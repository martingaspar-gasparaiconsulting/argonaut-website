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
  urlaubsanspruch_tage: number | null;
};
type Bewerber = {
  id: string; vorname: string; nachname: string; email: string | null; telefon: string | null;
  position: string | null; quelle: string | null; status: string; bewerbungsdatum: string | null; mitarbeiter_id: string | null;
};
type HrDokument = { id: string; dateiname: string; storage_pfad: string; groesse_bytes: number | null; mime_type: string | null; kategorie: string; hochgeladen_am: string };
type Abwesenheit = { id: string; typ: string; von: string; bis: string; tage: number | null; status: string; au_vorhanden: boolean; notiz: string | null };
type Schulung = { id: string; titel: string; kategorie: string; absolviert_am: string | null; gueltig_bis: string | null; status: string; notiz: string | null };

type Tab = 'mitarbeiter' | 'bewerber';
type Selected = { typ: Tab; id: string } | null;

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
function tageZwischen(von: string, bis: string): number {
  try {
    const a = new Date(von); const b = new Date(bis);
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    return diff > 0 ? diff : 1;
  } catch { return 1; }
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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (tab === 'mitarbeiter') {
        const { data, error } = await supabase.from('mitarbeiter')
          .select('id,vorname,nachname,email,telefon,position,status,eintrittsdatum,geburtsdatum,adresse,sv_nummer,steuer_id,iban,notfall_kontakt,urlaubsanspruch_tage')
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
        <button style={styles.primaryBtn} onClick={() => setModalOpen(true)}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}>
          + {tab === 'mitarbeiter' ? 'Mitarbeiter anlegen' : 'Bewerber anlegen'}
        </button>
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
      {selectedMA && <DetailDrawer typ="mitarbeiter" ma={selectedMA} onClose={() => setSelected(null)} onChanged={load} />}
      {selectedBW && <DetailDrawer typ="bewerber" bw={selectedBW} onClose={() => setSelected(null)} onChanged={load} />}
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
type DetailTab = 'stamm' | 'docs' | 'abw' | 'schul' | 'auswertung';

function DetailDrawer(props: { typ: Tab; ma?: Mitarbeiter; bw?: Bewerber; onClose: () => void; onChanged: () => void }) {
  const { typ, ma, bw, onClose, onChanged } = props;
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

  // Datensätze
  const [docs, setDocs] = useState<HrDokument[]>([]);
  const [abw, setAbw] = useState<Abwesenheit[]>([]);
  const [schul, setSchul] = useState<Schulung[]>([]);
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

  useEffect(() => {
    setListMsg(null);
    if (detailTab === 'docs') ladeDocs();
    if (detailTab === 'abw') ladeAbw();
    if (detailTab === 'schul') ladeSchul();
    if (detailTab === 'auswertung') { ladeAbw(); ladeSchul(); }
  }, [detailTab, ladeDocs, ladeAbw, ladeSchul]);

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
              </div>
            </>
          )}

          {detailTab === 'docs' && (
            <DokumenteTab typ={typ} id={id} docs={docs} loading={listLoading} msg={listMsg} setMsg={setListMsg} reload={ladeDocs} />
          )}
          {detailTab === 'abw' && (
            <AbwesenheitenTab id={id} rows={abw} loading={listLoading} msg={listMsg} setMsg={setListMsg} reload={ladeAbw} urlaubsanspruch={parseInt(urlaubsanspruch, 10) || 30} />
          )}
          {detailTab === 'schul' && (
            <SchulungenTab id={id} rows={schul} loading={listLoading} msg={listMsg} setMsg={setListMsg} reload={ladeSchul} />
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
function AbwesenheitenTab({ id, rows, loading, msg, setMsg, reload, urlaubsanspruch }: {
  id: string; rows: Abwesenheit[]; loading: boolean; msg: string | null; setMsg: (s: string | null) => void; reload: () => void; urlaubsanspruch: number;
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
        owner_user_id: ownerId, mitarbeiter_id: id, typ, von, bis, tage: tageZwischen(von, bis),
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
// TAB: Auswertung (regelbasiert, kein API-Call)
// ============================================================
function AuswertungTab({ abw, schul, loading, urlaubsanspruch, stammVollstaendig }: {
  abw: Abwesenheit[]; schul: Schulung[]; loading: boolean; urlaubsanspruch: number; stammVollstaendig: boolean;
}) {
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
    </>
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
