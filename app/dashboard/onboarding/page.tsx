'use client';

// ============================================================
// ARGONAUT OS · Onboarding · Geführte Startstrecke (branchenaware)
// Universelle Grundschritte + branchenspezifische Schritte (aus
// lib/onboardingBranchen.ts, gelesen aus profiles.kategorie).
// Jeder Schritt hat eine anfängerfreundliche „So geht's"-Anleitung.
// Auto-Erkennung: Firmendaten/IBAN/erste Rechnung + Zeilenzahl je Modul-Tabelle.
// Übungswelt: zentraler Schalter (lädt/entfernt Beispieldaten via /api/uebungswelt).
// Pfad: app/dashboard/onboarding/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { branchenSchritte, type BranchenSchritt } from '@/lib/onboardingBranchen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
};

type Lage = { firma: boolean; iban: boolean; kontakte: number; rechnungen: number; angebote: number; zahlungAktiv: boolean };
type UniSchritt = { key: string; icon: string; titel: string; text: string; tipp: string; link: string; auto: (l: Lage) => boolean; optional?: boolean };
type RenderSchritt = { key: string; icon: string; titel: string; text: string; tipp: string; link: string; optional?: boolean; autoDone: boolean };

const SCHRITTE: UniSchritt[] = [
  { key: 'firma', icon: '🏢', titel: 'Firmendaten hinterlegen', text: 'Name, Anschrift, Steuernummer/USt-IdNr — steht auf jeder Rechnung.', tipp: 'Geh in Einstellungen und trag deine Firmendaten ein. Sie erscheinen automatisch auf jeder Rechnung und jedem Angebot — also einmal richtig, danach nie wieder tippen.', link: '/dashboard/einstellungen', auto: (l) => l.firma },
  { key: 'logo', icon: '🎨', titel: 'Logo & Farben', text: 'Corporate Design für PDFs, Angebote und das Kundenportal.', tipp: 'Lade dein Logo hoch und wähle deine Farbe. Damit sehen deine PDFs und dein Kundenportal nach dir aus, nicht nach Software von der Stange.', link: '/dashboard/einstellungen', auto: () => false },
  { key: 'bank', icon: '🏦', titel: 'Bankverbindung & SEPA', text: 'IBAN + Gläubiger-ID — für Rechnung, GiroCode und Lastschrift.', tipp: 'Trag deine IBAN ein. Dann kann ARGONAUT auf jede Rechnung einen GiroCode zum Scannen setzen und später auch Lastschriften einziehen.', link: '/dashboard/sepa-einzug', auto: (l) => l.iban },
  { key: 'import', icon: '📥', titel: 'Bestehende Daten importieren', text: 'Kunden, Lieferanten, Artikel & Co. aus deinem alten System übernehmen.', tipp: 'Hast du schon Daten in Excel oder einem alten Programm? Im Import-Center lädst du je Bereich eine fertige CSV-Vorlage, füllst sie mit deinen Daten und spielst sie ein — so ist dein ARGONAUT in Minuten gefüllt, statt alles einzeln abzutippen.', link: '/dashboard/import', auto: () => false, optional: true },
  { key: 'kontakt', icon: '🤝', titel: 'Ersten Kontakt anlegen', text: 'Kunde oder Firma im CRM erfassen.', tipp: 'Leg deinen ersten Kunden im CRM an — oder importiere gleich deine ganze Kundenliste über das Import-Center. Danach kannst du Angebote und Rechnungen an ihn schreiben.', link: '/dashboard/crm', auto: (l) => l.kontakte > 0 },
  { key: 'angebot', icon: '📝', titel: 'Erstes Angebot erstellen', text: 'Angebot mit Online-Zusage und „→ zur Unterschrift".', tipp: 'Erstelle ein Angebot und schick es raus. Der Kunde kann online zusagen und unterschreiben — aus dem Angebot wird per Klick ein Auftrag oder eine Rechnung.', link: '/dashboard/angebote', auto: (l) => l.angebote > 0 },
  { key: 'rechnung', icon: '🧾', titel: 'Erste Rechnung erstellen', text: 'Mit GiroCode und optionalem Online-Bezahllink.', tipp: 'Schreib deine erste Rechnung. Sie ist §14-konform, bekommt eine fortlaufende Nummer und einen GiroCode — der Kunde zahlt per Handy-Scan.', link: '/dashboard/rechnungen', auto: (l) => l.rechnungen > 0 },
  { key: 'zahlung', icon: '💳', titel: 'Zahlungsanbieter verbinden', text: 'Eigenen Bezahllink für „Jetzt online bezahlen" (optional).', tipp: 'Optional: Verbinde einen Bezahldienst, damit Kunden per Klick online zahlen können. Kannst du auch später machen.', link: '/dashboard/schnittstellen', auto: (l) => l.zahlungAktiv, optional: true },
  { key: 'anschluesse', icon: '🔌', titel: 'Anschlüsse verbinden', text: 'Postfach & Kalender, Bank, Marktplätze, ELSTER — sicher hinterlegen.', tipp: 'Im Anschlüsse-Cockpit verbindest du an einem Ort dein Postfach & Kalender (Outlook/Google), deine Bank, deine Marktplätze und ELSTER. Alle Zugänge werden verschlüsselt gespeichert und sind nie im Browser sichtbar. Du kannst sie schon jetzt eintragen — der automatische Abgleich wird gerade finalisiert.', link: '/dashboard/anschluesse', auto: () => false, optional: true },
  { key: 'module', icon: '🧩', titel: 'Module & Team einrichten', text: 'Passende Module aktivieren, Mitarbeiter einladen.', tipp: 'Lade deine Mitarbeiter ein und gib ihnen nur die Bereiche frei, die sie brauchen. Jeder sieht dann genau seinen Ausschnitt.', link: '/dashboard/einstellungen', auto: () => false },
];

export default function OnboardingPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [lage, setLage] = useState<Lage>({ firma: false, iban: false, kontakte: 0, rechnungen: 0, angebote: 0, zahlungAktiv: false });
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [manuell, setManuell] = useState<Set<string>>(new Set());
  const [offeneTipps, setOffeneTipps] = useState<Set<string>>(new Set());
  const [weltGeladen, setWeltGeladen] = useState(false);
  const [weltAnzahl, setWeltAnzahl] = useState(0);
  const [weltBusy, setWeltBusy] = useState(false);
  const [laden, setLaden] = useState(true);

  const laden_ = useCallback(async (id: string) => {
    const { data: p } = await supabase.from('profiles').select('firma_name, sepa_iban, kategorie').eq('id', id).maybeSingle();
    const kat = (p?.kategorie && String(p.kategorie).trim()) ? String(p.kategorie).trim() : null;
    setKategorie(kat);

    const zaehle = async (tab: string) => {
      try { const { count } = await supabase.from(tab).select('*', { count: 'exact', head: true }); return count || 0; } catch { return 0; }
    };
    const [kontakte, rechnungen, angebote] = await Promise.all([zaehle('kontakte'), zaehle('rechnungen'), zaehle('angebote')]);
    let zahlungAktiv = false;
    try {
      const { data: zi } = await supabase.from('betrieb_integrationen').select('anbieter, aktiv').eq('typ', 'zahlung').maybeSingle();
      zahlungAktiv = !!zi && zi.aktiv === true && zi.anbieter !== 'kein';
    } catch { /* optional */ }
    setLage({ firma: !!(p?.firma_name && String(p.firma_name).trim()), iban: !!(p?.sepa_iban && String(p.sepa_iban).trim()), kontakte, rechnungen, angebote, zahlungAktiv });

    // Branchenschritte: Zeilenzahl je hinterlegter Tabelle (fehlertolerant)
    const tabellen = Array.from(new Set(branchenSchritte(kat).map((s) => s.tabelle).filter((t): t is string => !!t)));
    if (tabellen.length > 0) {
      const werte = await Promise.all(tabellen.map((t) => zaehle(t)));
      const map: Record<string, number> = {};
      tabellen.forEach((t, i) => { map[t] = werte[i]; });
      setCounts(map);
    }

    try {
      const { data: os } = await supabase.from('onboarding_schritte').select('schritt_key, erledigt');
      setManuell(new Set(((os as Array<{ schritt_key: string; erledigt: boolean }>) || []).filter((x) => x.erledigt).map((x) => x.schritt_key)));
    } catch { /* Tabelle evtl. noch nicht eingespielt */ }
  }, []);

  const weltStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/uebungswelt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'status' }) });
      const j = await r.json();
      setWeltGeladen(!!j?.geladen);
      setWeltAnzahl(Number(j?.anzahl) || 0);
    } catch { /* egal */ }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setLaden(false); return; }
      setUid(id);
      await laden_(id);
      await weltStatus();
      setLaden(false);
    })();
  }, [laden_, weltStatus]);

  const uniRender: RenderSchritt[] = SCHRITTE.map((s) => ({ key: s.key, icon: s.icon, titel: s.titel, text: s.text, tipp: s.tipp, link: s.link, optional: s.optional, autoDone: s.auto(lage) }));
  const branchRender: RenderSchritt[] = branchenSchritte(kategorie).map((s: BranchenSchritt) => ({
    key: s.key, icon: s.icon, titel: s.titel, text: s.text, tipp: s.tipp, link: s.link, optional: s.optional,
    autoDone: s.tabelle ? (counts[s.tabelle] || 0) > 0 : false,
  }));
  const alle = [...uniRender, ...branchRender];

  function erledigt(s: RenderSchritt) { return s.autoDone || manuell.has(s.key); }
  const fertig = alle.filter(erledigt).length;
  const prozent = alle.length > 0 ? Math.round((fertig / alle.length) * 100) : 0;

  async function toggle(s: RenderSchritt) {
    if (!uid) return;
    if (manuell.has(s.key)) {
      await supabase.from('onboarding_schritte').delete().eq('owner_user_id', uid).eq('schritt_key', s.key);
      setManuell((m) => { const n = new Set(m); n.delete(s.key); return n; });
    } else {
      await supabase.from('onboarding_schritte').upsert({ owner_user_id: uid, schritt_key: s.key, erledigt: true, erledigt_am: new Date().toISOString() }, { onConflict: 'owner_user_id,schritt_key' });
      setManuell((m) => new Set(m).add(s.key));
    }
  }
  function tippToggle(key: string) {
    setOffeneTipps((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  async function weltLaden() {
    if (weltBusy || weltGeladen) return;
    setWeltBusy(true);
    try {
      await fetch('/api/uebungswelt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'laden' }) });
      await weltStatus();
      if (uid) await laden_(uid);
    } finally {
      setWeltBusy(false);
    }
  }
  async function weltEntfernen() {
    if (weltBusy) return;
    setWeltBusy(true);
    try {
      await fetch('/api/uebungswelt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'entfernen' }) });
      await weltStatus();
      if (uid) await laden_(uid);
    } finally {
      setWeltBusy(false);
    }
  }

  function zeile(s: RenderSchritt) {
    const done = erledigt(s);
    const tippOffen = offeneTipps.has(s.key);
    return (
      <div key={s.key} style={{ ...styles.zeile, borderColor: done ? 'rgba(76,175,125,0.5)' : C.border }}>
        <div style={styles.zeileKopf}>
          <div style={{ ...styles.check, background: done ? C.green : 'transparent', borderColor: done ? C.green : C.textDim }}>{done ? '✓' : ''}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{s.icon} {s.titel} {s.optional && <span style={styles.opt}>optional</span>}</div>
            <div style={{ color: C.textDim, fontSize: 13 }}>{s.text}</div>
            <button style={styles.tippBtn} onClick={() => tippToggle(s.key)}>{tippOffen ? '▾ So geht’s' : '▸ So geht’s'}</button>
          </div>
          <a href={s.link} style={styles.oeffnen}>Öffnen ›</a>
          {s.autoDone
            ? <span style={styles.autoBadge}>automatisch erkannt</span>
            : <button style={styles.hakBtn} onClick={() => toggle(s)}>{manuell.has(s.key) ? 'Haken entfernen' : 'Als erledigt'}</button>}
        </div>
        {tippOffen && <div style={styles.tippBox}>💡 {s.tipp}</div>}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🚀 Erste Schritte mit ARGONAUT</h1>
      <p style={styles.sub}>Deine geführte Startstrecke. Vieles erkennt ARGONAUT automatisch — den Rest hakst du selbst ab.</p>

      <div style={styles.anleitung}>
        <b>Zwei Wege — such dir aus, wie du starten willst:</b><br />
        <b>1 · Gefahrlos üben:</b> Lade dir unten die <b>Übungswelt</b> mit Beispieldaten und klick dich durch alles durch — nichts vermischt sich mit echten Daten, ein Klick entfernt es wieder.<br />
        <b>2 · Echt einrichten:</b> Arbeite die Schritte von oben nach unten ab. Was ARGONAUT schon erkennt, ist grün abgehakt; bei jedem Schritt öffnet <b>▸ So geht’s</b> eine kurze Anleitung. Dann „Öffnen" klicken, erledigen — fertig.
      </div>

      <a href="/dashboard/import" style={styles.importBanner}>
        <span style={styles.importBannerIcon}>📥</span>
        <span style={styles.importBannerText}>
          <b>Schon Daten aus deinem alten System?</b> Kunden, Artikel, Lieferanten & Co. per fertiger CSV-Vorlage in Minuten übernehmen — statt alles einzeln abzutippen.
        </span>
        <span style={styles.importBannerCta}>Zum Import-Center ›</span>
      </a>

      {!laden && (
        <div style={styles.beispielBox}>
          <div style={styles.beispielKopf}>
            <span style={styles.beispielIcon}>🎁</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>Übungswelt · Beispieldaten zum Ausprobieren</div>
              <div style={{ color: C.textDim, fontSize: 13, lineHeight: 1.5 }}>
                {weltGeladen
                  ? `Deine Übungswelt ist geladen (${weltAnzahl} Beispiel-Datensätze). Probier alles gefahrlos aus — und entferne sie mit einem Klick, wenn du mit deinen echten Daten startest.`
                  : 'Lade dir eine Übungswelt mit branchentypischen Beispieldaten und probiere ARGONAUT völlig gefahrlos aus. Nichts davon vermischt sich mit echten Daten — ein Klick lädt alles, ein Klick entfernt es restlos.'}
              </div>
            </div>
          </div>
          <div style={styles.beispielAktionen}>
            {weltGeladen ? (
              <>
                <a href="/dashboard/crm" style={styles.beispielCta}>Im CRM ansehen ›</a>
                <button onClick={weltEntfernen} disabled={weltBusy} style={styles.beispielEntfernen}>
                  {weltBusy ? 'Bitte warten …' : 'Übungswelt entfernen'}
                </button>
              </>
            ) : (
              <button onClick={weltLaden} disabled={weltBusy} style={styles.beispielBtn}>
                {weltBusy ? 'Lädt …' : '🎁 Übungswelt laden'}
              </button>
            )}
          </div>
        </div>
      )}

      <div style={styles.fortschritt}>
        <div style={styles.balken}><div style={{ ...styles.balkenFill, width: `${prozent}%` }} /></div>
        <div style={styles.fortText}>{fertig} von {alle.length} erledigt · <b style={{ color: prozent === 100 ? C.green : C.gold }}>{prozent}%</b></div>
      </div>

      {prozent === 100 && <div style={styles.fertigBox}>🎉 Stark — dein ARGONAUT ist startklar! Alle Schritte sind erledigt.</div>}

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <>
          <div style={styles.liste}>{uniRender.map(zeile)}</div>

          {branchRender.length > 0 && (
            <>
              <div style={styles.branchenTitel}>
                <span style={{ color: C.gold }}>Speziell für deine Branche</span>
                {kategorie && <span style={styles.branchenChip}>{kategorie}</span>}
              </div>
              <div style={styles.liste}>{branchRender.map(zeile)}</div>
            </>
          )}

          {branchRender.length === 0 && !laden && (
            <div style={styles.branchHinweis}>
              Für noch mehr Starthilfe hinterlege deine Branche in den Einstellungen — dann zeigt ARGONAUT dir hier zusätzliche, passgenaue Schritte.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 760 },
  anleitung: { marginTop: 14, background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', color: C.textDim, fontSize: 13.5, lineHeight: 1.55 },
  importBanner: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, background: 'linear-gradient(90deg, rgba(201,168,76,0.12), rgba(0,229,255,0.06))', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 12, padding: '13px 16px', textDecoration: 'none', color: C.text },
  importBannerIcon: { fontSize: 24, lineHeight: 1, flexShrink: 0 },
  importBannerText: { flex: 1, fontSize: 13.5, lineHeight: 1.5, color: C.text },
  importBannerCta: { color: C.cyan, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', flexShrink: 0 },
  beispielBox: { marginTop: 12, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  beispielKopf: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  beispielIcon: { fontSize: 24, lineHeight: 1, flexShrink: 0 },
  beispielAktionen: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  beispielBtn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  beispielCta: { color: C.cyan, textDecoration: 'none', fontWeight: 700, fontSize: 13.5, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 13px' },
  beispielEntfernen: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 13px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' },
  fortschritt: { marginTop: 18 },
  balken: { height: 12, background: 'rgba(143,163,190,0.15)', borderRadius: 999, overflow: 'hidden' },
  balkenFill: { height: '100%', background: `linear-gradient(90deg, ${C.gold}, ${C.green})`, borderRadius: 999, transition: 'width .3s' },
  fortText: { color: C.textDim, fontSize: 13, marginTop: 7 },
  fertigBox: { marginTop: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid ${C.green}`, borderRadius: 12, padding: '13px 16px', color: C.text, fontSize: 15, fontWeight: 600 },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  zeile: { background: C.navy2, border: '1px solid', borderRadius: 14, padding: '14px 16px' },
  zeileKopf: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  check: { width: 26, height: 26, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.navy, fontWeight: 800, flexShrink: 0 },
  opt: { fontSize: 11, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '1px 8px', fontWeight: 600, marginLeft: 4 },
  tippBtn: { marginTop: 6, background: 'transparent', color: C.cyan, border: 'none', padding: 0, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
  tippBox: { marginTop: 10, background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', color: C.text, fontSize: 13.5, lineHeight: 1.6 },
  oeffnen: { color: C.cyan, textDecoration: 'none', fontWeight: 700, fontSize: 13.5, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 13px', whiteSpace: 'nowrap' },
  autoBadge: { color: C.green, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  hakBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 13px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  branchenTitel: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 28, fontFamily: 'var(--font-syne), sans-serif', fontSize: 18, fontWeight: 800 },
  branchenChip: { fontSize: 12, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 10px', fontWeight: 600, fontFamily: 'var(--font-dm-sans), sans-serif' },
  branchHinweis: { marginTop: 20, background: C.navy2, border: `1px dashed ${C.border}`, borderRadius: 12, padding: '14px 16px', color: C.textDim, fontSize: 13.5, lineHeight: 1.55 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
};
