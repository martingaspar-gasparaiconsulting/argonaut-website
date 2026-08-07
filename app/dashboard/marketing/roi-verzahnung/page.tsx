'use client';

import { useEffect, useState } from 'react';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · ROI-Verzahnung (Punkt 5)
// Die volle Kette sichtbar: Werbe-Ausgaben → Website-Leads → echter Umsatz.
// Je Kampagne: Kosten je Lead, Umsatz je Lead, echter ROI. Ehrlich bei
// fehlenden Daten (kein Fehlalarm-ROI). Look = Kunden-Dashboard.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

type Ampel = 'sehr_gut' | 'profitabel' | 'verlust' | 'offen';
type Zeile = {
  id: string; name: string; status: string; budget: number; leads: number;
  umsatz: number | null; kostenJeLead: number | null; umsatzJeLead: number | null;
  roi: number | null; ampel: Ampel;
};
type Summe = {
  budgetGesamt: number; budgetMitUmsatz: number; umsatzBelegt: number;
  kampagnen: number; kampagnenMitUmsatz: number;
  leadsGesamt: number; leadsAttribuiert: number; leadsOrganisch: number;
  kostenJeLeadGesamt: number | null; umsatzJeLeadGesamt: number | null; roiGesamt: number | null;
};
type Daten = { ok: boolean; error?: string; summe: Summe; zeilen: Zeile[]; klartext: string };

const AMPEL_FARBE: Record<Ampel, string> = { sehr_gut: C.green, profitabel: C.gold, verlust: C.danger, offen: C.textDim };
const AMPEL_TEXT: Record<Ampel, string> = { sehr_gut: 'Sehr profitabel', profitabel: 'Profitabel', verlust: 'Verlust', offen: 'Umsatz offen' };

function euro(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function prozent(roi: number | null): string {
  if (roi == null) return '—';
  const p = Math.round(roi * 100);
  return `${p > 0 ? '+' : ''}${p}%`;
}

export default function RoiVerzahnungPage() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/marketing/roi-verzahnung');
        if (res.status === 401 || res.status === 403) { setFehler('Bitte einloggen.'); setLaden(false); return; }
        const j = (await res.json()) as Daten;
        if (!j.ok) { setFehler(j.error || 'Die ROI-Verzahnung konnte nicht geladen werden.'); setLaden(false); return; }
        setDaten(j);
      } catch { setFehler('Die ROI-Verzahnung konnte nicht geladen werden.'); } finally { setLaden(false); }
    })();
  }, []);

  const s = daten?.summe;

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 800, margin: 0 }}>
        🔗 ROI-Verzahnung
      </h1>
      <p style={{ color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 22px', maxWidth: 800 }}>
        Die ganze Kette auf einen Blick: was deine Werbung <b style={{ color: C.text }}>kostet</b>, wie viele <b style={{ color: C.text }}>Anfragen</b> daraus werden und welcher <b style={{ color: C.text }}>Umsatz</b> am Ende steht. So siehst du je Kampagne, was jeder Euro wirklich bringt — Kosten je Anfrage, Umsatz je Anfrage und echter ROI.
      </p>

      {fehler && <div style={{ color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>{fehler}</div>}
      {laden ? <p style={{ color: C.textDim }}>Zahlen werden verzahnt …</p> : daten && s && (
        <>
          {/* KPI-Kacheln */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            <KpiTile label="Kosten gesamt" wert={euro(s.budgetGesamt)} farbe={C.cyan} sub={`${s.kampagnen} Kampagne${s.kampagnen === 1 ? '' : 'n'}`} />
            <KpiTile label="Website-Leads" wert={String(s.leadsGesamt)} farbe={C.gold} sub={`${s.leadsAttribuiert} zugeordnet · ${s.leadsOrganisch} organisch`} />
            <KpiTile label="Belegter Umsatz" wert={euro(s.umsatzBelegt)} farbe={C.green} sub={s.kampagnenMitUmsatz > 0 ? `${s.kampagnenMitUmsatz} Kampagne(n) verknüpft` : 'noch keine Rechnung verknüpft'} />
            <KpiTile label="ROI gesamt" wert={prozent(s.roiGesamt)} farbe={s.roiGesamt == null ? C.textDim : s.roiGesamt >= 0 ? C.green : C.danger} sub={s.roiGesamt == null ? 'Umsatz noch nicht zugeordnet' : undefined} />
          </div>

          {/* Kette: Ausgaben → Leads → Umsatz */}
          <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Die Wertschöpfungskette</div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, flexWrap: 'wrap' }}>
              <Kettenglied icon="💶" titel="Ausgaben" wert={euro(s.budgetGesamt)} farbe={C.cyan} />
              <Pfeil label={s.kostenJeLeadGesamt != null ? `${euro(s.kostenJeLeadGesamt)} / Lead` : 'Kosten je Lead offen'} />
              <Kettenglied icon="🧲" titel="Website-Leads" wert={String(s.leadsAttribuiert)} farbe={C.gold} unterzeile={`von ${s.leadsGesamt} gesamt`} />
              <Pfeil label={s.umsatzJeLeadGesamt != null ? `${euro(s.umsatzJeLeadGesamt)} / Lead` : 'Umsatz je Lead offen'} />
              <Kettenglied icon="💰" titel="Echter Umsatz" wert={euro(s.umsatzBelegt)} farbe={C.green} unterzeile={s.roiGesamt != null ? `ROI ${prozent(s.roiGesamt)}` : 'ROI offen'} />
            </div>
          </div>

          {/* KI-Klartext */}
          {daten.klartext && (
            <div style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>💡 Marketing-Berater</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, color: C.text }}>{daten.klartext}</div>
            </div>
          )}

          {/* Kampagnen-Tabelle */}
          <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Je Kampagne</div>
            {daten.zeilen.length === 0 ? (
              <div style={{ color: C.textDim, fontSize: 13.5 }}>
                Noch keine Kampagnen angelegt. Sobald du im Cockpit Kampagnen mit Budget führst und Leads darauf zugeordnet werden, erscheint hier die volle Verzahnung. Umsatz wird sichtbar, sobald einer Kampagne eine Rechnung zugeordnet ist.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {/* Kopfzeile */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 0.7fr 1fr 1fr 0.9fr', gap: 10, padding: '0 8px', fontSize: 12, color: C.textDim, fontWeight: 600 }}>
                  <div>Kampagne</div><div style={{ textAlign: 'right' }}>Kosten</div><div style={{ textAlign: 'right' }}>Leads</div>
                  <div style={{ textAlign: 'right' }}>€ / Lead</div><div style={{ textAlign: 'right' }}>Umsatz</div><div style={{ textAlign: 'right' }}>ROI</div>
                </div>
                {daten.zeilen.map((z) => (
                  <div key={z.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 0.7fr 1fr 1fr 0.9fr', gap: 10, alignItems: 'center', padding: '10px 8px', borderRadius: 10, background: 'rgba(143,163,190,0.05)', border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span title={AMPEL_TEXT[z.ampel]} style={{ width: 9, height: 9, borderRadius: '50%', background: AMPEL_FARBE[z.ampel], flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={z.name}>{z.name}</span>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 13.5, color: C.textDim }}>{euro(z.budget)}</div>
                    <div style={{ textAlign: 'right', fontSize: 13.5, color: z.leads > 0 ? C.gold : C.textDim, fontWeight: 700 }}>{z.leads}</div>
                    <div style={{ textAlign: 'right', fontSize: 13.5, color: C.textDim }}>{euro(z.kostenJeLead)}</div>
                    <div style={{ textAlign: 'right', fontSize: 13.5, color: z.umsatz != null ? C.text : C.textDim }}>{z.umsatz != null ? euro(z.umsatz) : 'offen'}</div>
                    <div style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: AMPEL_FARBE[z.ampel] }}>{prozent(z.roi)}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
              Kosten = Kampagnen-Budget · Leads = Anfragen mit dieser Kampagne verknüpft (leads.kampagne_id) · Umsatz = zugeordnete Rechnung (bevorzugt bezahlt). Fehlt der Umsatz, bleibt der ROI ehrlich „offen" statt 0.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Bausteine ----------------

function KpiTile({ label, wert, farbe, sub }: { label: string; wert: string; farbe: string; sub?: string }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 28, color: farbe, lineHeight: 1.1 }}>{wert}</div>
      <div style={{ color: C.text, fontSize: 13, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Kettenglied({ icon, titel, wert, farbe, unterzeile }: { icon: string; titel: string; wert: string; farbe: string; unterzeile?: string }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 130, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 4 }}>{titel}</div>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 22, color: farbe, marginTop: 2 }}>{wert}</div>
      {unterzeile && <div style={{ color: C.textDim, fontSize: 11.5, marginTop: 2 }}>{unterzeile}</div>}
    </div>
  );
}

function Pfeil({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 90, padding: '0 4px' }}>
      <div style={{ color: C.textDim, fontSize: 22, lineHeight: 1 }}>→</div>
      <div style={{ color: C.textDim, fontSize: 11, marginTop: 4, textAlign: 'center' }}>{label}</div>
    </div>
  );
}
