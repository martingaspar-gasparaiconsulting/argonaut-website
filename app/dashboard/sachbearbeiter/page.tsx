'use client';

// ============================================================
// ARGONAUT OS · KI-Sachbearbeiter (Paket PA · B07 + Vorgangsliste)
//
// Oben: ein Schreiben lesen lassen — Foto, PDF oder eingefügter Text.
//       Heraus kommen Klartext, Frist, Betrag, Aktenzeichen und ein
//       Aufgaben-Vorschlag (VORLAUF_TAGE vor der Frist fällig).
// Unten: alle gemerkten Vorgänge aus Posteingang und Briefen, die
//       dringendsten zuerst. Erledigt wird von Hand.
//
// Das Original wird NICHT gespeichert — nur die Auswertung, und auch die
// erst, wenn jemand auf „Als Vorgang merken" drückt.
//
// Pfad: app/dashboard/sachbearbeiter/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, ChangeEvent, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import SachbearbeiterErgebnis, { type SachbearbeiterAntwort } from '../_components/SachbearbeiterErgebnis';
import { verkleinereBild } from '@/lib/bildKlein';
import { artFuer, datumDeutsch, heuteIso, tageZwischen, HINWEIS_KEINE_BERATUNG } from '@/lib/sachbearbeiter';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type VorgangZeile = {
  id: string;
  quelle: 'mail' | 'brief';
  art: string;
  betreff: string | null;
  absender: string | null;
  zusammenfassung: string | null;
  was_tun: string | null;
  frist: string | null;
  frist_text: string | null;
  betrag: number | string | null;
  aktenzeichen: string | null;
  dringlichkeit: string | null;
  status: string;
  aufgabe_angelegt: boolean | null;
  erstellt_am: string;
};

/** Datei als base64 ohne "data:"-Präfix. */
function alsBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('lesen'));
    r.readAsDataURL(blob);
  });
}

export default function SachbearbeiterSeite() {
  const [ergebnis, setErgebnis] = useState<SachbearbeiterAntwort | null>(null);
  const [liest, setLiest] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [zeigeText, setZeigeText] = useState(false);

  const [liste, setListe] = useState<VorgangZeile[]>([]);
  const [listeLaden, setListeLaden] = useState(true);
  const [listeFehler, setListeFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<'offen' | 'erledigt'>('offen');

  const ladeListe = useCallback(async () => {
    setListeLaden(true); setListeFehler(null);
    const { data, error } = await supabase
      .from('post_vorgang')
      .select('*')
      .eq('status', filter)
      .order('erstellt_am', { ascending: false })
      .limit(200);
    if (error) {
      setListeFehler(/post_vorgang/.test(error.message)
        ? 'Die Vorgangs-Liste ist noch nicht eingerichtet (SQL von Paket PA fehlt).'
        : 'Die Vorgänge konnten nicht geladen werden.');
      setListe([]);
    } else {
      setListe((data || []) as VorgangZeile[]);
    }
    setListeLaden(false);
  }, [filter]);

  useEffect(() => { void ladeListe(); }, [ladeListe]);

  async function sende(body: Record<string, unknown>) {
    setLiest(true); setFehler(null); setErgebnis(null);
    try {
      const r = await fetch('/api/sachbearbeiter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modus: 'brief', ...body }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) { setFehler(j?.error || 'Das Schreiben konnte nicht gelesen werden.'); return; }
      setErgebnis({ ergebnis: j.ergebnis, aufgabe: j.aufgabe, vorgang: j.vorgang });
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLiest(false); }
  }

  async function dateiGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      if (f.type === 'application/pdf') {
        if (f.size > 3.3 * 1024 * 1024) { setFehler('Das PDF ist zu groß (höchstens ca. 3 MB). Bitte nur die betroffenen Seiten scannen oder ein Foto machen.'); return; }
        await sende({ base64: await alsBase64(f), mediaType: 'application/pdf' });
        return;
      }
      if (!f.type.startsWith('image/')) { setFehler('Bitte ein Foto oder ein PDF wählen.'); return; }
      // Handyfotos sind oft 5–10 MB — verkleinert reicht es zum Lesen völlig.
      const klein = await verkleinereBild(f, 2200, 0.88);
      const typ = klein.type || f.type || 'image/jpeg';
      await sende({ base64: await alsBase64(klein), mediaType: typ });
    } catch { setFehler('Die Datei konnte nicht gelesen werden.'); }
  }

  async function erledigen(v: VorgangZeile, status: 'offen' | 'erledigt') {
    const { error } = await supabase.from('post_vorgang')
      .update({ status, erledigt_am: status === 'erledigt' ? new Date().toISOString() : null })
      .eq('id', v.id);
    if (error) { setListeFehler('Konnte nicht gespeichert werden.'); return; }
    setListe((l) => l.filter((x) => x.id !== v.id));
  }

  // Dringendste zuerst: abgelaufene und nahe Fristen oben, ohne Frist unten.
  const sortiert = useMemo(() => {
    const heute = heuteIso(new Date());
    const rang = (v: VorgangZeile) => {
      if (v.frist) return tageZwischen(heute, v.frist);
      if (v.frist_text) return -1000; // Frist genannt, aber unlesbar -> ganz oben
      return 100_000;
    };
    return [...liste].sort((a, b) => rang(a) - rang(b));
  }, [liste]);

  const heute = heuteIso(new Date());

  return (
    <div style={s.page}>
      <div style={s.eyebrow}>ARGONAUT OS · Büro</div>
      <h1 style={s.h1}>🧠 Sachbearbeiter</h1>
      <p style={s.sub}>
        Behördenbrief, Bescheid, Mahnung oder Kundenschreiben: Foto machen oder PDF hochladen —
        ARGONAUT sagt Ihnen in einfachen Worten, worum es geht, bis wann etwas zu tun ist und
        legt auf Wunsch die Aufgabe mit Frist an. E-Mails werten Sie direkt im Posteingang aus.
      </p>

      {/* --- Schreiben lesen ------------------------------------------------ */}
      <div style={s.karte}>
        <div style={s.karteTitel}>Schreiben lesen lassen</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ ...s.primaer, opacity: liest ? 0.55 : 1 }}>
            {liest ? '⏳ Lese …' : '📷 Foto oder PDF wählen'}
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={dateiGewaehlt} disabled={liest} style={{ display: 'none' }} />
          </label>
          <button style={s.mini} onClick={() => setZeigeText((z) => !z)}>{zeigeText ? 'Text-Feld schließen' : '✎ Text einfügen'}</button>
        </div>
        {zeigeText && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              rows={8}
              placeholder="Den Text des Schreibens hier einfügen …"
              style={s.textarea}
            />
            <button style={{ ...s.primaer, marginTop: 10, opacity: liest || !eingabe.trim() ? 0.55 : 1 }} disabled={liest || !eingabe.trim()} onClick={() => void sende({ text: eingabe })}>
              Auswerten
            </button>
          </div>
        )}
        <p style={s.hinweis}>
          Das Foto wird nur zum Lesen an die KI gegeben und nicht gespeichert. {HINWEIS_KEINE_BERATUNG}
        </p>
      </div>

      {fehler && <div style={s.err}>{fehler}</div>}
      {ergebnis && <SachbearbeiterErgebnis daten={ergebnis} />}

      {/* --- Vorgänge ------------------------------------------------------- */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '26px 0 12px' }}>
        <h2 style={s.h2}>📌 Vorgänge</h2>
        <span style={{ flex: 1 }} />
        <button style={{ ...s.mini, borderColor: filter === 'offen' ? C.gold : C.border }} onClick={() => setFilter('offen')}>Offen</button>
        <button style={{ ...s.mini, borderColor: filter === 'erledigt' ? C.gold : C.border }} onClick={() => setFilter('erledigt')}>Erledigt</button>
      </div>

      {listeFehler && <div style={s.err}>{listeFehler}</div>}
      {listeLaden ? (
        <div style={s.hint}>Lade Vorgänge …</div>
      ) : sortiert.length === 0 && !listeFehler ? (
        <div style={s.hint}>{filter === 'offen' ? 'Keine offenen Vorgänge. Gemerkte Schreiben erscheinen hier.' : 'Noch nichts erledigt.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortiert.map((v) => {
            const art = artFuer(v.art);
            const rest = v.frist ? tageZwischen(heute, v.frist) : null;
            const farbe = rest !== null ? (rest < 0 ? C.danger : rest <= 7 ? C.danger : rest <= 21 ? C.warn : C.green) : (v.frist_text ? C.danger : C.textDim);
            return (
              <div key={v.id} style={s.zeile}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <b style={{ color: '#fff' }}>{art.icon} {v.betreff || art.label}</b>
                    <span style={{ color: C.textDim, fontSize: 12.5 }}>{v.quelle === 'mail' ? 'E-Mail' : 'Brief'} · {new Date(v.erstellt_am).toLocaleDateString('de-DE')}</span>
                  </div>
                  <div style={{ color: C.text, fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>{v.zusammenfassung}</div>
                  {v.was_tun && <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 3 }}>Zu tun: {v.was_tun}</div>}
                  {v.aktenzeichen && <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 3 }}>Az.: {v.aktenzeichen}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: farbe, fontWeight: 800, fontSize: 14 }}>
                    {v.frist
                      ? (rest! < 0 ? `seit ${-rest!} T überfällig` : rest === 0 ? 'heute fällig' : `${datumDeutsch(v.frist)} · ${rest} T`)
                      : v.frist_text ? 'Frist prüfen!' : 'ohne Frist'}
                  </div>
                  {v.aufgabe_angelegt && <div style={{ color: C.textDim, fontSize: 12 }}>Aufgabe angelegt</div>}
                  <button style={{ ...s.mini, marginTop: 8 }} onClick={() => void erledigen(v, filter === 'offen' ? 'erledigt' : 'offen')}>
                    {filter === 'offen' ? '✓ Erledigt' : '↺ Wieder öffnen'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 1000, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  h2: { fontSize: 'clamp(20px, 1.8vw, 28px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 'clamp(14px, 1.25vw, 19px)', maxWidth: 820, lineHeight: 1.5 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px', marginBottom: 18 },
  karteTitel: { fontWeight: 700, color: '#fff', fontSize: '1.15rem', marginBottom: 12 },
  textarea: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '12px 14px', fontFamily: 'inherit', fontSize: 15, width: '100%', boxSizing: 'border-box', lineHeight: 1.6, resize: 'vertical' },
  hinweis: { color: C.textDim, fontSize: 13, lineHeight: 1.55, margin: '12px 0 0', maxWidth: '80ch' },
  zeile: { display: 'flex', gap: 14, alignItems: 'flex-start', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-block' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 15, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
