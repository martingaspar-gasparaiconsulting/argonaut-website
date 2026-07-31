'use client';

// ============================================================
// ARGONAUT OS · Welle 2 · „Heute"-Zentrale
// EIN Ort, der alle Ampeln quer über die Module bündelt: überfällige/fällige
// Rechnungen, Wartungen, HU/AU, Kanzlei-Fristen, Förder-Fristen, MHD, Tier-
// Wiedervorlagen, ablaufende Angebote. Sortiert nach Dringlichkeit.
// Robust: fehlt bei einem Modul das SQL, wird die Quelle still übersprungen.
// Pfad: app/dashboard/heute/page.tsx
// ============================================================

import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import { augeHeute, augeGesamt, augePipeline, augeProvisionen, type AugeErgebnis } from '@/lib/auge';
import { zaehlePipeline, OFFENE_STUFEN } from '@/lib/pipeline';
import { provisionSummen } from '@/lib/provision';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Item = { icon: string; titel: string; datum: string; href: string; tage: number };
type Operativ = {
  pipelineOffen: number; pipelineWert: number; gewichtet: number; winRate: number; gewonnen: number; verloren: number; pipelineUeberfaellig: number;
  provOffen: number; provAusgezahlt: number; provGesamt: number; provDeals: number; provEmpf: number;
  angeboteWartend: number; freigabeNoetig: number;
};
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); }
type DealRow = {
  stufe?: string | null; wert_netto?: number | string | null; wahrscheinlichkeit?: number | string | null;
  erwartetes_datum?: string | null; provision_prozent?: number | string | null;
  provision_empfaenger?: string | null; provision_ausgezahlt?: boolean | null;
};

function heute() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function inTagen(iso: string) { return Math.ceil((new Date(iso + 'T00:00:00').getTime() - heute().getTime()) / 86400000); }
function d(iso: string) { const p = (iso || '').split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

type Quelle = {
  icon: string; table: string; select: string; dateField: string; href: string;
  offen: (r: Record<string, unknown>) => boolean;
  titel: (r: Record<string, unknown>) => string;
};

const QUELLEN: Quelle[] = [
  { icon: '🧾', table: 'rechnungen', select: 'rechnungsnummer, titel, faelligkeitsdatum, zahlungsstatus, bezahlt_am', dateField: 'faelligkeitsdatum', href: '/dashboard/rechnungen',
    offen: (r) => !r.bezahlt_am && r.zahlungsstatus !== 'bezahlt' && r.zahlungsstatus !== 'storniert',
    titel: (r) => `Rechnung ${r.rechnungsnummer || ''} fällig` },
  { icon: '🗒', table: 'angebote', select: 'angebotsnummer, titel, gueltig_bis, status', dateField: 'gueltig_bis', href: '/dashboard/angebote',
    offen: (r) => r.status === 'entwurf' || r.status === 'gesendet',
    titel: (r) => `Angebot ${r.angebotsnummer || ''} läuft ab: ${r.titel || ''}` },
  { icon: '🛡', table: 'it_vertraege', select: 'bezeichnung, kunde_name, naechste_wartung, status', dateField: 'naechste_wartung', href: '/dashboard/it-msp',
    offen: (r) => r.status !== 'beendet',
    titel: (r) => `Wartung: ${r.bezeichnung || ''} (${r.kunde_name || '—'})` },
  { icon: '⚡', table: 'energie_anlagen', select: 'bezeichnung, wartung_faellig', dateField: 'wartung_faellig', href: '/dashboard/energie',
    offen: () => true, titel: (r) => `Anlagen-Wartung: ${r.bezeichnung || ''}` },
  { icon: '🚗', table: 'kfz_fahrzeuge', select: 'kennzeichen, marke, hu_faellig', dateField: 'hu_faellig', href: '/dashboard/kfz',
    offen: () => true, titel: (r) => `HU fällig: ${r.kennzeichen || ''} ${r.marke || ''}`.trim() },
  { icon: '⚖️', table: 'kanzlei_fristen', select: 'bezeichnung, frist, erledigt', dateField: 'frist', href: '/dashboard/kanzlei',
    offen: (r) => !r.erledigt, titel: (r) => `Frist: ${r.bezeichnung || ''}` },
  { icon: '💰', table: 'foerder_vorhaben', select: 'programm_name, frist', dateField: 'frist', href: '/dashboard/foerdermittel',
    offen: () => true, titel: (r) => `Förder-Frist: ${r.programm_name || ''}` },
  { icon: '🐾', table: 'tier_behandlungen', select: 'bezeichnung, naechste_faellig', dateField: 'naechste_faellig', href: '/dashboard/tier',
    offen: () => true, titel: (r) => `Tier-Wiedervorlage: ${r.bezeichnung || ''}` },
  { icon: '🥫', table: 'lm_chargen', select: 'bezeichnung, charge_nr, mhd', dateField: 'mhd', href: '/dashboard/lebensmittel',
    offen: () => true, titel: (r) => `MHD: ${r.bezeichnung || ''} ${r.charge_nr ? '(' + r.charge_nr + ')' : ''}`.trim() },
  { icon: '🏗', table: 'freistellungen', select: 'inhaber, gueltig_bis, art', dateField: 'gueltig_bis', href: '/dashboard/compliance',
    offen: () => true, titel: (r) => `§48b läuft ab: ${r.inhaber || ''} (${r.art === 'eigen' ? 'eigen' : 'Sub'})` },
  { icon: '🧑‍🏭', table: 'sofortmeldungen', select: 'mitarbeiter_name, beschaeftigung_ab, gemeldet', dateField: 'beschaeftigung_ab', href: '/dashboard/compliance',
    offen: (r) => !r.gemeldet, titel: (r) => `Sofortmeldung offen: ${r.mitarbeiter_name || ''}` },
  { icon: '🪪', table: 'pruefpflichten', select: 'bezeichnung, naechste_pruefung, art', dateField: 'naechste_pruefung', href: '/dashboard/compliance',
    offen: () => true, titel: (r) => `Prüffrist: ${r.bezeichnung || ''}` },
];

export default function HeutePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [signaturen, setSignaturen] = useState<Array<{ id: string; titel: string; empf: string; seit: number }>>([]);
  const [op, setOp] = useState<Operativ | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const grenze = new Date(); grenze.setDate(grenze.getDate() + 30);
      const grenzeIso = grenze.toISOString().slice(0, 10);
      const alle: Item[] = [];

      await Promise.all(QUELLEN.map(async (q) => {
        try {
          const { data: rows, error } = await supabase
            .from(q.table).select(q.select).lte(q.dateField, grenzeIso).order(q.dateField, { ascending: true }).limit(80);
          if (error || !rows) return; // Tabelle fehlt / kein Zugriff -> still überspringen
          for (const r of rows as unknown as Record<string, unknown>[]) {
            const iso = r[q.dateField] as string | null;
            if (!iso || !q.offen(r)) continue;
            const datumIso = String(iso).slice(0, 10);
            alle.push({ icon: q.icon, titel: q.titel(r), datum: datumIso, href: q.href, tage: inTagen(datumIso) });
          }
        } catch { /* Quelle überspringen */ }
      }));

      alle.sort((a, b) => a.tage - b.tage);
      setItems(alle);

      // Offene Unterschriften (eigene Quelle, ohne Fristen-Logik).
      try {
        const { data: sig } = await supabase.from('signatur_anfragen')
          .select('id, titel, empfaenger_name, created_at, status, storniert')
          .in('status', ['gesendet', 'angesehen']).order('created_at', { ascending: true }).limit(50);
        const offeneSig = ((sig as Record<string, unknown>[]) || []).filter((s) => !s.storniert).map((s) => ({
          id: String(s.id), titel: String(s.titel || 'Dokument'), empf: String(s.empfaenger_name || '—'),
          seit: -inTagen(String(s.created_at).slice(0, 10)),
        }));
        setSignaturen(offeneSig);
      } catch { /* Modul evtl. nicht eingespielt */ }

      // Operative Signale (Vertrieb / Angebote / Provisionen) — robust, still übersprungen.
      const neuOp: Operativ = {
        pipelineOffen: 0, pipelineWert: 0, gewichtet: 0, winRate: 0, gewonnen: 0, verloren: 0, pipelineUeberfaellig: 0,
        provOffen: 0, provAusgezahlt: 0, provGesamt: 0, provDeals: 0, provEmpf: 0,
        angeboteWartend: 0, freigabeNoetig: 0,
      };
      const offeneKeys = new Set(OFFENE_STUFEN.map((s) => s.key));
      try {
        const { data: dealData } = await supabase.from('crm_deal')
          .select('stufe, wert_netto, erwartetes_datum, provision_prozent, provision_empfaenger, provision_ausgezahlt');
        const deals = (dealData ?? []) as DealRow[];
        if (deals.length) {
          const k = zaehlePipeline(deals);
          neuOp.pipelineOffen = k.offen; neuOp.pipelineWert = k.pipelineWert; neuOp.gewichtet = k.gewichtet;
          neuOp.winRate = k.winRate; neuOp.gewonnen = k.gewonnen; neuOp.verloren = k.verloren;
          neuOp.pipelineUeberfaellig = deals.filter((d) => {
            const iso = d.erwartetes_datum;
            return offeneKeys.has(String(d.stufe)) && !!iso && inTagen(String(iso).slice(0, 10)) < 0;
          }).length;
          const ps = provisionSummen(deals);
          neuOp.provOffen = ps.offen; neuOp.provAusgezahlt = ps.ausgezahlt; neuOp.provGesamt = ps.gesamt;
          neuOp.provDeals = ps.anzahlDeals; neuOp.provEmpf = ps.anzahlEmpfaenger;
        }
      } catch { /* Pipeline/Provisionen evtl. nicht eingespielt */ }
      try {
        const { data: ang } = await supabase.from('angebote').select('status, genehmigung_noetig, genehmigt');
        if (ang) {
          const rows = ang as Record<string, unknown>[];
          neuOp.angeboteWartend = rows.filter((r) => r.status === 'entwurf' || r.status === 'gesendet').length;
          neuOp.freigabeNoetig = rows.filter((r) => r.genehmigung_noetig && !r.genehmigt).length;
        }
      } catch { /* Angebote evtl. nicht verfügbar */ }
      setOp(neuOp);

      setLaden(false);
    })();
  }, []);

  const ueberfaellig = items.filter((i) => i.tage < 0);
  const dieseWoche = items.filter((i) => i.tage >= 0 && i.tage <= 7);
  const spaeter = items.filter((i) => i.tage > 7);

  // Gesamt-Auge: Fristen + operative Bereiche zu EINER priorisierten Antwort bündeln.
  const gesamtRegel = useMemo(() => {
    const module: Array<{ modul: string; ergebnis: AugeErgebnis }> = [
      { modul: 'Fristen', ergebnis: augeHeute({ ueberfaellig: ueberfaellig.length, dieseWoche: dieseWoche.length, spaeter: spaeter.length }) },
    ];
    if (op) {
      module.push({ modul: 'Vertrieb', ergebnis: augePipeline({
        offen: op.pipelineOffen, pipelineWert: op.pipelineWert, gewichtet: op.gewichtet, winRate: op.winRate,
        gewonnen: op.gewonnen, verloren: op.verloren, ueberfaellig: op.pipelineUeberfaellig,
      }) });
      const angErg: AugeErgebnis = op.freigabeNoetig > 0
        ? { klartext: `${op.freigabeNoetig} Angebot${op.freigabeNoetig === 1 ? '' : 'e'} ${op.freigabeNoetig === 1 ? 'braucht' : 'brauchen'} eine Freigabe.`, punkte: [], stimmung: 'achtung' }
        : op.angeboteWartend > 0
          ? { klartext: `${op.angeboteWartend} Angebot${op.angeboteWartend === 1 ? '' : 'e'} ${op.angeboteWartend === 1 ? 'wartet' : 'warten'} auf Zusage.`, punkte: [], stimmung: 'neutral' }
          : { klartext: 'Keine offenen Angebote.', punkte: [], stimmung: 'gut' };
      module.push({ modul: 'Angebote', ergebnis: angErg });
      module.push({ modul: 'Provisionen', ergebnis: augeProvisionen({ offen: op.provOffen, ausgezahlt: op.provAusgezahlt, gesamt: op.provGesamt, anzahlDeals: op.provDeals, anzahlEmpfaenger: op.provEmpf }) });
    }
    if (signaturen.length > 0) {
      module.push({ modul: 'Unterschriften', ergebnis: { klartext: `${signaturen.length} Unterschrift${signaturen.length === 1 ? '' : 'en'} ausstehend.`, punkte: [], stimmung: 'neutral' } });
    }
    return augeGesamt(module);
  }, [op, signaturen.length, ueberfaellig.length, dieseWoche.length, spaeter.length]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📌 Heute — was ist zu tun?</h1>
      <p style={styles.sub}>Alle Fristen und Fälligkeiten aus allen Modulen an einem Ort, nach Dringlichkeit sortiert.</p>
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.kpis}>
        <div style={{ ...styles.kpi, borderColor: ueberfaellig.length ? C.danger : C.border }}>
          <div style={{ ...styles.kWert, color: C.danger }}>{ueberfaellig.length}</div><div style={styles.kLabel}>überfällig</div>
        </div>
        <div style={{ ...styles.kpi, borderColor: dieseWoche.length ? C.warn : C.border }}>
          <div style={{ ...styles.kWert, color: C.warn }}>{dieseWoche.length}</div><div style={styles.kLabel}>diese Woche</div>
        </div>
        <div style={styles.kpi}>
          <div style={{ ...styles.kWert, color: C.green }}>{spaeter.length}</div><div style={styles.kLabel}>in Sicht</div>
        </div>
      </div>

      <KiAuge modul="Heute" regel={gesamtRegel} />

      {op && (op.pipelineOffen > 0 || op.angeboteWartend > 0 || op.freigabeNoetig > 0 || op.provOffen > 0) && (
        <div style={styles.opRow}>
          {op.freigabeNoetig > 0 && (
            <a href="/dashboard/angebote" style={{ ...styles.opCard, borderColor: C.warn }}>
              <span style={{ ...styles.opWert, color: C.warn }}>{op.freigabeNoetig}</span>
              <span style={styles.opLabel}>Angebote · Freigabe nötig</span>
            </a>
          )}
          {op.angeboteWartend > 0 && (
            <a href="/dashboard/angebote" style={styles.opCard}>
              <span style={{ ...styles.opWert, color: C.cyan }}>{op.angeboteWartend}</span>
              <span style={styles.opLabel}>Angebote warten auf Zusage</span>
            </a>
          )}
          {op.pipelineOffen > 0 && (
            <a href="/dashboard/pipeline" style={{ ...styles.opCard, borderColor: op.pipelineUeberfaellig > 0 ? C.danger : C.border }}>
              <span style={{ ...styles.opWert, color: C.gold }}>{eur(op.gewichtet)}</span>
              <span style={styles.opLabel}>{op.pipelineOffen} offene Deals · Forecast{op.pipelineUeberfaellig > 0 ? ` · ${op.pipelineUeberfaellig} überfällig` : ''}</span>
            </a>
          )}
          {op.provOffen > 0 && (
            <a href="/dashboard/provisionen" style={{ ...styles.opCard, borderColor: C.warn }}>
              <span style={{ ...styles.opWert, color: C.warn }}>{eur(op.provOffen)}</span>
              <span style={styles.opLabel}>Provision offen zum Auszahlen</span>
            </a>
          )}
        </div>
      )}

      {signaturen.length > 0 && (
        <div style={styles.block}>
          <div style={{ ...styles.blockTitel, color: C.gold }}>✍️ Offene Unterschriften <span style={{ color: C.textDim, fontWeight: 400 }}>({signaturen.length})</span></div>
          <div style={styles.liste}>
            {signaturen.map((s) => (
              <a key={s.id} href="/dashboard/signaturen" style={styles.item}>
                <span style={{ fontSize: 18 }}>✍️</span>
                <span style={{ flex: 1, minWidth: 0 }}>{s.titel} · {s.empf}</span>
                <span style={{ color: C.textDim, fontSize: 13 }}>{s.seit <= 0 ? 'heute' : `seit ${s.seit} T`}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {laden ? <p style={styles.dim}>Sammle alle Ampeln …</p> : items.length === 0 ? (
        <div style={styles.leer}>✅ Nichts Dringendes. Alles im grünen Bereich.</div>
      ) : (
        <>
          {ueberfaellig.length > 0 && <Block titel="🔴 Überfällig" farbe={C.danger} items={ueberfaellig} />}
          {dieseWoche.length > 0 && <Block titel="🟡 Diese Woche" farbe={C.warn} items={dieseWoche} />}
          {spaeter.length > 0 && <Block titel="🟢 In den nächsten 30 Tagen" farbe={C.green} items={spaeter} />}
        </>
      )}
    </div>
  );
}

function Block({ titel, farbe, items }: { titel: string; farbe: string; items: Item[] }) {
  return (
    <div style={styles.block}>
      <div style={{ ...styles.blockTitel, color: farbe }}>{titel} <span style={{ color: C.textDim, fontWeight: 400 }}>({items.length})</span></div>
      <div style={styles.liste}>
        {items.map((i, k) => (
          <a key={k} href={i.href} style={styles.item}>
            <span style={{ fontSize: 18 }}>{i.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{i.titel}</span>
            <span style={{ ...styles.tage, color: farbe, borderColor: farbe }}>
              {i.tage < 0 ? `${-i.tage} T über` : i.tage === 0 ? 'heute' : `in ${i.tage} T`}
            </span>
            <span style={{ color: C.textDim, fontSize: 13, minWidth: 82, textAlign: 'right' }}>{d(i.datum)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' },
  kWert: { fontSize: 30, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 12.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  opRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, margin: '14px 0 4px' },
  opCard: { display: 'flex', flexDirection: 'column', gap: 4, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', textDecoration: 'none' },
  opWert: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  opLabel: { color: C.textDim, fontSize: 12.5 },
  block: { marginTop: 18 },
  blockTitel: { fontWeight: 800, fontSize: 16, marginBottom: 10 },
  liste: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', textDecoration: 'none', color: C.text, fontSize: 14.5, flexWrap: 'wrap' },
  tage: { border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  leer: { color: C.green, background: 'rgba(76,175,125,0.08)', border: `1px solid ${C.green}`, borderRadius: 14, padding: 26, textAlign: 'center', fontSize: 16, marginTop: 12 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
