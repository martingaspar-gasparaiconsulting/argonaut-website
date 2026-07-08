'use client';

// ============================================================
// ARGONAUT OS · Modul D+ · Block D+.6 · AnhaengeBox (wiederverwendbar)
// Upload + Liste von Anhängen — funktioniert für Fahrzeug (HU-Bericht) UND
// Auftrag (Fotos vom Besuch). Bucket 'werkstatt-anhaenge' (privat, signierte URLs).
// Owner-Ordner-Struktur: {uid}/{bezug}/{bezugId}/{zeit}-{dateiname}
// Pfad: app/dashboard/_components/AnhaengeBox.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const BUCKET = 'werkstatt-anhaenge';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ERLAUBTE_TYPEN = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
];

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

const KATEGORIEN = ['HU/TÜV', 'Foto', 'Rechnung', 'Sonstiges'];

type AnhangRow = {
  id: string; owner_user_id: string;
  fahrzeug_id: string | null; auftrag_id: string | null;
  kategorie: string; dateiname: string; storage_pfad: string;
  groesse_bytes: number | null; mime_typ: string | null; hochgeladen_am: string;
};

type Props = {
  /** 'fahrzeug' oder 'auftrag' — bestimmt Ordner + Spalte */
  bezug: 'fahrzeug' | 'auftrag';
  bezugId: string;
  /** optionaler Titel über der Box */
  titel?: string;
};

function bytesText(b: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function istBild(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}

export default function AnhaengeBox({ bezug, bezugId, titel }: Props) {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<AnhangRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kategorie, setKategorie] = useState(bezug === 'fahrzeug' ? 'HU/TÜV' : 'Foto');
  const [laedtHoch, setLaedtHoch] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUid(data?.user?.id ?? null);
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!uid || !bezugId) return;
    setLaden(true); setFehler(null);
    try {
      const spalte = bezug === 'fahrzeug' ? 'fahrzeug_id' : 'auftrag_id';
      const { data, error } = await supabase.from('werkstatt_anhaenge')
        .select('*').eq('owner_user_id', uid).eq(spalte, bezugId)
        .order('hochgeladen_am', { ascending: false });
      if (error) throw error;
      setListe((data as AnhangRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Anhänge konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid, bezug, bezugId]);

  useEffect(() => { void laden_(); }, [laden_]);

  async function datei(f: File | null) {
    if (!f || !uid) return;
    setFehler(null);
    if (f.size > MAX_BYTES) { setFehler('Datei zu groß (max. 10 MB).'); return; }
    if (f.type && !ERLAUBTE_TYPEN.includes(f.type)) {
      setFehler('Dateityp nicht erlaubt. Erlaubt: PDF, Bilder, Word/Excel, Text.');
      return;
    }
    setLaedtHoch(true);
    try {
      const sicher = f.name.replace(/[^\w.\-]+/g, '_');
      const pfad = `${uid}/${bezug}/${bezugId}/${Date.now()}-${sicher}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(pfad, f, {
        cacheControl: '3600', upsert: false, contentType: f.type || undefined,
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from('werkstatt_anhaenge').insert({
        owner_user_id: uid,
        fahrzeug_id: bezug === 'fahrzeug' ? bezugId : null,
        auftrag_id: bezug === 'auftrag' ? bezugId : null,
        kategorie, dateiname: f.name, storage_pfad: pfad,
        groesse_bytes: f.size, mime_typ: f.type || null,
      });
      if (dbErr) throw dbErr;
      await laden_();
    } catch (e: unknown) {
      setFehler('Upload fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaedtHoch(false); }
  }

  async function oeffnen(a: AnhangRow) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_pfad, 3600);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
    } catch (e: unknown) {
      setFehler('Datei konnte nicht geöffnet werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  async function entfernen(a: AnhangRow) {
    if (!window.confirm(`Anhang "${a.dateiname}" wirklich löschen?`)) return;
    try {
      await supabase.storage.from(BUCKET).remove([a.storage_pfad]);
      const { error } = await supabase.from('werkstatt_anhaenge').delete().eq('id', a.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  return (
    <div style={styles.box}>
      <div style={styles.kopf}>
        <span style={styles.titel}>📎 {titel || 'Anhänge'}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select style={styles.select} value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
            {KATEGORIEN.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <label style={{ ...styles.uploadBtn, opacity: laedtHoch ? 0.6 : 1 }}>
            {laedtHoch ? 'Lädt hoch …' : '+ Datei'}
            <input type="file" style={{ display: 'none' }} disabled={laedtHoch}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => { datei(e.target.files ? e.target.files[0] : null); e.currentTarget.value = ''; }} />
          </label>
        </div>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : liste.length === 0 ? (
        <div style={styles.hint}>Noch keine Anhänge. Lade z. B. den HU-Bericht oder ein Foto hoch.</div>
      ) : (
        <div style={styles.grid}>
          {liste.map((a) => (
            <div key={a.id} style={styles.karte}>
              <button onClick={() => oeffnen(a)} style={styles.vorschau} title="Öffnen">
                {istBild(a.mime_typ) ? <span style={{ fontSize: 22 }}>🖼️</span> : <span style={{ fontSize: 22 }}>📄</span>}
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.dateiname}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>{a.kategorie}{a.groesse_bytes ? ` · ${bytesText(a.groesse_bytes)}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => oeffnen(a)} style={styles.miniBtn}>Öffnen</button>
                <button onClick={() => entfernen(a)} style={styles.miniBtnDanger}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  box: { marginTop: 4 },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  titel: { fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: 1 },
  select: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' },
  uploadBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 },
  karte: { display: 'flex', alignItems: 'center', gap: 10, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px' },
  vorschau: { width: 40, height: 40, borderRadius: 8, background: C.navy2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },

  miniBtn: { background: 'transparent', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 7, padding: '5px 9px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnDanger: { background: 'transparent', color: C.danger, border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 7, padding: '5px 9px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },

  hint: { color: C.textDim, fontSize: 13, padding: '8px 0' },
  err: { color: C.danger, fontSize: 13, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 8, padding: '9px 12px', marginBottom: 10 },
};
