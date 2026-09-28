'use client';

// ============================================================
// ARGONAUT OS · Import-Center · Umzug Schritt 6 (Paket 147, 28.09.2026)
// „Alles auf einmal": mehrere Dateien hineinziehen — ARGONAUT erkennt je
// Datei das Ziel (Spalten + Dateiname), legt die Reihenfolge fest (Kunden
// vor Auftraegen, Artikel vor Bestellungen …) und zeigt Sonderwege
// (Kontoauszug, E-Rechnung, GAEB). Importiert wird danach Datei fuer Datei
// im normalen Ablauf — mit Zuordnung, Pruefung und Rueckgaengig je Datei.
// Gelesen wird nur der Kopf, im Browser; nichts wird hochgeladen.
// Logik: lib/umzugPlan.ts (node-getestet).
// ============================================================

import { useState, type CSSProperties } from 'react';
import { ZIELE, leseCsv, zielDef } from '@/lib/importParser';
import { dekodiere } from '@/lib/importFortschritt';
import { leseXls } from '@/lib/xlsLeser';
import { dateiArt, type KatalogSpalte } from '@/lib/importMotor';
import { erkenneDatei, umzugPlan, type DateiErkennung } from '@/lib/umzugPlan';
import { istVcard, leseVcard } from '@/lib/vcardLeser';
import { istDatanorm, leseDatanorm, datanormReihenfolge, DATANORM_ENDUNGEN } from '@/lib/datanormLeser';

const C = {
  gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', green: '#4CAF7D', warn: '#E0A24C', navy: '#0A1628',
};

type Eintrag = { datei: File; erkennung: DateiErkennung; ziel: string; hinweis: string | null };

/** Nur den Kopf (und ein paar Zeilen) lesen — reicht zum Erkennen. */
async function kopfLesen(f: File): Promise<{ kopf: string[]; zeilen: string[][]; ersteZeile: string; hinweis: string | null }> {
  const anfang = new Uint8Array(await f.slice(0, 256 * 1024).arrayBuffer());
  const art = dateiArt(f.name, anfang.subarray(0, 8));
  if (art === 'xls') {
    const x = leseXls(new Uint8Array(await f.arrayBuffer()));
    const [kopf, ...zeilen] = x.zeilen;
    return { kopf: kopf ?? [], zeilen: zeilen.slice(0, 50), ersteZeile: '', hinweis: null };
  }
  if (art === 'xlsx' || /\.(xlsx|xlsm)$/i.test(f.name)) {
    return { kopf: [], zeilen: [], ersteZeile: '', hinweis: 'Excel (.xlsx): erkannt am Dateinamen — die Spalten liest ARGONAUT beim Öffnen.' };
  }
  // Paket 149: DATANORM -> Kopf mit den Feldnamen der Artikel (Anfang reicht zum Erkennen)
  if (istDatanorm(f.name, anfang.subarray(0, 400))) {
    const bisZeilenende = anfang.length >= 256 * 1024 ? anfang.subarray(0, anfang.lastIndexOf(10) + 1) : anfang;
    const d = leseDatanorm(bisZeilenende);
    return { kopf: d.kopf, zeilen: d.zeilen.slice(0, 50), ersteZeile: '', hinweis: `DATANORM ${d.version ?? '?'}${anfang.length >= 256 * 1024 ? '' : `: ${d.anzahl} Artikel`}` };
  }
  const text = dekodiere(anfang);
  const ersteZeile = text.split(/\r?\n/, 1)[0] ?? '';
  if (/\.xml$/i.test(f.name)) return { kopf: [], zeilen: [], ersteZeile: text.slice(0, 4000), hinweis: null };
  // Paket 148: vCard -> Kopf mit den Feldnamen der Kunden
  if (istVcard(f.name, text.slice(0, 200))) { const v = leseVcard(dekodiere(new Uint8Array(await f.arrayBuffer()))); return { kopf: v.kopf, zeilen: v.zeilen.slice(0, 50), ersteZeile, hinweis: `vCard: ${v.anzahl} Kontakte` }; }
  // Letzte (evtl. abgeschnittene) Zeile weglassen
  const bisZeilenende = text.length >= 256 * 1024 ? text.slice(0, text.lastIndexOf('\n')) : text;
  const t = leseCsv(bisZeilenende);
  return { kopf: t.kopf, zeilen: t.zeilen.slice(0, 50), ersteZeile, hinweis: null };
}

export default function UmzugStapel(props: {
  dbSpalten: KatalogSpalte[] | null;
  erlaubt: (zielKey: string) => boolean;
  /** Dateinamen, die in dieser Sitzung schon importiert wurden */
  erledigt: readonly string[];
  busy: boolean;
  onOeffnen: (datei: File, zielKey: string) => void;
}) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [liest, setLiest] = useState(false);
  const [offen, setOffen] = useState(false);

  async function dateienGewaehlt(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    setLiest(true);
    const neu: Eintrag[] = [];
    // Paket 149: DATANORM.001 + DATPREIS.001 (+ .WRG/.RAB) gehoeren zusammen -> eine Datei
    let dateien = Array.from(liste);
    const dn = datanormReihenfolge(dateien.map((f) => f.name));
    if (dn.length > 1) {
      const teile: BlobPart[] = [];
      dn.forEach((i, n) => { if (n > 0) teile.push('\r\n'); teile.push(dateien[i]); });
      const zusammen = new File(teile, dn.map((i) => dateien[i].name).join(' + '));
      dateien = [zusammen, ...dateien.filter((_, i) => !dn.includes(i))];
    }
    for (const f of dateien) {
      try {
        const k = await kopfLesen(f);
        const e = erkenneDatei(f.name, k.kopf, k.zeilen, { dbSpalten: props.dbSpalten, erlaubt: props.erlaubt, ersteZeile: k.ersteZeile });
        neu.push({ datei: f, erkennung: e, ziel: e.ziel ?? '', hinweis: k.hinweis });
      } catch {
        neu.push({ datei: f, erkennung: { datei: f.name, ziel: null, sicher: false, kandidaten: [], sonder: null }, ziel: '', hinweis: 'Konnte nicht gelesen werden — bitte einzeln öffnen.' });
      }
    }
    setEintraege((alt) => [...alt.filter((a) => !neu.some((n) => n.datei.name === a.datei.name)), ...neu]);
    setLiest(false);
    setOffen(true);
  }

  const plan = umzugPlan(eintraege.map((e) => ({ datei: e.datei.name, ziel: e.ziel || null, sonder: e.erkennung.sonder, sicher: e.erkennung.sicher })));
  const eintragZu = (name: string) => eintraege.find((e) => e.datei.name === name)!;
  const naechste = plan.eintraege.find((p) => p.ziel && !props.erledigt.includes(p.datei));

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: C.gold, marginBottom: 4 }}>📦 Alles auf einmal: mehrere Dateien hineinziehen</div>
      <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.55, marginBottom: 8 }}>
        ARGONAUT erkennt je Datei, wohin sie gehört, und schlägt die Reihenfolge vor — erst Kunden, Artikel und Lieferanten, dann alles, was darauf verweist.
        Danach öffnen Sie Datei für Datei; jede wird wie gewohnt geprüft und lässt sich einzeln rückgängig machen. Gelesen wird nur die Kopfzeile, direkt in Ihrem Browser.
      </div>
      <input type="file" multiple accept={`.csv,.txt,.xls,.xlsx,.xlsm,.xml,.vcf,${DATANORM_ENDUNGEN}`} disabled={liest || props.busy}
        onChange={(e) => { void dateienGewaehlt(e.target.files); e.target.value = ''; }} style={{ color: C.text, fontSize: 13 }} />
      {liest && <div style={{ color: C.dim, fontSize: 12.5, marginTop: 6 }}>Dateien werden erkannt …</div>}

      {eintraege.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setOffen((o) => !o)} style={link}>{offen ? '▾' : '▸'} Umzugsplan: {eintraege.length} Dateien{naechste ? '' : ' · alle erledigt'}</button>
          {offen && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plan.fehlend.length > 0 && (
                <div style={{ color: C.warn, fontSize: 12.5 }}>
                  ⚠️ Im Stapel fehlt, worauf andere Dateien verweisen: {[...new Set(plan.fehlend.map((f) => zielDef(f.braucht)?.label ?? f.braucht))].join(', ')} — falls das schon in ARGONAUT ist, passt alles; sonst zuerst diese Daten importieren.
                </div>
              )}
              {plan.eintraege.map((p) => {
                const e = eintragZu(p.datei);
                const fertig = props.erledigt.includes(p.datei);
                return (
                  <div key={p.datei} style={{ ...zeile, opacity: fertig ? 0.6 : 1 }}>
                    <span style={{ width: 28, color: C.gold, fontWeight: 700 }}>{p.schritt ?? '–'}</span>
                    <span style={{ flex: '2 1 200px', color: C.text, wordBreak: 'break-all' }}>{p.datei}</span>
                    {e.erkennung.sonder ? (
                      <span style={{ flex: '3 1 260px', fontSize: 12.5, color: C.dim }}>
                        {e.erkennung.sonder.titel}: {e.erkennung.sonder.grund}{' '}
                        <a href={e.erkennung.sonder.href} style={{ color: C.gold }}>öffnen ›</a>
                      </span>
                    ) : (
                      <span style={{ flex: '3 1 260px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={e.ziel} disabled={fertig}
                          onChange={(x) => setEintraege((alt) => alt.map((a) => (a.datei.name === p.datei ? { ...a, ziel: x.target.value } : a)))}
                          style={sel}>
                          <option value="">— bitte Ziel wählen —</option>
                          {ZIELE.filter((z) => !z.bestandSetzen && props.erlaubt(z.key)).map((z) => <option key={z.key} value={z.key}>{z.icon} {z.label}</option>)}
                        </select>
                        {!fertig && e.ziel && !e.erkennung.sicher && <span style={{ color: C.warn, fontSize: 12 }}>bitte prüfen</span>}
                        {e.hinweis && <span style={{ color: C.dim, fontSize: 12 }}>{e.hinweis}</span>}
                      </span>
                    )}
                    <span style={{ flex: '0 0 auto' }}>
                      {fertig ? <span style={{ color: C.green, fontSize: 13 }}>✓ importiert</span>
                        : p.ziel && !e.erkennung.sonder ? (
                          <button type="button" disabled={props.busy} onClick={() => props.onOeffnen(e.datei, e.ziel)}
                            style={{ ...knopf, ...(naechste?.datei === p.datei ? { background: C.gold, color: C.navy } : {}) }}>
                            {naechste?.datei === p.datei ? 'Als Nächstes öffnen' : 'Öffnen'}
                          </button>
                        ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const box: CSSProperties = { marginTop: 14, padding: '12px 14px', border: `1px dashed ${C.border}`, borderRadius: 10, background: 'rgba(201,168,76,0.04)' };
const zeile: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 };
const sel: CSSProperties = { background: '#0F2036', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12.5, maxWidth: 280 };
const knopf: CSSProperties = { background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 };
const link: CSSProperties = { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600 };
