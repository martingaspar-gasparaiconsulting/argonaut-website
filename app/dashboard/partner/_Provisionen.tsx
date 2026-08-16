'use client';

// ============================================================================
// ARGONAUT OS · app/dashboard/partner/_Provisionen.tsx
//
// Die Provisions-Strecke: von der Vermittlung bis zur Auszahlung.
//
//   1. ERFASSEN   — von Hand oder direkt aus einem gewonnenen Deal
//   2. FAELLIG    — wenn der Kunde gezahlt hat und die Provision verdient ist
//   3. AUSZAHLEN  — mehrere Zeilen eines Partners zu EINER Gutschrift buendeln
//
// WARUM DIE AUSZAHLUNG BUENDELT
// Pro Vermittlung einen Beleg zu schreiben, waere bei laufender Beteiligung
// unbrauchbar: zwoelf Monate mal dreissig Kunden sind 360 Belege im Jahr. Ein
// Auszahlungslauf fasst alles Offene eines Partners zu einer Gutschrift mit
// einer Nummer zusammen — genau so, wie es der Steuerberater erwartet.
//
// WARUM DER SATZ JE ZEILE STEHT UND NICHT NUR AM PARTNER
// Der Partner-Satz ist der Vorschlag. War eine einzelne Vermittlung anders
// vereinbart, wird nur diese Zeile geaendert — die Konditionen des Partners
// bleiben unangetastet, und alte Abrechnungen aendern sich nicht rueckwirkend,
// wenn der Satz spaeter angepasst wird.
//
// Logik: lib/multiplikator.ts · Beleg: lib/provisionGutschriftPdf.ts
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  provisionBetrag, summen, erwartetGeld, modellVon, statusVon,
  baueGutschrift, laufKennung, pruefeZuordnung, perioden, fehlendePerioden,
  periodeAus, periodeLesbar, euro, prozent, ZUORDNUNG_LABEL,
  type Partner, type Zuordnung,
} from '@/lib/multiplikator';
import { provisionGutschriftPdf, fehlendeAngaben } from '@/lib/provisionGutschriftPdf';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type PartnerDb = Partner & {
  id: string;
  firma?: string | null; strasse?: string | null; plz?: string | null; ort?: string | null;
  steuernummer?: string | null; ust_id?: string | null;
};
type ZuordnungDb = Zuordnung & {
  id: string; kontakt_id?: string | null; quelle?: string | null; deal_id?: string | null;
  auszahlung_lauf?: string | null; beleg_nr?: string | null; erstellt_am?: string | null; notiz?: string | null;
};
type Deal = { id: string; titel: string | null; firma: string | null; wert_netto: number | null; kontakt_id: string | null };
type Profil = Record<string, unknown>;

const STATUS_FARBE: Record<string, string> = {
  offen: C.textDim, faellig: C.gold, ausgezahlt: C.green, storniert: C.danger,
};

function heuteISO() { return new Date().toISOString().slice(0, 10); }
function dtag(iso: string | null | undefined) {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

export default function PartnerProvisionen() {
  const [uid, setUid] = useState<string | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [partner, setPartner] = useState<PartnerDb[]>([]);
  const [zuordnungen, setZuordnungen] = useState<ZuordnungDb[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [filter, setFilter] = useState<string>('alle');
  const [zeigeDeals, setZeigeDeals] = useState(false);
  const [auszahlungFuer, setAuszahlungFuer] = useState<string | null>(null);

  const [form, setForm] = useState({
    partner_id: '', kunde_name: '', kontakt_id: '', basis_netto: '', satz_prozent: '',
    periode: '', faellig_am: heuteISO(), notiz: '',
  });
  const [formFehler, setFormFehler] = useState<string[]>([]);

  // ---- Laden ---------------------------------------------------------------
  const holen = useCallback(async () => {
    setLaden(true); setFehler(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    setUid(u.user.id);
    try {
      const [{ data: p }, { data: zz }, { data: pr }] = await Promise.all([
        supabase.from('provision_partner').select('*').order('name'),
        supabase.from('provision_zuordnung').select('*').order('erstellt_am', { ascending: false }),
        supabase.from('profiles').select('*').eq('id', u.user.id).maybeSingle(),
      ]);
      setPartner((p as PartnerDb[]) ?? []);
      setZuordnungen((zz as ZuordnungDb[]) ?? []);
      setProfil((pr as Profil) ?? null);
    } catch {
      setFehler('Die Provisionen konnten nicht geladen werden.');
    }
    setLaden(false);
  }, []);

  useEffect(() => { holen(); }, [holen]);

  const dealsHolen = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('crm_deal').select('id,titel,firma,wert_netto,kontakt_id')
        .eq('stufe', 'gewonnen').order('erstellt_am', { ascending: false }).limit(50);
      setDeals((data as Deal[]) ?? []);
    } catch {
      setFehler('Die gewonnenen Deals konnten nicht geladen werden.');
    }
  }, []);

  // ---- Abgeleitetes --------------------------------------------------------
  const aktivePartner = useMemo(
    () => partner.filter((p) => statusVon(p) !== 'beendet' && erwartetGeld(p)), [partner]);

  const gewaehlterPartner = useMemo(
    () => partner.find((p) => p.id === form.partner_id) ?? null, [partner, form.partner_id]);

  const vorschauBetrag = useMemo(
    () => provisionBetrag(form.basis_netto, form.satz_prozent), [form.basis_netto, form.satz_prozent]);

  const sichtbar = useMemo(() => {
    if (filter === 'alle') return zuordnungen;
    return zuordnungen.filter((z) => String(z.status ?? 'offen') === filter);
  }, [zuordnungen, filter]);

  const gesamt = useMemo(() => summen(zuordnungen), [zuordnungen]);

  /** Deals, die noch zu keiner Provision geführt haben. */
  const offeneDeals = useMemo(() => {
    const benutzt = new Set(zuordnungen.map((z) => String(z.deal_id ?? '')).filter(Boolean));
    return deals.filter((d) => !benutzt.has(d.id));
  }, [deals, zuordnungen]);

  const partnerName = useCallback(
    (id: string | null | undefined) => partner.find((p) => p.id === id)?.name ?? 'Unbekannt', [partner]);

  // ---- Partner wählen: Satz und Periode vorbelegen -------------------------
  const partnerWaehlen = (id: string) => {
    const p = partner.find((x) => x.id === id);
    const modell = p ? modellVon(p) : 'einmalig';
    setForm((f) => ({
      ...f,
      partner_id: id,
      satz_prozent: p?.satz_prozent != null ? String(p.satz_prozent) : f.satz_prozent,
      periode: modell === 'wiederkehrend' ? (f.periode || periodeAus(heuteISO())) : '',
    }));
    setFormFehler([]);
  };

  // ---- Anlegen -------------------------------------------------------------
  const anlegen = async () => {
    if (!uid) return;
    const entwurf: Zuordnung = {
      partner_id: form.partner_id, basis_netto: form.basis_netto, satz_prozent: form.satz_prozent,
    };
    const f = pruefeZuordnung(entwurf, gewaehlterPartner ?? undefined);
    setFormFehler(f);
    if (f.length > 0) return;

    setBusy(true);
    const betrag = provisionBetrag(form.basis_netto, form.satz_prozent);
    const { error } = await supabase.from('provision_zuordnung').insert({
      owner_user_id: uid,
      partner_id: form.partner_id,
      kontakt_id: form.kontakt_id || null,
      kunde_name: form.kunde_name.trim() || null,
      quelle: 'manuell',
      basis_netto: Number(String(form.basis_netto).replace(/\./g, '').replace(',', '.')) || 0,
      satz_prozent: Number(String(form.satz_prozent).replace(',', '.')) || 0,
      betrag,
      periode: form.periode || null,
      faellig_am: form.faellig_am || null,
      status: 'offen',
      notiz: form.notiz.trim() || null,
    });
    setBusy(false);
    if (error) {
      setFehler(error.message.includes('provision_zuordnung_periode_einmalig')
        ? 'Für diesen Partner, diesen Kunden und diesen Monat gibt es die Provision bereits.'
        : error.message);
      return;
    }
    setForm((f) => ({ ...f, kunde_name: '', kontakt_id: '', basis_netto: '', notiz: '' }));
    setMeldung('Provision eingetragen.');
    holen();
  };

  const ausDeal = async (d: Deal) => {
    if (!uid || !form.partner_id) { setFehler('Bitte zuerst oben einen Partner auswählen.'); return; }
    const p = gewaehlterPartner;
    const satz = Number(String(form.satz_prozent || p?.satz_prozent || 0).replace(',', '.')) || 0;
    const basis = Number(d.wert_netto ?? 0);
    if (satz <= 0 || basis <= 0) { setFehler('Für diesen Deal fehlt ein Netto-Wert oder ein Provisionssatz.'); return; }

    setBusy(true);
    const { error } = await supabase.from('provision_zuordnung').insert({
      owner_user_id: uid, partner_id: form.partner_id,
      kontakt_id: d.kontakt_id || null,
      kunde_name: (d.firma || d.titel || 'Vermittlung').trim(),
      quelle: 'crm_deal', deal_id: d.id,
      basis_netto: basis, satz_prozent: satz, betrag: provisionBetrag(basis, satz),
      faellig_am: heuteISO(), status: 'offen',
    });
    setBusy(false);
    if (error) { setFehler(error.message); return; }
    setMeldung(`Provision aus „${d.firma || d.titel}“ übernommen.`);
    holen();
  };

  const statusSetzen = async (id: string, status: string) => {
    const zusatz = status === 'ausgezahlt' ? { ausgezahlt_am: heuteISO() } : {};
    const { error } = await supabase.from('provision_zuordnung').update({ status, ...zusatz }).eq('id', id);
    if (error) { setFehler(error.message); return; }
    holen();
  };

  const entfernen = async (id: string) => {
    const { error } = await supabase.from('provision_zuordnung').delete().eq('id', id);
    if (error) { setFehler(error.message); return; }
    holen();
  };

  // ---- Fehlende Perioden bei laufender Beteiligung -------------------------
  const periodenNachtragen = async (p: PartnerDb) => {
    if (!uid) return;
    const eigene = zuordnungen.filter((z) => z.partner_id === p.id && z.periode);
    if (eigene.length === 0) {
      setFehler('Legen Sie zuerst eine erste Provision mit Periode an — daraus ergibt sich der Startmonat.');
      return;
    }
    const start = eigene.map((z) => String(z.periode)).sort()[0];
    const alle = perioden(`${start}-01`, p.laufzeit_monate);
    const kunden = new Map<string, { kontakt_id: string | null; kunde_name: string | null; basis: number; satz: number }>();
    for (const z of eigene) {
      const schluessel = String(z.kontakt_id ?? z.kunde_name ?? '');
      if (!kunden.has(schluessel)) {
        kunden.set(schluessel, {
          kontakt_id: z.kontakt_id ?? null, kunde_name: z.kunde_name ?? null,
          basis: Number(z.basis_netto ?? 0), satz: Number(z.satz_prozent ?? 0),
        });
      }
    }

    const neueZeilen: Array<Record<string, unknown>> = [];
    for (const [schluessel, k] of kunden) {
      const vorhanden = eigene
        .filter((z) => String(z.kontakt_id ?? z.kunde_name ?? '') === schluessel)
        .map((z) => z.periode);
      for (const periode of fehlendePerioden(alle, vorhanden)) {
        neueZeilen.push({
          owner_user_id: uid, partner_id: p.id,
          kontakt_id: k.kontakt_id, kunde_name: k.kunde_name,
          quelle: 'manuell', basis_netto: k.basis, satz_prozent: k.satz,
          betrag: provisionBetrag(k.basis, k.satz), periode, status: 'offen',
          faellig_am: `${periode}-01`,
        });
      }
    }

    if (neueZeilen.length === 0) { setMeldung('Es fehlt keine Periode.'); return; }
    if (neueZeilen.length > 200) { setFehler(`${neueZeilen.length} Zeilen wären zu viel auf einmal — bitte die Laufzeit prüfen.`); return; }

    setBusy(true);
    const { error } = await supabase.from('provision_zuordnung').insert(neueZeilen);
    setBusy(false);
    if (error) { setFehler(error.message); return; }
    setMeldung(`${neueZeilen.length} fehlende Perioden nachgetragen.`);
    holen();
  };

  // ---- Auszahlung ----------------------------------------------------------
  const auszahlbareVon = useCallback((pid: string) =>
    zuordnungen.filter((z) => z.partner_id === pid && ['offen', 'faellig'].includes(String(z.status ?? 'offen'))),
  [zuordnungen]);

  const auszahlen = async (p: PartnerDb) => {
    const zeilen = auszahlbareVon(p.id);
    if (zeilen.length === 0) { setFehler('Für diesen Partner ist nichts offen.'); return; }

    const g = baueGutschrift(p, zeilen);
    const periode = periodeAus(heuteISO());
    const vorhandeneLaeufe = new Set(
      zuordnungen.map((z) => String(z.auszahlung_lauf ?? '')).filter((x) => x.startsWith(`PROV-${periode}`)),
    );
    const nummer = laufKennung(periode, vorhandeneLaeufe.size + 1);

    const zeitraeume = zeilen.map((z) => z.periode).filter(Boolean) as string[];
    const zeitraum = zeitraeume.length > 0
      ? (zeitraeume.length === 1
        ? periodeLesbar(zeitraeume[0])
        : `${periodeLesbar(zeitraeume.sort()[0])} – ${periodeLesbar(zeitraeume.sort()[zeitraeume.length - 1])}`)
      : dtag(heuteISO());

    const daten = {
      nummer,
      datum: dtag(heuteISO()),
      leistungszeitraum: zeitraum,
      aussteller: {
        firma_name: String(profil?.firma_name ?? profil?.company_name ?? '') || null,
        firma_strasse: String(profil?.firma_strasse ?? '') || null,
        firma_plz: String(profil?.firma_plz ?? '') || null,
        firma_ort: String(profil?.firma_ort ?? '') || null,
        firma_steuernummer: String(profil?.firma_steuernummer ?? '') || null,
        firma_ust_id: String(profil?.firma_ust_id ?? '') || null,
        firma_email: String(profil?.firma_email ?? '') || null,
        firma_telefon: String(profil?.firma_telefon ?? '') || null,
        firma_iban: String(profil?.firma_iban ?? '') || null,
      },
      empfaenger: {
        name: p.name ?? null, firma: p.firma ?? null,
        strasse: p.strasse ?? null, plz: p.plz ?? null, ort: p.ort ?? null,
        steuernummer: p.steuernummer ?? null, ust_id: p.ust_id ?? null,
        iban: p.iban ?? null, kontoinhaber: p.kontoinhaber ?? null,
      },
      positionen: g.positionen,
      netto: g.netto, ustSatz: g.ustSatz, ust: g.ust, brutto: g.brutto,
      hinweis: g.hinweis,
    };

    setBusy(true);
    const { error } = await supabase.from('provision_zuordnung').update({
      status: 'ausgezahlt', ausgezahlt_am: heuteISO(), auszahlung_lauf: nummer, beleg_nr: nummer,
    }).in('id', zeilen.map((z) => z.id));
    setBusy(false);
    if (error) { setFehler(error.message); return; }

    provisionGutschriftPdf(daten);
    setAuszahlungFuer(null);
    setMeldung(`${zeilen.length} Provisionen als ausgezahlt gebucht · Gutschrift ${nummer} wurde erzeugt.`);
    holen();
  };

  // -------------------------------------------------------------------------
  return (
    <section style={s.card}>
      <h2 style={s.h2}>💶 Provisionen und Auszahlung</h2>
      <p style={s.sub}>
        Jede Vermittlung bekommt hier eine Zeile. Ist der Kunde bezahlt, stellen Sie die Provision
        fällig; ausgezahlt wird gebündelt — alle offenen Zeilen eines Partners werden zu einer
        Gutschrift zusammengefasst.
      </p>

      {fehler && <div style={s.err}>{fehler}<button style={s.x} onClick={() => setFehler(null)}>✕</button></div>}
      {meldung && <div style={s.ok}>{meldung}<button style={s.x} onClick={() => setMeldung(null)}>✕</button></div>}

      <div style={s.kpis}>
        <div style={s.kpi}><div style={{ ...s.kpiZahl, color: C.textDim }}>{euro(gesamt.offen)}</div><div style={s.kpiText}>offen</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiZahl, color: C.gold }}>{euro(gesamt.faellig)}</div><div style={s.kpiText}>fällig</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiZahl, color: C.green }}>{euro(gesamt.ausgezahlt)}</div><div style={s.kpiText}>ausgezahlt</div></div>
      </div>

      {/* ---------- Erfassen ---------- */}
      <div style={s.block}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Neue Vermittlung eintragen</div>

        {aktivePartner.length === 0 ? (
          <p style={s.dim}>
            Noch kein Partner mit Provisionsmodell angelegt. Partner mit Gegengeschäft erscheinen hier
            bewusst nicht — bei ihnen wird kein Geld fällig.
          </p>
        ) : (
          <>
            <div style={s.gitter}>
              <Feld label="Partner *">
                <select style={s.in} value={form.partner_id} onChange={(e) => partnerWaehlen(e.target.value)}>
                  <option value="">— bitte wählen —</option>
                  {aktivePartner.map((p) => <option key={p.id} value={p.id}>{p.name}{p.firma ? ` · ${p.firma}` : ''}</option>)}
                </select>
              </Feld>
              <Feld label="Vermittelter Kunde">
                <input style={s.in} value={form.kunde_name} placeholder="Firmenname oder Person"
                  onChange={(e) => setForm({ ...form, kunde_name: e.target.value })} />
              </Feld>
              <Feld label="Netto-Umsatz *">
                <input style={s.in} value={form.basis_netto} inputMode="decimal" placeholder="z. B. 4.800,00"
                  onChange={(e) => setForm({ ...form, basis_netto: e.target.value })} />
              </Feld>
              <Feld label="Satz in % *">
                <input style={s.in} value={form.satz_prozent} inputMode="decimal"
                  onChange={(e) => setForm({ ...form, satz_prozent: e.target.value })} />
              </Feld>
              {gewaehlterPartner && modellVon(gewaehlterPartner) === 'wiederkehrend' && (
                <Feld label="Monat">
                  <input style={s.in} type="month" value={form.periode}
                    onChange={(e) => setForm({ ...form, periode: e.target.value })} />
                </Feld>
              )}
              <Feld label="Fällig am">
                <input style={s.in} type="date" value={form.faellig_am}
                  onChange={(e) => setForm({ ...form, faellig_am: e.target.value })} />
              </Feld>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              <span style={{ fontSize: 15 }}>
                Provision: <b style={{ color: C.gold, fontSize: 17 }}>{euro(vorschauBetrag)}</b>
              </span>
              <button style={s.btnGold} onClick={anlegen} disabled={busy}>Eintragen</button>
              <button style={s.btnMini} onClick={() => { setZeigeDeals(!zeigeDeals); if (!zeigeDeals) dealsHolen(); }}>
                {zeigeDeals ? 'Deals ausblenden' : 'Aus gewonnenem Deal übernehmen'}
              </button>
            </div>

            {formFehler.length > 0 && <ul style={s.fehlerListe}>{formFehler.map((f, i) => <li key={i}>{f}</li>)}</ul>}

            {zeigeDeals && (
              <div style={{ marginTop: 12 }}>
                <p style={s.hint}>
                  Gewonnene Deals, für die noch keine Provision eingetragen ist. Der Satz oben wird übernommen.
                </p>
                {offeneDeals.length === 0 ? <p style={s.dim}>Keine offenen Deals.</p> : offeneDeals.map((d) => (
                  <div key={d.id} style={s.zeile}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{d.firma || d.titel || 'Ohne Titel'}</b>
                      <span style={{ color: C.textDim }}> · {euro(d.wert_netto ?? 0)} netto</span>
                    </span>
                    <button style={s.btnMini} onClick={() => ausDeal(d)} disabled={busy}>Übernehmen</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------- Auszahlung ---------- */}
      <div style={s.block}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Auszahlung</div>
        {partner.filter((p) => erwartetGeld(p) && auszahlbareVon(p.id).length > 0).length === 0 ? (
          <p style={s.dim}>Zurzeit steht nichts zur Auszahlung an.</p>
        ) : partner.filter((p) => erwartetGeld(p) && auszahlbareVon(p.id).length > 0).map((p) => {
          const zeilen = auszahlbareVon(p.id);
          const g = baueGutschrift(p, zeilen);
          const offenerBlock = auszahlungFuer === p.id;
          const luecken = fehlendeAngaben({
            nummer: '', datum: '', leistungszeitraum: '',
            aussteller: {
              firma_name: String(profil?.firma_name ?? '') || null,
              firma_strasse: String(profil?.firma_strasse ?? '') || null,
              firma_ort: String(profil?.firma_ort ?? '') || null,
            },
            empfaenger: {
              name: p.name ?? null, firma: p.firma ?? null, strasse: p.strasse ?? null,
              ort: p.ort ?? null, steuernummer: p.steuernummer ?? null, ust_id: p.ust_id ?? null,
            },
            positionen: [], netto: 0, ustSatz: 0, ust: 0, brutto: 0, hinweis: '',
          });

          return (
            <div key={p.id} style={s.zeile}>
              <span style={{ flex: 1, minWidth: 200 }}>
                <b>{p.name}</b>
                <span style={{ color: C.textDim }}> · {zeilen.length} {zeilen.length === 1 ? 'Zeile' : 'Zeilen'}</span>
                <br />
                <span style={{ color: C.textDim, fontSize: 13 }}>
                  {euro(g.netto)} netto
                  {g.ustSatz > 0 ? ` · zzgl. ${g.ustSatz} % USt · ${euro(g.brutto)} brutto` : ' · ohne USt (§ 19)'}
                </span>
                {luecken.length > 0 && (
                  <><br /><span style={{ color: C.warn, fontSize: 12.5 }}>Für den Beleg fehlt noch: {luecken.join(', ')}</span></>
                )}
              </span>
              {!offenerBlock ? (
                <button style={s.btnMini} onClick={() => setAuszahlungFuer(p.id)}>Auszahlen …</button>
              ) : (
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={s.btnGold} onClick={() => auszahlen(p)} disabled={busy}>
                    {busy ? 'Bucht …' : 'Buchen & Gutschrift erzeugen'}
                  </button>
                  <button style={s.btnMiniGrau} onClick={() => setAuszahlungFuer(null)}>Abbrechen</button>
                </span>
              )}
            </div>
          );
        })}

        {/* Perioden nachtragen */}
        {partner.filter((p) => modellVon(p) === 'wiederkehrend' && statusVon(p) === 'aktiv').map((p) => (
          <div key={`per-${p.id}`} style={{ ...s.zeile, borderStyle: 'dashed' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{p.name}</b>
              <span style={{ color: C.textDim }}> · laufende Beteiligung über {p.laufzeit_monate ?? '?'} Monate</span>
            </span>
            <button style={s.btnMini} onClick={() => periodenNachtragen(p)} disabled={busy}>
              Fehlende Monate nachtragen
            </button>
          </div>
        ))}
      </div>

      {/* ---------- Liste ---------- */}
      <div style={s.block}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, flex: 1 }}>Alle Provisionen</span>
          <select style={{ ...s.in, width: 'auto', padding: '6px 10px', fontSize: 13 }}
            value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="alle">Alle anzeigen</option>
            {Object.entries(ZUORDNUNG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {laden ? <p style={s.dim}>Lädt …</p> : sichtbar.length === 0 ? (
          <p style={s.dim}>Keine Einträge.</p>
        ) : (
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {sichtbar.map((z) => {
              const st = String(z.status ?? 'offen');
              return (
                <div key={z.id} style={s.zeile}>
                  <span style={{ ...s.pille, color: STATUS_FARBE[st] ?? C.textDim, borderColor: STATUS_FARBE[st] ?? C.textDim }}>
                    {ZUORDNUNG_LABEL[st as keyof typeof ZUORDNUNG_LABEL] ?? st}
                  </span>
                  <span style={{ flex: 1, minWidth: 160 }}>
                    <b>{z.kunde_name || 'Vermittlung'}</b>
                    <span style={{ color: C.textDim }}> → {partnerName(z.partner_id)}</span>
                    <br />
                    <span style={{ color: C.textDim, fontSize: 13 }}>
                      {prozent(z.satz_prozent)} aus {euro(z.basis_netto)}
                      {z.periode ? ` · ${periodeLesbar(z.periode)}` : ''}
                      {z.quelle === 'crm_deal' ? ' · aus Deal' : ''}
                      {z.beleg_nr ? ` · ${z.beleg_nr}` : ''}
                    </span>
                  </span>
                  <b style={{ color: STATUS_FARBE[st] ?? C.text, minWidth: 90, textAlign: 'right' }}>{euro(z.betrag)}</b>

                  {st === 'offen' && <button style={s.btnMini} onClick={() => statusSetzen(z.id, 'faellig')}>Fällig stellen</button>}
                  {st === 'faellig' && <button style={s.btnMiniGrau} onClick={() => statusSetzen(z.id, 'offen')}>Zurück auf offen</button>}
                  {st !== 'ausgezahlt' && st !== 'storniert' && (
                    <button style={s.btnMiniRot} onClick={() => statusSetzen(z.id, 'storniert')}>Stornieren</button>
                  )}
                  {st === 'storniert' && <button style={s.btnMiniRot} onClick={() => entfernen(z.id)}>Löschen</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ display: 'block', color: C.textDim, fontSize: 12.5, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

const s: Record<string, CSSProperties> = {
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 16, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 18, fontWeight: 700, margin: '0 0 10px' },
  sub: { color: C.textDim, fontSize: 14.5, lineHeight: 1.55, margin: 0, maxWidth: 840 },
  kpis: { display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' },
  kpi: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 18px', minWidth: 140 },
  kpiZahl: { fontSize: 20, fontWeight: 800 },
  kpiText: { color: C.textDim, fontSize: 12.5, marginTop: 2 },
  block: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 14 },
  gitter: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 12px' },
  in: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', color: C.text, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  btnMini: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 8, padding: '5px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  btnMiniGrau: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  btnMiniRot: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8 },
  pille: { border: '1px solid', borderRadius: 999, padding: '2px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  fehlerListe: { color: C.danger, fontSize: 14, margin: '10px 0 0', paddingLeft: 20 },
  hint: { color: C.textDim, fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 4 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', gap: 10 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', gap: 10 },
  x: { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: 0 },
};
