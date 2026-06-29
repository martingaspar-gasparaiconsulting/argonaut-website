'use client';

// ============================================================
// ARGONAUT OS · WELLE 1 · Modul 1: HR/Personal (Phase 1 + 2)
// Liste + Anlegen (Phase 1) · Detail-Drawer mit Stammdaten,
// Dokumenten-Upload und Bewerber→Mitarbeiter-Übernahme (Phase 2)
// Inline-Styles · Navy #0A1628 / Gold #C9A84C / Cyan #00e5ff
// Pfad im Repo: app/dashboard/personal/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties, ChangeEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// --- Supabase Browser-Client (Cookie-Session, wie der Rest der App) ---
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const BUCKET = 'hr-dokumente';

// --- Marken-Tokens ------------------------------------------
const C = {
  navy: '#0A1628',
  navySoft: '#0F2036',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  text: '#E8EDF4',
  textDim: '#8FA3BE',
  line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)',
  inputBg: 'rgba(255,255,255,0.05)',
  danger: '#E06666',
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
  mitarbeiter_id: string | null;
};

type HrDokument = {
  id: string;
  dateiname: string;
  storage_pfad: string;
  groesse_bytes: number | null;
  mime_type: string | null;
  hochgeladen_am: string;
};

type Tab = 'mitarbeiter' | 'bewerber';
type Selected = { typ: Tab; id: string } | null;

const MA_STATUS = ['aktiv', 'inaktiv', 'beurlaubt'];
const BW_STATUS = ['neu', 'in_pruefung', 'eingeladen', 'abgesagt', 'eingestellt'];

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv', inaktiv: 'Inaktiv', beurlaubt: 'Beurlaubt',
  neu: 'Neu', in_pruefung: 'In Prüfung', eingeladen: 'Eingeladen',
  abgesagt: 'Abgesagt', eingestellt: 'Eingestellt',
};

function statusColor(status: string): string {
  if (status === 'aktiv' || status === 'eingestellt') return C.green;
  if (status === 'abgesagt' || status === 'inaktiv') return C.danger;
  if (status === 'neu') return C.cyan;
  return C.gold;
}

function formatDate(d: string | null): React.ReactNode {
  if (!d) return <Dim>—</Dim>;
  try {
    return new Date(d).toLocaleDateString('de-DE');
  } catch {
    return d;
  }
}

function formatBytes(b: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
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
          .select('id,vorname,nachname,email,telefon,position,quelle,status,bewerbungsdatum,mitarbeiter_id')
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

  // ausgewählten Datensatz aus den geladenen Listen ziehen
  const selectedMA =
    selected?.typ === 'mitarbeiter' ? mitarbeiter.find((m) => m.id === selected.id) ?? null : null;
  const selectedBW =
    selected?.typ === 'bewerber' ? bewerber.find((b) => b.id === selected.id) ?? null : null;

  return (
    <div style={styles.page}>
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

      <div style={styles.tabs}>
        <TabButton active={tab === 'mitarbeiter'} onClick={() => setTab('mitarbeiter')}>Mitarbeiter</TabButton>
        <TabButton active={tab === 'bewerber'} onClick={() => setTab('bewerber')}>Bewerber</TabButton>
        <div style={styles.countPill}>{count}</div>
      </div>

      <div style={styles.card}>
        {loading && <div style={styles.stateBox}>Lädt …</div>}

        {!loading && error && (
          <div style={{ ...styles.stateBox, color: C.danger }}>
            {error}
            <div><button style={styles.ghostBtn} onClick={load}>Erneut versuchen</button></div>
          </div>
        )}

        {!loading && !error && tab === 'mitarbeiter' && (
          <MitarbeiterTabelle
            rows={mitarbeiter}
            onAdd={() => setModalOpen(true)}
            onSelect={(id) => setSelected({ typ: 'mitarbeiter', id })}
          />
        )}

        {!loading && !error && tab === 'bewerber' && (
          <BewerberTabelle
            rows={bewerber}
            onAdd={() => setModalOpen(true)}
            onSelect={(id) => setSelected({ typ: 'bewerber', id })}
          />
        )}
      </div>

      {modalOpen && (
        <NeuModal
          tab={tab}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}

      {selectedMA && (
        <DetailDrawer
          typ="mitarbeiter"
          ma={selectedMA}
          onClose={() => setSelected(null)}
          onChanged={() => load()}
        />
      )}
      {selectedBW && (
        <DetailDrawer
          typ="bewerber"
          bw={selectedBW}
          onClose={() => setSelected(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

// ============================================================
// Tab-Button
// ============================================================
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{ ...styles.tabBtn, color: active ? C.navy : C.textDim, background: active ? C.gold : 'transparent', borderColor: active ? C.gold : C.line }}
    >
      {children}
    </button>
  );
}

// ============================================================
// Tabelle: Mitarbeiter
// ============================================================
function MitarbeiterTabelle({ rows, onAdd, onSelect }: { rows: Mitarbeiter[]; onAdd: () => void; onSelect: (id: string) => void }) {
  if (rows.length === 0) {
    return <EmptyState title="Noch keine Mitarbeitenden" text="Leg die erste Person an — Name genügt, der Rest später." onAdd={onAdd} addLabel="Mitarbeiter anlegen" />;
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <Th>Name</Th><Th>Position</Th><Th>Kontakt</Th><Th>Eintritt</Th><Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <ClickRow key={m.id} onClick={() => onSelect(m.id)}>
            <Td><span style={styles.name}>{m.vorname} {m.nachname}</span></Td>
            <Td>{m.position || <Dim>—</Dim>}</Td>
            <Td><KontaktZelle email={m.email} telefon={m.telefon} /></Td>
            <Td>{formatDate(m.eintrittsdatum)}</Td>
            <Td><StatusBadge status={m.status} /></Td>
          </ClickRow>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================
// Tabelle: Bewerber
// ============================================================
function BewerberTabelle({ rows, onAdd, onSelect }: { rows: Bewerber[]; onAdd: () => void; onSelect: (id: string) => void }) {
  if (rows.length === 0) {
    return <EmptyState title="Noch keine Bewerbungen" text="Trag die erste Bewerbung ein, um die Pipeline zu starten." onAdd={onAdd} addLabel="Bewerber anlegen" />;
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <Th>Name</Th><Th>Beworben als</Th><Th>Kontakt</Th><Th>Quelle</Th><Th>Eingegangen</Th><Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <ClickRow key={b.id} onClick={() => onSelect(b.id)}>
            <Td><span style={styles.name}>{b.vorname} {b.nachname}</span></Td>
            <Td>{b.position || <Dim>—</Dim>}</Td>
            <Td><KontaktZelle email={b.email} telefon={b.telefon} /></Td>
            <Td>{b.quelle || <Dim>—</Dim>}</Td>
            <Td>{formatDate(b.bewerbungsdatum)}</Td>
            <Td><StatusBadge status={b.status} /></Td>
          </ClickRow>
        ))}
      </tbody>
    </table>
  );
}

// klickbare Zeile mit Hover
function ClickRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <tr
      onClick={onClick}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,168,76,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </tr>
  );
}

// ============================================================
// DETAIL-DRAWER (Phase 2)
// ============================================================
function DetailDrawer(props: {
  typ: Tab;
  ma?: Mitarbeiter;
  bw?: Bewerber;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { typ, ma, bw, onClose, onChanged } = props;
  const istMA = typ === 'mitarbeiter';
  const id = istMA ? ma!.id : bw!.id;

  const [detailTab, setDetailTab] = useState<'stamm' | 'docs'>('stamm');

  // Stammdaten-State
  const [vorname, setVorname] = useState(istMA ? ma!.vorname : bw!.vorname);
  const [nachname, setNachname] = useState(istMA ? ma!.nachname : bw!.nachname);
  const [email, setEmail] = useState((istMA ? ma!.email : bw!.email) ?? '');
  const [telefon, setTelefon] = useState((istMA ? ma!.telefon : bw!.telefon) ?? '');
  const [position, setPosition] = useState((istMA ? ma!.position : bw!.position) ?? '');
  const [quelle, setQuelle] = useState(istMA ? '' : bw!.quelle ?? '');
  const [status, setStatus] = useState(istMA ? ma!.status : bw!.status);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hiring, setHiring] = useState(false);

  // Dokumente
  const [docs, setDocs] = useState<HrDokument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docMsg, setDocMsg] = useState<string | null>(null);

  const ladeDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const spalte = istMA ? 'mitarbeiter_id' : 'bewerber_id';
      const { data, error } = await supabase
        .from('hr_dokumente')
        .select('id,dateiname,storage_pfad,groesse_bytes,mime_type,hochgeladen_am')
        .eq(spalte, id)
        .order('hochgeladen_am', { ascending: false });
      if (error) throw error;
      setDocs((data as HrDokument[]) ?? []);
    } catch (e: unknown) {
      setDocMsg('Dokumente konnten nicht geladen werden.');
    } finally {
      setDocsLoading(false);
    }
  }, [id, istMA]);

  useEffect(() => {
    if (detailTab === 'docs') ladeDocs();
  }, [detailTab, ladeDocs]);

  async function stammSpeichern() {
    setSaving(true);
    setMsg(null);
    try {
      if (!vorname.trim() || !nachname.trim()) {
        setMsg('Vor- und Nachname sind Pflicht.');
        setSaving(false);
        return;
      }
      const tabelle = istMA ? 'mitarbeiter' : 'bewerber';
      const patch: Record<string, string | null> = {
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim() || null,
        telefon: telefon.trim() || null,
        position: position.trim() || null,
        status,
      };
      if (!istMA) patch.quelle = quelle.trim() || null;

      const { error } = await supabase.from(tabelle).update(patch).eq('id', id);
      if (error) throw error;
      setMsg('Gespeichert.');
      onChanged();
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Unbekannter Fehler';
      setMsg('Speichern fehlgeschlagen: ' + m);
    } finally {
      setSaving(false);
    }
  }

  async function uebernehmen() {
    if (istMA) return;
    const ok = window.confirm(
      `${vorname} ${nachname} als Mitarbeiter übernehmen?\n\n` +
      'Die Person wird als aktiver Mitarbeiter angelegt und der Bewerber-Status auf „Eingestellt" gesetzt.'
    );
    if (!ok) return;

    setHiring(true);
    setMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setMsg('Keine aktive Sitzung gefunden.'); setHiring(false); return; }

      // 1) Mitarbeiter anlegen
      const { data: neu, error: insErr } = await supabase
        .from('mitarbeiter')
        .insert({
          owner_user_id: ownerId,
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          email: email.trim() || null,
          telefon: telefon.trim() || null,
          position: position.trim() || null,
          status: 'aktiv',
          eintrittsdatum: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();
      if (insErr) throw insErr;

      // 2) Bewerber verknüpfen + Status setzen (Nahtstelle mitarbeiter_id)
      const { error: updErr } = await supabase
        .from('bewerber')
        .update({ mitarbeiter_id: neu!.id, status: 'eingestellt' })
        .eq('id', id);
      if (updErr) throw updErr;

      setStatus('eingestellt');
      setMsg('Als Mitarbeiter übernommen.');
      onChanged();
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Unbekannter Fehler';
      setMsg('Übernahme fehlgeschlagen: ' + m);
    } finally {
      setHiring(false);
    }
  }

  async function dateiHochladen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDocMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setDocMsg('Keine aktive Sitzung gefunden.'); setUploading(false); return; }

      const sauber = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const pfad = `${ownerId}/${typ}/${id}/${Date.now()}-${sauber}`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(pfad, file);
      if (upErr) throw upErr;

      const zeile: Record<string, string | number | null> = {
        owner_user_id: ownerId,
        dateiname: file.name,
        storage_pfad: pfad,
        groesse_bytes: file.size,
        mime_type: file.type || null,
        bewerber_id: istMA ? null : id,
        mitarbeiter_id: istMA ? id : null,
      };
      const { error: insErr } = await supabase.from('hr_dokumente').insert(zeile);
      if (insErr) throw insErr;

      setDocMsg('Hochgeladen.');
      ladeDocs();
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setDocMsg('Upload fehlgeschlagen: ' + m);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function dokumentOeffnen(d: HrDokument) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_pfad, 60);
      if (error || !data) throw error ?? new Error('Kein Link');
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch {
      setDocMsg('Datei konnte nicht geöffnet werden.');
    }
  }

  async function dokumentLoeschen(d: HrDokument) {
    const ok = window.confirm(`„${d.dateiname}" löschen?`);
    if (!ok) return;
    try {
      await supabase.storage.from(BUCKET).remove([d.storage_pfad]);
      const { error } = await supabase.from('hr_dokumente').delete().eq('id', d.id);
      if (error) throw error;
      ladeDocs();
    } catch {
      setDocMsg('Löschen fehlgeschlagen.');
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Kopf */}
        <div style={styles.drawerHead}>
          <div>
            <div style={styles.eyebrowSmall}>{istMA ? 'Mitarbeiter' : 'Bewerber'}</div>
            <h2 style={styles.drawerTitle}>{vorname} {nachname}</h2>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Schließen">×</button>
        </div>

        {/* Detail-Tabs */}
        <div style={styles.detailTabs}>
          <DetailTabBtn active={detailTab === 'stamm'} onClick={() => setDetailTab('stamm')}>Stammdaten</DetailTabBtn>
          <DetailTabBtn active={detailTab === 'docs'} onClick={() => setDetailTab('docs')}>Dokumente</DetailTabBtn>
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
                    {(istMA ? MA_STATUS : BW_STATUS).map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
                  </select>
                </Field>
              </div>

              {msg && <div style={styles.infoMsg}>{msg}</div>}

              <div style={styles.drawerActions}>
                <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={stammSpeichern} disabled={saving}>
                  {saving ? 'Speichert …' : 'Speichern'}
                </button>
                {!istMA && status !== 'eingestellt' && (
                  <button
                    style={{ ...styles.hireBtn, opacity: hiring ? 0.6 : 1 }}
                    onClick={uebernehmen}
                    disabled={hiring}
                  >
                    {hiring ? 'Übernimmt …' : '✓ Als Mitarbeiter übernehmen'}
                  </button>
                )}
                {!istMA && status === 'eingestellt' && (
                  <span style={styles.hiredHint}>Bereits als Mitarbeiter übernommen</span>
                )}
              </div>
            </>
          )}

          {detailTab === 'docs' && (
            <>
              <label style={{ ...styles.uploadBox, opacity: uploading ? 0.6 : 1 }}>
                <input type="file" style={{ display: 'none' }} onChange={dateiHochladen} disabled={uploading} />
                <span style={{ fontSize: 22 }}>＋</span>
                <span style={{ fontWeight: 600 }}>{uploading ? 'Lädt hoch …' : 'Datei hochladen'}</span>
                <span style={{ fontSize: 12, color: C.textDim }}>PDF, Word, Bilder — z. B. Bewerbung, Lebenslauf, Vertrag</span>
              </label>

              {docMsg && <div style={styles.infoMsg}>{docMsg}</div>}

              <div style={{ marginTop: 16 }}>
                {docsLoading && <div style={{ color: C.textDim, fontSize: 14, padding: '8px 0' }}>Lädt …</div>}
                {!docsLoading && docs.length === 0 && (
                  <div style={{ color: C.textDim, fontSize: 14, padding: '12px 0' }}>Noch keine Dokumente hinterlegt.</div>
                )}
                {!docsLoading && docs.map((d) => (
                  <div key={d.id} style={styles.docRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.docName} title={d.dateiname}>{d.dateiname}</div>
                      <div style={styles.docMeta}>
                        {formatBytes(d.groesse_bytes)} · {new Date(d.hochgeladen_am).toLocaleDateString('de-DE')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button style={styles.docBtn} onClick={() => dokumentOeffnen(d)}>Öffnen</button>
                      <button style={{ ...styles.docBtn, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => dokumentLoeschen(d)}>Löschen</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '12px 4px', marginRight: 22, fontSize: 14, fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
        color: active ? C.gold : C.textDim,
        borderBottom: active ? `2px solid ${C.gold}` : '2px solid transparent',
      }}
    >
      {children}
    </button>
  );
}

// ============================================================
// Modal: Neu anlegen
// ============================================================
function NeuModal({ tab, onClose, onSaved }: { tab: Tab; onClose: () => void; onSaved: () => void }) {
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
    if (!vorname.trim() || !nachname.trim()) { setErr('Vor- und Nachname sind Pflicht.'); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) { setErr('Keine aktive Sitzung gefunden. Bitte neu einloggen.'); setSaving(false); return; }

      if (istMA) {
        const { error } = await supabase.from('mitarbeiter').insert({
          owner_user_id: ownerId, vorname: vorname.trim(), nachname: nachname.trim(),
          email: email.trim() || null, telefon: telefon.trim() || null, position: position.trim() || null, status,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bewerber').insert({
          owner_user_id: ownerId, vorname: vorname.trim(), nachname: nachname.trim(),
          email: email.trim() || null, telefon: telefon.trim() || null, position: position.trim() || null,
          quelle: quelle.trim() || null, status,
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
          <h2 style={styles.modalTitle}>{istMA ? 'Neuer Mitarbeiter' : 'Neuer Bewerber'}</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div style={styles.formGrid}>
          <Field label="Vorname *"><input style={styles.input} value={vorname} onChange={(e) => setVorname(e.target.value)} /></Field>
          <Field label="Nachname *"><input style={styles.input} value={nachname} onChange={(e) => setNachname(e.target.value)} /></Field>
          <Field label="E-Mail"><input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Telefon"><input style={styles.input} value={telefon} onChange={(e) => setTelefon(e.target.value)} /></Field>
          <Field label={istMA ? 'Position' : 'Beworben als'}><input style={styles.input} value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
          {!istMA && (
            <Field label="Quelle"><input style={styles.input} placeholder="z. B. Website, Empfehlung" value={quelle} onChange={(e) => setQuelle(e.target.value)} /></Field>
          )}
          <Field label="Status">
            <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {(istMA ? MA_STATUS : BW_STATUS).map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
            </select>
          </Field>
        </div>
        {err && <div style={styles.formError}>{err}</div>}
        <div style={styles.modalFoot}>
          <button style={styles.ghostBtn} onClick={onClose} disabled={saving}>Abbrechen</button>
          <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={speichern} disabled={saving}>
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
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: col, background: `${col}1A`, border: `1px solid ${col}40` }}>
      {STATUS_LABEL[status] || status}
    </span>
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
  return (<label style={styles.field}><span style={styles.fieldLabel}>{label}</span>{children}</label>);
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

  // Overlay (geteilt von Modal + Drawer)
  overlay: { position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 },

  // Modal
  modal: { width: '100%', maxWidth: 540, background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, margin: 0, color: C.text },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },

  // Drawer
  drawer: { width: '100%', maxWidth: 600, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden' },
  drawerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '22px 24px 0' },
  drawerTitle: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, margin: 0, color: C.text },
  detailTabs: { display: 'flex', padding: '8px 24px 0', borderBottom: `1px solid ${C.line}` },
  drawerBody: { padding: 24, overflowY: 'auto' },
  drawerActions: { display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' },

  closeBtn: { background: 'transparent', border: 'none', color: C.textDim, fontSize: 26, lineHeight: 1, cursor: 'pointer' },

  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 12, color: C.textDim, fontWeight: 600, letterSpacing: 0.4 },
  input: { background: C.inputBg, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', color: C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box' },

  infoMsg: { marginTop: 14, color: C.text, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px' },
  formError: { marginTop: 14, color: C.danger, fontSize: 13, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '10px 12px' },

  // Dokumente
  uploadBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '24px', border: `1.5px dashed ${C.line}`, borderRadius: 12, cursor: 'pointer', textAlign: 'center', color: C.text },
  docRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 8 },
  docName: { fontWeight: 600, color: C.text, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  docMeta: { color: C.textDim, fontSize: 12, marginTop: 2 },
  docBtn: { background: 'transparent', color: C.cyan, border: `1px solid rgba(0,229,255,0.35)`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
};
