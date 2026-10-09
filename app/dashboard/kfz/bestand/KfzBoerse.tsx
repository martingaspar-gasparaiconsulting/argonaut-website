'use client';

// ============================================================
// ARGONAUT OS · Paket 272 · K11a — Fahrzeugbörse im Fahrzeugbestand
// Leiste über der Bestandsliste: Börse an/aus (nur Geschäftsleitung),
// „Bei Google finden" an/aus, Link kopieren/ansehen, wie viele Fahrzeuge
// sichtbar sind und wo Angaben fehlen (Preis, Energie/CO₂, Impressum).
// Öffentlich erscheint nur, was in der Akte „Inserat ist online" hat und im Bestand,
// in der Aufbereitung oder im Zulauf steht.
// Einstellung: modul_einstellung, Modul „kfz-boerse" (Chef schreibt, RLS 259).
// ============================================================

import { useCallback, useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { BOERSE_MODUL, boerseEinstellung, boersePfad, domainPfad, firmaFehlt, hostSauber, neueKennung, sichtbar } from '@/lib/kfzBoerse';
import { pflichtFehlt } from '@/lib/kfzAkte';
import KfzBoerseExtras from './KfzBoerseExtras';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A84C', bad: '#E06666' };

type Zeile = { status: string; inseriert: boolean | null; vk_brutto: number | null; kraftstoff: string | null; verbrauch_komb: number | null; co2_g_km: number | null; co2_klasse: string | null };
type Zahlen = { sichtbar: number; ohnePreis: number; ohneEnergie: number; inseriertAberVerborgen: number };

export default function KfzBoerse({ betrieb, istChef }: { betrieb: string | null; istChef: boolean }) {
  const [roh, setRoh] = useState<Record<string, unknown>>({});
  const [zahlen, setZahlen] = useState<Zahlen | null>(null);
  const [firmaLuecken, setFirmaLuecken] = useState<string[]>([]);
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [domains, setDomains] = useState<{ domain: string; live: boolean }[]>([]);

  const lade = useCallback(async (b: string) => {
    const [e, f, ci, ws] = await Promise.all([
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', b).eq('modul', BOERSE_MODUL).maybeSingle(),
      supabase.from('kfz_bestand').select('status, inseriert, vk_brutto, kraftstoff, verbrauch_komb, co2_g_km, co2_klasse').eq('owner_user_id', b).eq('inseriert', true).limit(2000),
      supabase.from('web_ci').select('firma, strasse, plz, ort, email, telefon').eq('owner_user_id', b).maybeSingle(),
      supabase.from('web_seiten').select('domain, status').eq('owner_user_id', b).limit(20),
    ]);
    // Paket 273: eigene Domain(s) aus dem Website-Bauer — dort läuft die Börse unter /fahrzeuge.
    const ds = new Map<string, boolean>();
    for (const z of (((ws.data as unknown) as { domain: string | null; status: string | null }[]) ?? [])) {
      const d = hostSauber(z.domain);
      if (d) ds.set(d, (ds.get(d) ?? false) || z.status === 'live');
    }
    setDomains([...ds].map(([domain, live]) => ({ domain, live })));
    const einst = (e.data as { einstellung?: unknown } | null)?.einstellung;
    setRoh(einst && typeof einst === 'object' ? (einst as Record<string, unknown>) : {});
    const liste = ((f.data as unknown) as Zeile[]) ?? [];
    const sicht = liste.filter((z) => sichtbar(z));
    setZahlen({
      sichtbar: sicht.length,
      ohnePreis: sicht.filter((z) => !z.vk_brutto || z.vk_brutto <= 0).length,
      ohneEnergie: sicht.filter((z) => pflichtFehlt(z).length > 0).length,
      inseriertAberVerborgen: liste.length - sicht.length,
    });
    const c = (ci.data as Record<string, string | null> | null) ?? {};
    const t = (v: string | null | undefined) => String(v ?? '');
    setFirmaLuecken(firmaFehlt({ name: t(c.firma), strasse: t(c.strasse), plz: t(c.plz), ort: t(c.ort), email: t(c.email), telefon: t(c.telefon) }));
  }, []);

  useEffect(() => { if (betrieb) void lade(betrieb); }, [betrieb, lade]);

  const einst = boerseEinstellung(roh);
  const link = einst.kennung && typeof window !== 'undefined' ? `${window.location.origin}${boersePfad(einst.kennung)}` : '';

  async function speichern(neu: { aktiv: boolean; google: boolean }) {
    if (!betrieb || !istChef) return;
    let kennung = einst.kennung;
    if (!kennung) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      kennung = neueKennung(Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''));
    }
    if (!kennung) { setFehler('Kennung konnte nicht erzeugt werden.'); return; }
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: betrieb, modul: BOERSE_MODUL, einstellung: { ...roh, kennung, aktiv: neu.aktiv, google: neu.aktiv && neu.google }, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'owner_user_id,modul' });
      if (error) { setFehler('Die Fahrzeugbörse ließ sich nicht umschalten.'); return; }
      await lade(betrieb);
    } finally { setBusy(false); }
  }

  if (!betrieb) return null;
  return (
    <div style={k.box}>
      <div style={k.zeile}>
        <span style={{ fontWeight: 700 }}>🌐 Fahrzeugbörse</span>
        <span style={{ ...k.pill, color: einst.aktiv ? C.ok : C.dim }}>{einst.aktiv ? 'online' : 'aus'}</span>
        {einst.aktiv && <span style={{ ...k.pill, color: einst.google ? C.gold : C.dim }}>{einst.google ? 'bei Google auffindbar' : 'nur per Link'}</span>}
        {zahlen && <span style={k.dim}>{zahlen.sichtbar} {zahlen.sichtbar === 1 ? 'Fahrzeug' : 'Fahrzeuge'} sichtbar</span>}
        {einst.aktiv && link && <a href={link} target="_blank" rel="noopener noreferrer" style={k.link}>Ansehen ↗</a>}
        <button style={k.btn} onClick={() => setOffen(!offen)}>{offen ? 'Schließen' : istChef ? 'Einstellungen' : 'Details'}</button>
      </div>

      {offen && (
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <div style={k.dim}>Ihre eigene Fahrzeugbörse: eine öffentliche Seite mit allen Fahrzeugen, bei denen in der Fahrzeugakte (Reiter „Inserat") „Inserat ist online" angehakt ist und die im Bestand, in der Aufbereitung oder im Zulauf stehen — mit Fotos, Preis, Ausstattung, Energie-Angaben und Anfrage-Formular. Anfragen landen unter „Anfragen und Suchaufträge". Einkaufspreis, Kalkulation, FIN, Kennzeichen und Notizen erscheinen nie. Den Link können Sie auf Ihrer Webseite, in Mails oder in sozialen Netzwerken teilen.</div>

          {istChef && (
            <div style={k.zeile}>
              {einst.aktiv
                ? <button style={k.btn} disabled={busy} onClick={() => void speichern({ aktiv: false, google: false })}>Börse ausschalten</button>
                : <button style={{ ...k.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void speichern({ aktiv: true, google: true })}>Börse einschalten</button>}
              {einst.aktiv && (
                <label style={k.haken}>
                  <input type="checkbox" checked={einst.google} disabled={busy} onChange={(e) => void speichern({ aktiv: true, google: e.target.checked })} />
                  Bei Google finden lassen (Suchmaschinen nehmen die Seiten auf, Fahrzeuge erscheinen mit Preis und Foto; abgehakt = nur per Link erreichbar)
                </label>
              )}
            </div>
          )}
          {!istChef && <div style={k.dim}>Ein- und Ausschalten kann nur die Geschäftsleitung.</div>}

          {einst.aktiv && link && (
            <div style={k.zeile}>
              <input style={{ ...k.inp, flex: '1 1 320px' }} readOnly value={link} aria-label="Link zur Fahrzeugbörse" onFocus={(e) => e.currentTarget.select()} />
              <button style={k.btn} onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 1800); }); }}>{kopiert ? '✓ Kopiert' : '📋 Kopieren'}</button>
            </div>
          )}

          {einst.aktiv && domains.length > 0 && (
            <div style={{ display: 'grid', gap: 4, fontSize: 13.5 }}>
              {domains.map((d) => (
                <div key={d.domain}>Auf Ihrer Domain: <a href={`https://${d.domain}${domainPfad()}`} target="_blank" rel="noopener noreferrer" style={k.link}>{d.domain}{domainPfad()} ↗</a>
                  {d.live && domains.length === 1 ? <span style={k.dim}> · Google führt die Fahrzeuge unter dieser Adresse</span> : null}</div>
              ))}
              <div style={k.dim}>Voraussetzung: die Domain ist im Website-Bauer eingetragen und mit ARGONAUT verbunden (DNS). Ihre Webseite zeigt dann oben den Menüpunkt „Fahrzeuge".</div>
            </div>
          )}
          {einst.aktiv && domains.length === 0 && <div style={k.dim}>Tipp: Tragen Sie im Website-Bauer Ihre eigene Domain ein (auch eine Subdomain wie fahrzeuge.ihr-autohaus.de) — dann läuft die Börse unter ihre-domain/fahrzeuge und Google führt die Fahrzeuge unter Ihrer Adresse.</div>}

          {zahlen && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {zahlen.sichtbar === 0 && <li style={{ color: C.warn }}>Noch kein Fahrzeug sichtbar. In der Fahrzeugakte (Reiter „Inserat") „Inserat ist online" anhaken.</li>}
              {zahlen.ohnePreis > 0 && <li style={{ color: C.warn }}>{zahlen.ohnePreis} sichtbar ohne Preis — erscheinen mit „Preis auf Anfrage".</li>}
              {zahlen.ohneEnergie > 0 && <li style={{ color: C.warn }}>{zahlen.ohneEnergie} sichtbar ohne vollständige Energie- und CO₂-Angaben (Verbrauch, CO₂, CO₂-Klasse) — bei Pkw in der Akte nachtragen.</li>}
              {zahlen.inseriertAberVerborgen > 0 && <li style={k.dim}>{zahlen.inseriertAberVerborgen} inseriert, aber reserviert, verkauft oder in einem anderen Status — erscheinen nicht.</li>}
              {firmaLuecken.length > 0 && <li style={{ color: C.bad }}>Für Impressum und Datenschutz-Hinweis fehlt: {firmaLuecken.join(', ')}. Bitte unter „Webauftritt" bei den Firmendaten ergänzen, bevor Sie den Link teilen.</li>}
              {zahlen.sichtbar > 0 && zahlen.ohnePreis === 0 && zahlen.ohneEnergie === 0 && firmaLuecken.length === 0 && <li style={{ color: C.ok }}>Alles vollständig.</li>}
            </ul>
          )}
          {fehler && <div style={k.fehler} role="alert">{fehler}</div>}
          {/* Paket 282 (K15b): Zusatzleistungen, Finanzierungsbeispiel, Rechner */}
          <KfzBoerseExtras betrieb={betrieb} istChef={istChef} roh={roh} onGespeichert={() => { void lade(betrieb); }} />
        </div>
      )}
    </div>
  );
}

const k: Record<string, CSSProperties> = {
  box: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12 },
  zeile: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 },
  dim: { color: C.dim, fontSize: 13 },
  link: { color: C.gold, fontWeight: 700, textDecoration: 'none', fontSize: 13.5 },
  btn: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer' },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer' },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 13.5, minWidth: 0 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px' },
};
