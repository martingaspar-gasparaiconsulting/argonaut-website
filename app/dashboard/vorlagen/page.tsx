'use client';
// ============================================================
// ARGONAUT OS · Vorlagen-Sammelbecken (Block D · Pool)
// Zentraler Vorlagen-Pool: ein Ort, aus dem jede Filiale zieht. „empfohlen"-
// Kennzeichnung; Chef + Filialleiter verwalten, alle Mitarbeiter nutzen.
// Filial-Sichtbarkeit FAIL-OPEN (zentral = überall; Filiale = zusätzlich diese).
// ============================================================
import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort, standortOrFilter } from '@/lib/standortDaten';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)', inputBg: 'rgba(255,255,255,0.05)', danger: '#E06666',
};

type Rolle = 'chef' | 'leitung' | 'mitarbeiter';
type Standort = { id: string; name: string; ist_hauptsitz: boolean };
type Vorlage = {
  id: string; kategorie: string; titel: string; inhalt: string | null;
  empfohlen: boolean; standort_id: string | null; erstellt_von: string | null;
  erstellt_am: string; aktualisiert_am: string;
};

const KATEGORIEN: { key: string; label: string }[] = [
  { key: 'text', label: 'Textbaustein' },
  { key: 'email', label: 'E-Mail' },
  { key: 'angebot', label: 'Angebot' },
  { key: 'projekt', label: 'Projekt' },
  { key: 'checkliste', label: 'Checkliste' },
  { key: 'dokument', label: 'Dokument' },
  { key: 'sonstiges', label: 'Sonstiges' },
];
const KAT_LABEL: Record<string, string> = Object.fromEntries(KATEGORIEN.map((k) => [k.key, k.label]));

export default function VorlagenPoolPage() {
  const [rolle, setRolle] = useState<Rolle>('mitarbeiter');
  const [chefId, setChefId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [rows, setRows] = useState<Vorlage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [katFilter, setKatFilter] = useState<string>('alle');
  const [modal, setModal] = useState<Vorlage | 'neu' | null>(null);
  const [importOffen, setImportOffen] = useState(false);
  const [kopiert, setKopiert] = useState<string | null>(null);

  const darfVerwalten = rolle === 'chef' || rolle === 'leitung';

  // Wer bin ich? Chef = kein mitarbeiter-Eintrag; Leitung = gesetzte leitungsrolle.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUid(user?.id ?? null);
      if (!user) return;
      const { data: ma } = await supabase.from('mitarbeiter')
        .select('id,leitungsrolle,owner_user_id')
        .eq('auth_user_id', user.id).maybeSingle();
      if (!ma) { setRolle('chef'); setChefId(user.id); return; }
      const m = ma as { leitungsrolle: string | null; owner_user_id: string };
      setChefId(m.owner_user_id);
      setRolle(m.leitungsrolle && m.leitungsrolle.trim() ? 'leitung' : 'mitarbeiter');
    })();
  }, []);

  // Filialen (für Ziel-Auswahl + Anzeige).
  useEffect(() => {
    supabase.from('standorte').select('id,name,ist_hauptsitz').eq('aktiv', true)
      .order('ist_hauptsitz', { ascending: false }).order('name', { ascending: true })
      .then(({ data }) => setStandorte((data as Standort[]) ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const sid = konkreterStandort(leseStandortCookie());
      let q = supabase.from('vorlage_pool')
        .select('id,kategorie,titel,inhalt,empfohlen,standort_id,erstellt_von,erstellt_am,aktualisiert_am');
      if (sid) q = q.or(standortOrFilter(sid));
      const { data, error } = await q
        .order('empfohlen', { ascending: false })
        .order('titel', { ascending: true });
      if (error) throw error;
      setRows((data as Vorlage[]) ?? []);
    } catch (e: unknown) {
      setError('Vorlagen konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const standortName = (id: string | null): string => id ? (standorte.find((s) => s.id === id)?.name ?? 'Filiale') : 'Zentral';

  const gefiltert = rows.filter((r) => {
    if (katFilter !== 'alle' && r.kategorie !== katFilter) return false;
    if (suche.trim()) {
      const q = suche.trim().toLowerCase();
      if (!(`${r.titel} ${r.inhalt ?? ''}`.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  async function kopieren(v: Vorlage) {
    try { await navigator.clipboard?.writeText(v.inhalt ?? ''); setKopiert(v.id); setTimeout(() => setKopiert((k) => (k === v.id ? null : k)), 1600); } catch { /* ignore */ }
  }

  async function empfehlenToggle(v: Vorlage) {
    const { error } = await supabase.from('vorlage_pool')
      .update({ empfohlen: !v.empfohlen, aktualisiert_am: new Date().toISOString() }).eq('id', v.id);
    if (!error) load();
  }

  async function loeschen(v: Vorlage) {
    if (!window.confirm(`Vorlage „${v.titel}" wirklich löschen?`)) return;
    const { error } = await supabase.from('vorlage_pool').delete().eq('id', v.id);
    if (!error) load();
  }

  const empfohlenCount = rows.filter((r) => r.empfohlen).length;
  const vorhandeneKeys = useMemo(() => new Set(rows.map((r) => `${r.kategorie}|${r.titel.trim().toLowerCase()}`)), [rows]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>ARGONAUT OS · Multistandort</div>
          <h1 style={styles.h1}>Vorlagen-Sammelbecken</h1>
          <p style={styles.sub}>Ein zentraler Pool, aus dem jede Filiale zieht. {darfVerwalten ? 'Du kannst Vorlagen anlegen und als „empfohlen" markieren.' : 'Vom Chef/der Leitung gepflegt — hier findest du die empfohlenen Vorlagen.'}</p>
        </div>
        {darfVerwalten && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={styles.ghostBtn} onClick={() => setImportOffen(true)}>⇩ Aus Modulen importieren</button>
            <button style={styles.primaryBtn} onClick={() => setModal('neu')}>＋ Neue Vorlage</button>
          </div>
        )}
      </div>

      <div style={styles.toolbar}>
        <input style={styles.search} placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <select style={styles.select} value={katFilter} onChange={(e) => setKatFilter(e.target.value)}>
          <option value="alle">Alle Kategorien</option>
          {KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        <div style={styles.countPill}>{rows.length} Vorlagen · ⭐ {empfohlenCount}</div>
      </div>

      <div style={styles.card}>
        {loading && <div style={styles.stateBox}>Lädt …</div>}
        {!loading && error && (
          <div style={{ ...styles.stateBox, color: C.danger }}>{error}
            <div><button style={styles.ghostBtn} onClick={load}>Erneut versuchen</button></div>
          </div>
        )}
        {!loading && !error && gefiltert.length === 0 && (
          <div style={styles.stateBox}>
            {rows.length === 0 ? 'Noch keine Vorlagen im Pool.' : 'Keine Vorlage passt zur Suche.'}
            {darfVerwalten && rows.length === 0 && <div><button style={styles.ghostBtn} onClick={() => setModal('neu')}>Erste Vorlage anlegen</button></div>}
          </div>
        )}
        {!loading && !error && gefiltert.length > 0 && (
          <div style={styles.grid}>
            {gefiltert.map((v) => (
              <div key={v.id} style={{ ...styles.vCard, borderColor: v.empfohlen ? 'rgba(201,168,76,0.5)' : C.line }}>
                <div style={styles.vTop}>
                  <span style={styles.katBadge}>{KAT_LABEL[v.kategorie] || v.kategorie}</span>
                  {v.empfohlen && <span style={styles.empfBadge}>⭐ empfohlen</span>}
                  <span style={{ ...styles.filBadge, color: v.standort_id ? C.cyan : C.green, borderColor: v.standort_id ? 'rgba(0,229,255,0.35)' : 'rgba(76,175,125,0.35)' }}>
                    {v.standort_id ? `🏢 ${standortName(v.standort_id)}` : '🌐 Zentral'}
                  </span>
                </div>
                <div style={styles.vTitel}>{v.titel}</div>
                {v.inhalt && <div style={styles.vInhalt}>{v.inhalt}</div>}
                <div style={styles.vActions}>
                  <button style={styles.copyBtn} onClick={() => kopieren(v)}>{kopiert === v.id ? '✓ Kopiert' : '⧉ Kopieren'}</button>
                  {darfVerwalten && (
                    <>
                      <button style={styles.iconBtn} title="Bearbeiten" onClick={() => setModal(v)}>✏️</button>
                      <button style={styles.iconBtn} title={v.empfohlen ? 'Empfehlung entfernen' : 'Als empfohlen markieren'} onClick={() => empfehlenToggle(v)}>{v.empfohlen ? '☆' : '⭐'}</button>
                      <button style={{ ...styles.iconBtn, color: C.danger }} title="Löschen" onClick={() => loeschen(v)}>🗑️</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && darfVerwalten && chefId && (
        <VorlageModal
          vorlage={modal === 'neu' ? null : modal}
          chefId={chefId}
          uid={uid}
          standorte={standorte}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}

      {importOffen && darfVerwalten && chefId && (
        <ImportModal
          chefId={chefId}
          uid={uid}
          vorhandene={vorhandeneKeys}
          onClose={() => setImportOffen(false)}
          onImported={() => { setImportOffen(false); load(); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Import bestehender Modul-Vorlagen in den Pool (nur lesen aus den Modulen,
// schreiben in vorlage_pool). Bestandsseiten bleiben unangetastet.
// ------------------------------------------------------------
type Kandidat = { key: string; quelleLabel: string; kategorie: string; titel: string; inhalt: string };

function ImportModal({ chefId, uid, vorhandene, onClose, onImported }: {
  chefId: string; uid: string | null; vorhandene: Set<string>; onClose: () => void; onImported: () => void;
}) {
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([]);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [pv, va, cv] = await Promise.all([
          supabase.from('projekt_vorlagen').select('id,name,beschreibung'),
          supabase.from('vorlagen_aufgaben').select('vorlage_id,titel,sortierung'),
          supabase.from('hr_checklisten_vorlagen').select('id,name,art,punkte'),
        ]);
        const aufgabenNach: Record<string, string[]> = {};
        ((va.data as { vorlage_id: string; titel: string; sortierung: number | null }[]) ?? [])
          .slice()
          .sort((a, b) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
          .forEach((a) => { (aufgabenNach[a.vorlage_id] ||= []).push(a.titel); });

        const liste: Kandidat[] = [];
        ((pv.data as { id: string; name: string; beschreibung: string | null }[]) ?? []).forEach((p) => {
          const aufg = aufgabenNach[p.id] ?? [];
          const teile: string[] = [];
          if (p.beschreibung && p.beschreibung.trim()) teile.push(p.beschreibung.trim());
          if (aufg.length) teile.push('Aufgaben:\n' + aufg.map((t) => '• ' + t).join('\n'));
          liste.push({ key: 'p_' + p.id, quelleLabel: 'Projekt-Vorlage', kategorie: 'projekt', titel: p.name || 'Ohne Titel', inhalt: teile.join('\n\n') });
        });
        ((cv.data as { id: string; name: string; art: string; punkte: string[] | null }[]) ?? []).forEach((c) => {
          const punkte = Array.isArray(c.punkte) ? c.punkte : [];
          liste.push({ key: 'c_' + c.id, quelleLabel: 'Checklisten-Vorlage' + (c.art ? ` (${c.art})` : ''), kategorie: 'checkliste', titel: c.name || 'Ohne Titel', inhalt: punkte.map((p) => '• ' + p).join('\n') });
        });
        setKandidaten(liste);
        // Standard: alles auswählen, was noch nicht im Pool ist.
        setAuswahl(new Set(liste.filter((k) => !vorhandene.has(`${k.kategorie}|${k.titel.trim().toLowerCase()}`)).map((k) => k.key)));
      } catch (e: unknown) {
        setMsg('Module konnten nicht gelesen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
      } finally { setLoading(false); }
    })();
  }, [vorhandene]);

  const toggle = (key: string) => setAuswahl((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const schonImPool = (k: Kandidat) => vorhandene.has(`${k.kategorie}|${k.titel.trim().toLowerCase()}`);

  async function uebernehmen() {
    const ausgewaehlt = kandidaten.filter((k) => auswahl.has(k.key));
    if (ausgewaehlt.length === 0) { setMsg('Bitte mindestens eine Vorlage auswählen.'); return; }
    setSaving(true); setMsg(null);
    try {
      const rows = ausgewaehlt.map((k) => ({
        owner_user_id: chefId, kategorie: k.kategorie, titel: k.titel, inhalt: k.inhalt || null,
        empfohlen: false, standort_id: null, erstellt_von: uid,
      }));
      const { error } = await supabase.from('vorlage_pool').insert(rows);
      if (error) throw error;
      onImported();
    } catch (e: unknown) {
      setMsg('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSaving(false); }
  }

  const anzahlNeu = kandidaten.filter((k) => !schonImPool(k)).length;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>Aus Modulen importieren</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1vw, 15px)' }}>
            Übernimmt bestehende Vorlagen aus Projekten und Personal-Checklisten in den zentralen Pool (als „Zentral"). Die Ursprungs-Vorlagen bleiben unverändert.
          </div>
          {loading && <div style={styles.stateBox}>Lädt …</div>}
          {!loading && kandidaten.length === 0 && <div style={styles.stateBox}>Keine Modul-Vorlagen gefunden.</div>}
          {!loading && kandidaten.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button style={styles.ghostBtn} onClick={() => setAuswahl(new Set(kandidaten.filter((k) => !schonImPool(k)).map((k) => k.key)))}>Alle neuen</button>
                <button style={styles.ghostBtn} onClick={() => setAuswahl(new Set())}>Keine</button>
                <span style={{ color: C.textDim, fontSize: 13 }}>{auswahl.size} ausgewählt · {anzahlNeu} neu von {kandidaten.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflow: 'auto' }}>
                {kandidaten.map((k) => {
                  const drin = schonImPool(k);
                  return (
                    <label key={k.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: 'rgba(255,255,255,0.02)', cursor: drin ? 'default' : 'pointer', opacity: drin ? 0.55 : 1 }}>
                      <input type="checkbox" checked={auswahl.has(k.key)} disabled={drin} onChange={() => toggle(k.key)} style={{ marginTop: 4 }} />
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={styles.katBadge}>{k.quelleLabel}</span>
                          {drin && <span style={{ ...styles.katBadge, color: C.green }}>schon im Pool</span>}
                        </span>
                        <span style={{ display: 'block', fontWeight: 700, color: C.text, marginTop: 4 }}>{k.titel}</span>
                        {k.inhalt && <span style={{ display: 'block', color: C.textDim, fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap', maxHeight: 54, overflow: 'hidden' }}>{k.inhalt}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          {msg && <div style={styles.infoMsg}>{msg}</div>}
        </div>
        <div style={styles.modalFoot}>
          <button style={styles.ghostBtn} onClick={onClose}>Abbrechen</button>
          <button style={{ ...styles.primaryBtn, opacity: saving || auswahl.size === 0 ? 0.6 : 1 }} onClick={uebernehmen} disabled={saving || auswahl.size === 0}>{saving ? 'Importiert …' : `${auswahl.size} übernehmen`}</button>
        </div>
      </div>
    </div>
  );
}

function VorlageModal({ vorlage, chefId, uid, standorte, onClose, onSaved }: {
  vorlage: Vorlage | null; chefId: string; uid: string | null; standorte: Standort[]; onClose: () => void; onSaved: () => void;
}) {
  const [kategorie, setKategorie] = useState(vorlage?.kategorie ?? 'text');
  const [titel, setTitel] = useState(vorlage?.titel ?? '');
  const [inhalt, setInhalt] = useState(vorlage?.inhalt ?? '');
  const [empfohlen, setEmpfohlen] = useState(vorlage?.empfohlen ?? false);
  const [standortId, setStandortId] = useState<string>(vorlage?.standort_id ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function speichern() {
    if (!titel.trim()) { setMsg('Bitte einen Titel angeben.'); return; }
    setSaving(true); setMsg(null);
    try {
      if (vorlage) {
        const { error } = await supabase.from('vorlage_pool').update({
          kategorie, titel: titel.trim(), inhalt: inhalt.trim() || null,
          empfohlen, standort_id: standortId || null, aktualisiert_am: new Date().toISOString(),
        }).eq('id', vorlage.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vorlage_pool').insert({
          owner_user_id: chefId, kategorie, titel: titel.trim(), inhalt: inhalt.trim() || null,
          empfohlen, standort_id: standortId || null, erstellt_von: uid,
        });
        if (error) throw error;
      }
      onSaved();
    } catch (e: unknown) {
      setMsg('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{vorlage ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.formRow}>
            <label style={styles.label}>Kategorie
              <select style={styles.input} value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
                {KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </label>
            <label style={styles.label}>Sichtbarkeit
              <select style={styles.input} value={standortId} onChange={(e) => setStandortId(e.target.value)}>
                <option value="">🌐 Zentral (alle Filialen)</option>
                {standorte.map((s) => <option key={s.id} value={s.id}>🏢 {s.name}{s.ist_hauptsitz ? ' (Hauptsitz)' : ''}</option>)}
              </select>
            </label>
          </div>
          <label style={styles.label}>Titel *
            <input style={styles.input} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Angebots-Anschreiben Standard" />
          </label>
          <label style={styles.label}>Inhalt
            <textarea style={{ ...styles.input, minHeight: 160, resize: 'vertical', fontFamily: 'inherit' }} value={inhalt} onChange={(e) => setInhalt(e.target.value)} placeholder="Der Vorlagen-Text, den die Filialen übernehmen …" />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: C.text }}>
            <input type="checkbox" checked={empfohlen} onChange={(e) => setEmpfohlen(e.target.checked)} />
            <span>⭐ Als <b>empfohlen</b> markieren (wird oben hervorgehoben)</span>
          </label>
          {msg && <div style={styles.infoMsg}>{msg}</div>}
        </div>
        <div style={styles.modalFoot}>
          <button style={styles.ghostBtn} onClick={onClose}>Abbrechen</button>
          <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={speichern} disabled={saving}>{saving ? 'Speichert …' : (vorlage ? 'Speichern' : 'Anlegen')}</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 'clamp(16px, 2.4vw, 40px)', color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 1400, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 },
  eyebrow: { fontSize: 'clamp(11px, 0.95vw, 14px)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)' },
  h1: { fontSize: 'clamp(26px, 3vw, 44px)', fontWeight: 800, margin: '4px 0 6px' },
  sub: { fontSize: 'clamp(13px, 1.15vw, 18px)', color: C.textDim, maxWidth: 720, margin: 0 },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 },
  search: { flex: '1 1 240px', minWidth: 180, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.inputBg, color: C.text, fontSize: 'clamp(13px, 1.1vw, 17px)', outline: 'none' },
  select: { padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.inputBg, color: C.text, fontSize: 'clamp(13px, 1.1vw, 17px)', outline: 'none' },
  countPill: { padding: '8px 14px', borderRadius: 999, background: 'rgba(201,168,76,0.12)', border: `1px solid ${C.line}`, color: C.gold, fontWeight: 700, fontSize: 'clamp(12px, 1vw, 15px)', whiteSpace: 'nowrap' },
  card: { background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 16, padding: 'clamp(12px, 1.6vw, 24px)' },
  stateBox: { padding: 40, textAlign: 'center', color: C.textDim, fontSize: 'clamp(14px, 1.2vw, 18px)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 },
  vCard: { background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  vTop: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  katBadge: { padding: '2px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: C.textDim, fontSize: 12, fontWeight: 700 },
  empfBadge: { padding: '2px 10px', borderRadius: 999, background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.4)', color: C.gold, fontSize: 12, fontWeight: 800 },
  filBadge: { padding: '2px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.03)', border: '1px solid', fontSize: 12, fontWeight: 700, marginLeft: 'auto' },
  vTitel: { fontSize: 'clamp(15px, 1.3vw, 20px)', fontWeight: 700, color: C.text },
  vInhalt: { fontSize: 'clamp(12px, 1.05vw, 15px)', color: C.textDim, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', lineHeight: 1.5, background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: '8px 10px' },
  vActions: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 'auto', flexWrap: 'wrap' },
  copyBtn: { padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'rgba(0,229,255,0.08)', color: C.cyan, fontWeight: 700, cursor: 'pointer', fontSize: 'clamp(12px, 1vw, 15px)' },
  iconBtn: { padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 15 },
  primaryBtn: { padding: '10px 18px', borderRadius: 10, border: 'none', background: C.gold, color: C.navy, fontWeight: 800, cursor: 'pointer', fontSize: 'clamp(13px, 1.1vw, 17px)', whiteSpace: 'nowrap' },
  ghostBtn: { padding: '9px 16px', borderRadius: 10, border: `1px solid ${C.line}`, background: 'transparent', color: C.text, cursor: 'pointer', fontWeight: 600, fontSize: 'clamp(13px, 1.05vw, 16px)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  modal: { width: 'min(640px, 100%)', maxHeight: '90vh', overflow: 'auto', background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, display: 'flex', flexDirection: 'column' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: `1px solid ${C.line}` },
  modalTitle: { margin: 0, fontSize: 'clamp(18px, 1.7vw, 26px)', fontWeight: 800 },
  closeBtn: { background: 'transparent', border: 'none', color: C.textDim, fontSize: 28, cursor: 'pointer', lineHeight: 1 },
  modalBody: { padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'clamp(12px, 1vw, 15px)', fontWeight: 600, color: C.textDim },
  input: { padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.inputBg, color: C.text, fontSize: 'clamp(13px, 1.1vw, 16px)', outline: 'none' },
  infoMsg: { padding: '10px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.1)', border: `1px solid ${C.line}`, color: C.gold, fontSize: 'clamp(12px, 1vw, 15px)' },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 22px', borderTop: `1px solid ${C.line}` },
};
