'use client';

// ============================================================
// ARGONAUT OS · Paket 278 · K18 Verlauf eines Partner-Auftrags
// Gemeinsam für beide Seiten (Handelsakte des Auftraggebers und Seite
// „Partner-Netzwerk" des Partners). Einträge sind nicht änderbar.
// Fotos: im Browser verkleinern -> /api/partner/foto (Server prüft per
// p278_ablage_ziel) -> rpc p278_eintrag mit den Pfaden.
// ============================================================

import { useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { verkleinereBild } from '@/lib/bildKlein';
import { eintragPruefen, fehlerText, FOTO_MAX_BYTES, FOTOS_JE_EINTRAG } from '@/lib/partnerNetzwerk';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', bad: '#E06666', info: '#5FA8E8' };

export type VerlaufEintrag = { id: string; seite: string; von_name: string | null; art: string; text: string | null; fotos: number; erstellt_am: string };

function zeit(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}

// Paket 279: Gast-Link nutzt dieselbe Ansicht mit eigener Tür (bildUrl, hochladen, speichern).
type GastWeg = {
  bildUrl: (eintrag: string, nr: number) => string;
  hochladen: (datei: Blob, name: string) => Promise<string>;
  speichern: (text: string | null, pfade: string[]) => Promise<void>;
};

export default function PartnerVerlauf({ auftragId, eintraege, eigeneSeite, darfSchreiben, onNeu, gast }: {
  auftragId: string; eintraege: VerlaufEintrag[]; eigeneSeite: 'auftraggeber' | 'partner'; darfSchreiben: boolean; onNeu: () => void; gast?: GastWeg;
}) {
  const bild = (e: string, i: number) => (gast ? gast.bildUrl(e, i) : `/api/partner/foto?e=${e}&i=${i}`);
  const [text, setText] = useState('');
  const [dateien, setDateien] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [schluessel, setSchluessel] = useState(0);

  async function senden() {
    const p = eintragPruefen(text, dateien);
    if (!p.ok) { setMeldung({ ok: false, text: p.fehler }); return; }
    setBusy(true); setMeldung(null);
    try {
      const pfade: string[] = [];
      for (const d of dateien) {
        const klein = await verkleinereBild(d, 1600, 0.82);
        if (klein.size > FOTO_MAX_BYTES) throw new Error(`„${d.name}" ist zu groß (höchstens 4 MB).`);
        if (gast) { pfade.push(await gast.hochladen(klein, d.name)); continue; }
        const fd = new FormData();
        fd.append('auftrag', auftragId);
        fd.append('datei', klein, d.name);
        const r = await fetch('/api/partner/foto', { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || typeof j?.pfad !== 'string') throw new Error(j?.error || 'Foto konnte nicht hochgeladen werden.');
        pfade.push(j.pfad);
      }
      if (gast) await gast.speichern(p.text, pfade);
      else {
        const { error } = await supabase.rpc('p278_eintrag', { p_auftrag: auftragId, p_text: p.text, p_fotos: pfade });
        if (error) throw new Error(fehlerText(error));
      }
      setText(''); setDateien([]); setSchluessel((x) => x + 1);
      setMeldung({ ok: true, text: 'Eintrag gespeichert. Er kann nicht mehr geändert werden.' });
      onNeu();
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler beim Speichern.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={v.titel}>Verlauf</div>
      {eintraege.length === 0 && <div style={v.dim}>Noch keine Einträge.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {eintraege.map((e) => {
          const eigen = e.seite === eigeneSeite;
          return (
            <div key={e.id} style={{ ...v.eintrag, borderLeft: `3px solid ${e.art === 'status' ? C.info : eigen ? C.gold : C.ok}` }}>
              <div style={v.kopf}>
                <span style={{ fontWeight: 700 }}>{e.von_name || (e.seite === 'partner' ? 'Partner' : 'Auftraggeber')}</span>
                <span style={v.dim}>{zeit(e.erstellt_am)}</span>
              </div>
              {e.text && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: e.art === 'status' ? C.dim : C.text }}>{e.text}</div>}
              {e.fotos > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {Array.from({ length: e.fotos }, (_, i) => (
                    <a key={i} href={bild(e.id, i + 1)} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bild(e.id, i + 1)} alt={`Foto ${i + 1}`} style={v.bild} loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {darfSchreiben && (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          <textarea style={{ ...v.inp, minHeight: 64 }} value={text} maxLength={2000} placeholder="Notiz, Befund, Rückfrage …" onChange={(x) => setText(x.target.value)} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input key={schluessel} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ fontSize: 12.5, color: C.dim, maxWidth: '100%' }}
              onChange={(x) => setDateien(Array.from(x.target.files ?? []).slice(0, FOTOS_JE_EINTRAG))} />
            <button style={v.gold} disabled={busy} onClick={() => void senden()}>{busy ? 'Speichert …' : 'Eintrag speichern'}</button>
          </div>
          <div style={v.dim}>Einträge und Fotos bleiben unveränderlich im Auftrag — beide Seiten sehen sie, solange der Auftrag läuft.</div>
          {meldung && <div style={{ fontSize: 13, color: meldung.ok ? C.ok : C.bad }}>{meldung.text}</div>}
        </div>
      )}
    </div>
  );
}

const v: Record<string, CSSProperties> = {
  titel: { fontSize: 12, fontWeight: 800, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.6, margin: '6px 0' },
  dim: { color: C.dim, fontSize: 12.5 },
  eintrag: { background: C.navy, borderRadius: 8, padding: '8px 10px', minWidth: 0 },
  kopf: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 2 },
  bild: { width: 84, height: 64, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}`, background: C.navy2 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0, fontFamily: 'inherit' },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
};
