"use client";
// ============================================================================
// ARGONAUT OS · Paket 323 (S4) · /dashboard/shop/sprachen
//
// Shop mehrsprachig: 24 Sprachen wie im mehrsprachigen Team (Paket PM).
//   · Sprachen    Übersicht je Sprache (Oberfläche, Produkt-Texte, Dokumente)
//                 und „im Shop anbieten" (nur Geschäftsleitung)
//   · Produkte    Name und Beschreibung je Artikel: KI-Vorschlag mit wörtlicher
//                 Rückübersetzung, bearbeiten, freigeben
//   · Oberfläche  Knöpfe und Hinweise des Shops; Englisch ist fest eingebaut
//
// Die KI schlägt nur vor (über /api/uebersetzen, Modus „shop"). Sichtbar im Shop
// wird nur, was die Geschäftsleitung freigibt — die Datenbank prüft das selbst
// (Wächter p323). Ändert sich der deutsche Text, gilt die Übersetzung als
// veraltet und der Shop zeigt wieder Deutsch.
// Preise, Währung und Zahlen werden nie übersetzt. Rechtstexte bleiben deutsch.
// ============================================================================
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Leerzustand from "../../_components/Leerzustand";
import { startFrei } from "@/lib/startSperre";
import { useFreigabeStand } from "@/lib/useFreigabeStand";
import { spracheFuer } from "@/lib/mehrsprachig";
import {
  FREMD_SPRACHEN, EINGEBAUT, TEXT_DE, TEXT_EN, TEXT_KEYS, STATUS_INFO, darfAnbieten, freigabeFehler,
  inPakete, oberflaecheFuer, platzhalter, pruefeOberflaeche, saubereTexte, uebersetzAuftrag, uebersetzungsStatus,
  zeileFuerSpeichern, dokSprachen, type TextKey, type UebersetzungZeile, type UStatus,
} from "@/lib/shopSprachen";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  navy: "#0A1628", navy2: "#0F1F33", gold: "#C9A84C", cyan: "#00e5ff",
  green: "#4CAF7D", danger: "#E06666", warn: "#E0A24C", textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};
const FARBE: Record<string, string> = { grau: C.textDim, gelb: C.warn, gruen: C.green, rot: C.danger };

type Reiter = "sprachen" | "produkte" | "oberflaeche";
const REITER: { key: Reiter; label: string }[] = [
  { key: "sprachen", label: "🌐 Sprachen" },
  { key: "produkte", label: "🛍️ Produkt-Texte" },
  { key: "oberflaeche", label: "🔤 Shop-Oberfläche" },
];

type Artikel = { id: string; bezeichnung: string | null; shop_beschreibung: string | null; artikelnummer: string | null };
type SprachZeile = { id: string; sprache: string; aktiv: boolean; texte: unknown; status: string; freigegeben_am: string | null };
type UZeile = UebersetzungZeile & { id: string; artikel_id: string; freigegeben_am: string | null };
type Dok = { artikel_id: string; sprache: string | null };

type KiErgebnis = { text: string; rueck: string | null; hinweise: string[] } | null;

async function uebersetzen(ziel: string, texte: string[]): Promise<{ ergebnisse: KiErgebnis[]; hinweise: string[] }> {
  const r = await fetch("/api/uebersetzen", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ziel, modus: "shop", texte }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || "Die Übersetzung ist gerade nicht erreichbar.");
  return { ergebnisse: Array.isArray(d.ergebnisse) ? d.ergebnisse : [], hinweise: Array.isArray(d.hinweise) ? d.hinweise : [] };
}

async function alleSeiten<T>(laden: (von: number, bis: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ zeilen: T[]; fehler: boolean }> {
  const zeilen: T[] = [];
  for (let von = 0; von < 50000; von += 1000) {
    const { data, error } = await laden(von, von + 999);
    if (error) return { zeilen, fehler: true };
    const d = (data as T[]) ?? [];
    zeilen.push(...d);
    if (d.length < 1000) break;
  }
  return { zeilen, fehler: false };
}

function deutsch(a: Artikel) { return { name: a.bezeichnung, beschreibung: a.shop_beschreibung }; }
function sprachText(code: string) { const s = spracheFuer(code); return s ? `${s.name} · ${s.eigen}` : code; }

export default function ShopSprachenSeite() {
  const freigabe = useFreigabeStand().start; // Paket 346: Code ODER Freigabe-Zentrale
  const [reiter, setReiter] = useState<Reiter>("sprachen");
  const [code, setCode] = useState<string>(EINGEBAUT);
  const [istChef, setIstChef] = useState(false);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [sprachen, setSprachen] = useState<SprachZeile[]>([]);
  const [uebers, setUebers] = useState<UZeile[]>([]);
  const [doks, setDoks] = useState<Dok[]>([]);

  const neuLaden = useCallback(async () => {
    setFehler(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLaden(false); return; }
    let chef: string | null = null;
    try { chef = ((await supabase.rpc("mein_chef_id")).data as string | null) ?? null; } catch { chef = null; }
    setIstChef(!chef);
    setBetrieb(chef || user.id);

    const [a, s, u, d] = await Promise.all([
      alleSeiten<Artikel>((v, b) => supabase.from("artikel").select("id, bezeichnung, shop_beschreibung, artikelnummer")
        .eq("im_shop", true).order("bezeichnung", { ascending: true }).order("id", { ascending: true }).range(v, b)),
      alleSeiten<SprachZeile>((v, b) => supabase.from("shop_sprache").select("id, sprache, aktiv, texte, status, freigegeben_am")
        .order("sprache", { ascending: true }).range(v, b)),
      alleSeiten<UZeile>((v, b) => supabase.from("shop_uebersetzung")
        .select("id, artikel_id, sprache, name, beschreibung, rueck_name, rueck_beschreibung, quelle_hash, status, freigegeben_am")
        .order("id", { ascending: true }).range(v, b)),
      alleSeiten<Dok>((v, b) => supabase.from("produkt_dokument").select("artikel_id, sprache")
        .eq("im_shop", true).eq("aktuell", true).order("id", { ascending: true }).range(v, b)),
    ]);
    if (a.fehler) setFehler("Die Shop-Artikel konnten nicht geladen werden.");
    else if (s.fehler || u.fehler) setFehler("Die Sprachen konnten nicht geladen werden. Läuft das SQL zu Paket 323 schon?");
    setArtikel(a.zeilen); setSprachen(s.zeilen); setUebers(u.zeilen); setDoks(d.fehler ? [] : d.zeilen);
    setLaden(false);
  }, []);

  useEffect(() => { void neuLaden(); }, [neuLaden]);

  const zeileJe = useMemo(() => Object.fromEntries(sprachen.map((z) => [z.sprache, z])), [sprachen]);

  function oeffne(r: Reiter, c: string) { setCode(c); setReiter(r); setMeldung(null); }

  return (
    <div style={{ color: "#fff", maxWidth: 1150, margin: "0 auto" }}>
      <a href="/dashboard/shop" style={{ color: C.cyan }}>← Zurück zum Shop</a>
      <h1 style={{ margin: "14px 0 4px", fontSize: "clamp(26px, 2.25vw, 36px)", fontWeight: 800 }}>🌐 Shop mehrsprachig</h1>
      <p style={{ margin: 0, color: C.textDim, maxWidth: 820 }}>
        Ihren Shop in bis zu 24 Sprachen anbieten. Die KI schlägt Übersetzungen mit wörtlicher Rückübersetzung vor — Sie prüfen
        und geben frei. Im Shop erscheint nur, was freigegeben ist. Preise, Währung und Zahlen werden nie übersetzt.
      </p>
      {!startFrei("shop", freigabe) && (
        <div style={S.hinweis}>Der Online-Shop ist bis zur rechtlichen Freigabe geschlossen. Sie können hier schon alles vorbereiten.</div>
      )}
      {!istChef && !laden && <div style={S.hinweis}>Vorschläge dürfen Sie anlegen und bearbeiten. Freigeben und Sprachen einschalten macht die Geschäftsleitung.</div>}
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {meldung && <div style={S.ok} role="status">{meldung}</div>}

      <div style={S.reiterLeiste} role="tablist">
        {REITER.map((r) => (
          <button key={r.key} role="tab" aria-selected={reiter === r.key} onClick={() => { setReiter(r.key); setMeldung(null); }}
            style={{ ...S.reiter, ...(reiter === r.key ? S.reiterAktiv : {}) }}>{r.label}</button>
        ))}
      </div>

      {laden ? <div style={{ color: C.textDim, padding: 20 }}>Wird geladen …</div> : (
        <>
          {reiter === "sprachen" && (
            <SprachenTeil artikel={artikel} zeileJe={zeileJe} uebers={uebers} doks={doks} istChef={istChef} betrieb={betrieb}
              onOeffne={oeffne} onNeu={neuLaden} setMeldung={setMeldung} />
          )}
          {reiter === "produkte" && (
            <ProdukteTeil key={code} code={code} setCode={setCode} artikel={artikel} uebers={uebers} doks={doks} istChef={istChef}
              betrieb={betrieb} onNeu={neuLaden} setMeldung={setMeldung} />
          )}
          {reiter === "oberflaeche" && (
            <OberflaecheTeil key={code} code={code} setCode={setCode} zeile={zeileJe[code] ?? null} istChef={istChef}
              betrieb={betrieb} onNeu={neuLaden} setMeldung={setMeldung} />
          )}
        </>
      )}
    </div>
  );
}

function SprachWahl({ code, setCode }: { code: string; setCode: (c: string) => void }) {
  return (
    <label style={{ ...S.label, maxWidth: 360 }}>Sprache
      <select style={S.input} value={code} onChange={(e) => setCode(e.target.value)}>
        {FREMD_SPRACHEN.map((s) => <option key={s.code} value={s.code}>{s.name} · {s.eigen}</option>)}
      </select>
    </label>
  );
}

// -------------------------------------------------------------- Sprachen ---
function SprachenTeil({ artikel, zeileJe, uebers, doks, istChef, betrieb, onOeffne, onNeu, setMeldung }: {
  artikel: Artikel[]; zeileJe: Record<string, SprachZeile>; uebers: UZeile[]; doks: Dok[]; istChef: boolean; betrieb: string | null;
  onOeffne: (r: Reiter, c: string) => void; onNeu: () => Promise<void>; setMeldung: (s: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const zaehler = useMemo(() => {
    const je: Record<string, Record<UStatus, number>> = {};
    const nachArtikel = new Map<string, UZeile>();
    for (const u of uebers) nachArtikel.set(u.artikel_id + "|" + u.sprache, u);
    for (const s of FREMD_SPRACHEN) {
      const z: Record<UStatus, number> = { fehlt: 0, vorschlag: 0, freigegeben: 0, veraltet: 0 };
      for (const a of artikel) z[uebersetzungsStatus(deutsch(a), nachArtikel.get(a.id + "|" + s.code))]++;
      je[s.code] = z;
    }
    return je;
  }, [artikel, uebers]);

  const dokJe = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    const imShop = new Set(artikel.map((a) => a.id));
    for (const d of doks) if (imShop.has(d.artikel_id)) (m[String(d.sprache ?? "de")] ??= new Set()).add(d.artikel_id);
    return m;
  }, [doks, artikel]);

  async function schalten(c: string, an: boolean) {
    if (!betrieb) return;
    const z = zeileJe[c] ?? null;
    const grund = an ? darfAnbieten(c, z) : null;
    if (grund) { setFehler(`${sprachText(c)}: ${grund}`); return; }
    setBusy(c); setFehler(null);
    const { data, error } = z
      ? await supabase.from("shop_sprache").update({ aktiv: an }).eq("id", z.id).select("id, aktiv")
      : await supabase.from("shop_sprache").insert({ owner_user_id: betrieb, sprache: c, aktiv: an }).select("id, aktiv");
    setBusy(null);
    const neu = (data as { aktiv: boolean }[] | null)?.[0];
    if (error || !neu) { setFehler(error?.message?.includes("Geschaeftsleitung") ? "Das darf nur die Geschäftsleitung." : "Speichern hat nicht geklappt."); return; }
    if (an && !neu.aktiv) { setFehler(`${sprachText(c)}: Die Oberflächen-Texte sind noch nicht freigegeben.`); }
    else setMeldung(an ? `${sprachText(c)} wird im Shop angeboten.` : `${sprachText(c)} ist aus dem Shop genommen.`);
    await onNeu();
  }

  if (!artikel.length) {
    return <Leerzustand icon="🛍️" titel="Noch keine Artikel im Shop" text="Übernehmen Sie zuerst Artikel unter „Produkte in den Shop“. Danach übersetzen Sie hier Namen und Beschreibungen." />;
  }

  return (
    <div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      <div style={S.hinweis}>
        So geht&apos;s: 1) „Oberfläche“ prüfen und freigeben (Englisch ist schon eingebaut) · 2) „Produkte“ vorschlagen lassen, lesen, freigeben ·
        3) „Im Shop anbieten“ einschalten. Nicht übersetzte Produkte erscheinen in der fremden Sprache auf Deutsch.
        Rechtstexte (AGB, Widerruf, Datenschutz) bleiben deutsch — der Shop weist in der fremden Sprache darauf hin.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={S.tabelle}>
          <thead><tr>
            <th style={S.th}>Sprache</th><th style={S.th}>Oberfläche</th><th style={S.th}>Produkt-Texte ({artikel.length})</th>
            <th style={S.th}>Dokumente</th><th style={S.th}>Im Shop</th>
          </tr></thead>
          <tbody>
            {FREMD_SPRACHEN.map((s) => {
              const z = zeileJe[s.code] ?? null;
              const zz = zaehler[s.code];
              const ober = s.code === EINGEBAUT
                ? (z?.status === "freigegeben" ? "eingebaut + eigene Texte" : "eingebaut ✓")
                : !z ? "fehlt" : z.status === "freigegeben" ? "freigegeben ✓" : "Vorschlag — prüfen";
              const oberFarbe = s.code === EINGEBAUT || z?.status === "freigegeben" ? C.green : z ? C.warn : C.textDim;
              const grund = darfAnbieten(s.code, z);
              return (
                <tr key={s.code} dir="ltr">
                  <td style={S.td}><b>{s.name}</b><div style={{ color: C.textDim, fontSize: 13 }} dir={s.rtl ? "rtl" : "ltr"}>{s.eigen}</div></td>
                  <td style={S.td}>
                    <span style={{ color: oberFarbe }}>{ober}</span><br />
                    <button style={S.knopfKlein} onClick={() => onOeffne("oberflaeche", s.code)}>Öffnen</button>
                  </td>
                  <td style={S.td}>
                    <span style={{ color: C.green }}>{zz.freigegeben} freigegeben</span>
                    {zz.vorschlag > 0 && <span style={{ color: C.warn }}> · {zz.vorschlag} zu prüfen</span>}
                    {zz.veraltet > 0 && <span style={{ color: C.danger }}> · {zz.veraltet} veraltet</span>}
                    {zz.fehlt > 0 && <span style={{ color: C.textDim }}> · {zz.fehlt} fehlen</span>}<br />
                    <button style={S.knopfKlein} onClick={() => onOeffne("produkte", s.code)}>Öffnen</button>
                  </td>
                  <td style={S.td}><span style={{ color: dokJe[s.code]?.size ? "#fff" : C.textDim }}>{dokJe[s.code]?.size ?? 0} Artikel</span></td>
                  <td style={S.td}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }} title={grund ?? ""}>
                      <input type="checkbox" checked={!!z?.aktiv} disabled={!istChef || busy === s.code || (!z?.aktiv && !!grund)}
                        onChange={(e) => void schalten(s.code, e.target.checked)} />
                      {z?.aktiv ? "angeboten" : "aus"}
                    </label>
                    {!z?.aktiv && grund && <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>{grund}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ color: C.textDim, fontSize: 13 }}>
        Dokumente = Artikel mit einem Shop-Dokument (z. B. Sicherheitsdatenblatt) in dieser Sprache. Datenblätter übersetzt ARGONAUT nicht —
        die Fassung je Sprache kommt vom Hersteller und wird unter <a href="/dashboard/erp/dokumente" style={{ color: C.cyan }}>Produkt-Dokumente</a> hochgeladen.
      </p>
    </div>
  );
}

// -------------------------------------------------------------- Produkte ---
type Entwurf = { name: string; beschreibung: string; rueck_name: string | null; rueck_beschreibung: string | null; hinweise: string[]; geaendert: boolean };

function ProdukteTeil({ code, setCode, artikel, uebers, doks, istChef, betrieb, onNeu, setMeldung }: {
  code: string; setCode: (c: string) => void; artikel: Artikel[]; uebers: UZeile[]; doks: Dok[]; istChef: boolean; betrieb: string | null;
  onNeu: () => Promise<void>; setMeldung: (s: string | null) => void;
}) {
  const [entwurf, setEntwurf] = useState<Record<string, Entwurf>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | UStatus>("alle");
  const [kiHinweise, setKiHinweise] = useState<string[]>([]);
  const sprache = spracheFuer(code);
  const rtl = !!sprache?.rtl;

  const vorhanden = useMemo(() => {
    const m: Record<string, UZeile> = {};
    for (const u of uebers) if (u.sprache === code) m[u.artikel_id] = u;
    return m;
  }, [uebers, code]);
  const dokJe = useMemo(() => {
    const m: Record<string, { sprache?: string | null }[]> = {};
    for (const d of doks) (m[d.artikel_id] ??= []).push(d);
    return m;
  }, [doks]);

  const zeilen = artikel.map((a) => ({ a, z: vorhanden[a.id] ?? null, st: uebersetzungsStatus(deutsch(a), vorhanden[a.id]) }));
  const sichtbar = zeilen.filter((x) => filter === "alle" || x.st === filter);
  const offen = zeilen.filter((x) => x.st === "fehlt" || x.st === "veraltet");
  const pruefbar = zeilen.filter((x) => x.st === "vorschlag" && !entwurf[x.a.id]?.geaendert && freigabeFehler(deutsch(x.a), x.z!).length === 0);

  function wert(a: Artikel, z: UZeile | null): Entwurf {
    return entwurf[a.id] ?? {
      name: z?.name ?? "", beschreibung: z?.beschreibung ?? "", rueck_name: z?.rueck_name ?? null,
      rueck_beschreibung: z?.rueck_beschreibung ?? null, hinweise: [], geaendert: false,
    };
  }
  function setze(a: Artikel, z: UZeile | null, teil: Partial<Entwurf>) {
    setEntwurf((alt) => ({ ...alt, [a.id]: { ...wert(a, z), ...teil, geaendert: true } }));
  }

  async function speichern(liste: { a: Artikel; e: Entwurf }[]): Promise<boolean> {
    if (!betrieb || !liste.length) return true;
    const daten = liste.map(({ a, e }) => ({ owner_user_id: betrieb, ...zeileFuerSpeichern(a.id, code, deutsch(a), e) }))
      .filter((d) => d.name);
    if (!daten.length) return true;
    const { error } = await supabase.from("shop_uebersetzung").upsert(daten, { onConflict: "artikel_id,sprache" });
    if (error) { setFehler(error.message?.includes("Geschaeftsleitung") ? "Freigegebene Texte ändern: bitte als Vorschlag speichern." : "Speichern hat nicht geklappt: " + error.message); return false; }
    return true;
  }

  async function vorschlagen(ziel: { a: Artikel }[]) {
    if (!sprache) return;
    setBusy("ki"); setFehler(null); setKiHinweise([]);
    let fertig = 0;
    const hinweise: string[] = [];
    try {
      for (const paket of inPakete(ziel.map((x) => ({ id: x.a.id, name: x.a.bezeichnung, beschreibung: x.a.shop_beschreibung, a: x.a })))) {
        const auftrag = uebersetzAuftrag(paket);
        if (!auftrag.texte.length) continue;
        const r = await uebersetzen(code, auftrag.texte);
        hinweise.push(...r.hinweise);
        const neu: Record<string, Entwurf> = {};
        auftrag.zuordnung.forEach((zu, i) => {
          const e = r.ergebnisse[i];
          const basis = neu[zu.id] ?? { name: "", beschreibung: "", rueck_name: null, rueck_beschreibung: null, hinweise: [], geaendert: false };
          if (e) {
            if (zu.feld === "name") { basis.name = e.text; basis.rueck_name = e.rueck; }
            else { basis.beschreibung = e.text; basis.rueck_beschreibung = e.rueck; }
            basis.hinweise.push(...e.hinweise.map((h) => (zu.feld === "name" ? "Name: " : "Beschreibung: ") + h));
          } else basis.hinweise.push(`Keine Übersetzung für ${zu.feld === "name" ? "den Namen" : "die Beschreibung"} — bitte erneut.`);
          neu[zu.id] = basis;
        });
        const ok = await speichern(paket.filter((p) => neu[p.id]?.name).map((p) => ({ a: p.a, e: neu[p.id] })));
        if (!ok) break;
        setEntwurf((alt) => {
          const n = { ...alt };
          for (const [id, e] of Object.entries(neu)) n[id] = { ...e, geaendert: false };
          return n;
        });
        fertig += paket.length;
      }
      if (fertig) setMeldung(`${fertig} Vorschläge für ${sprache.name} gespeichert. Bitte lesen (Rückübersetzung beachten) und freigeben.`);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Übersetzung hat nicht geklappt.");
    } finally {
      setKiHinweise(Array.from(new Set(hinweise)).slice(0, 10));
      setBusy(null);
      await onNeu();
    }
  }

  async function einzelnSpeichern(a: Artikel, e: Entwurf) {
    const f = freigabeFehler(deutsch(a), e).filter((x) => !x.includes("Beschreibung fehlt"));
    if (f.length) { setFehler(f[0]); return; }
    setBusy(a.id); setFehler(null);
    const ok = await speichern([{ a, e }]);
    setBusy(null);
    if (!ok) return;
    setEntwurf((alt) => { const n = { ...alt }; delete n[a.id]; return n; });
    setMeldung("Als Vorschlag gespeichert.");
    await onNeu();
  }

  async function freigeben(ids: string[]) {
    if (!ids.length) return;
    setBusy("frei"); setFehler(null);
    const { data, error } = await supabase.from("shop_uebersetzung").update({ status: "freigegeben" })
      .eq("sprache", code).eq("status", "vorschlag").in("id", ids).select("id");
    setBusy(null);
    if (error) { setFehler(error.message?.includes("Geschaeftsleitung") ? "Freigeben darf nur die Geschäftsleitung." : "Freigeben hat nicht geklappt."); return; }
    setMeldung(`${data?.length ?? 0} Übersetzung${data?.length === 1 ? "" : "en"} freigegeben — im Shop sichtbar, sobald ${sprache?.name ?? "die Sprache"} angeboten wird.`);
    await onNeu();
  }

  async function zurueckziehen(z: UZeile) {
    setBusy(z.id); setFehler(null);
    const { error } = await supabase.from("shop_uebersetzung").update({ status: "vorschlag" }).eq("id", z.id);
    setBusy(null);
    if (error) { setFehler("Hat nicht geklappt."); return; }
    setMeldung("Freigabe zurückgenommen — im Shop steht wieder Deutsch.");
    await onNeu();
  }

  if (!artikel.length) return <Leerzustand icon="🛍️" titel="Noch keine Artikel im Shop" text="Übernehmen Sie zuerst Artikel unter „Produkte in den Shop“." />;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <SprachWahl code={code} setCode={setCode} />
        <label style={{ ...S.label, maxWidth: 220 }}>Anzeigen
          <select style={S.input} value={filter} onChange={(e) => setFilter(e.target.value as "alle" | UStatus)}>
            <option value="alle">alle ({zeilen.length})</option>
            {(Object.keys(STATUS_INFO) as UStatus[]).map((k) => <option key={k} value={k}>{STATUS_INFO[k].label} ({zeilen.filter((x) => x.st === k).length})</option>)}
          </select>
        </label>
        <button style={S.knopfGold} disabled={!!busy || !offen.length} onClick={() => void vorschlagen(offen)}>
          {busy === "ki" ? "KI übersetzt …" : `✨ ${offen.length} fehlende/veraltete vorschlagen lassen`}
        </button>
        {istChef && (
          <button style={S.knopf} disabled={!!busy || !pruefbar.length} onClick={() => {
            if (window.confirm(`${pruefbar.length} Vorschläge freigeben? Bitte nur, wenn Sie sie gelesen haben.`)) void freigeben(pruefbar.map((x) => x.z!.id));
          }}>✓ {pruefbar.length} gelesene Vorschläge freigeben</button>
        )}
      </div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {kiHinweise.length > 0 && <div style={S.hinweis}><b>Hinweise der Übersetzung:</b> {kiHinweise.join(" · ")}</div>}
      <p style={{ color: C.textDim, fontSize: 13 }}>
        Links steht Ihr deutscher Shop-Text, rechts die Übersetzung. Darunter die wörtliche Rückübersetzung ins Deutsche — so prüfen Sie den Sinn,
        ohne die Sprache zu können. Ändern Sie den deutschen Text, gilt die Übersetzung als veraltet und der Shop zeigt wieder Deutsch.
      </p>

      {sichtbar.length === 0 && <div style={{ color: C.textDim, padding: 12 }}>Keine Treffer für diesen Filter.</div>}
      {sichtbar.map(({ a, z, st }) => {
        const e = wert(a, z);
        const info = STATUS_INFO[st];
        const fehlt = freigabeFehler(deutsch(a), e);
        const dsp = dokSprachen(dokJe[a.id] ?? []);
        return (
          <div key={a.id} style={S.karte}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <b>{a.bezeichnung || "Ohne Namen"}{a.artikelnummer ? <span style={{ color: C.textDim, fontWeight: 400 }}> · {a.artikelnummer}</span> : null}</b>
              <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {dsp.length > 0 && <span style={{ fontSize: 12, color: dsp.includes(code) ? C.green : C.textDim }}>📑 {dsp.map((x) => x.toUpperCase()).join(" ")}</span>}
                <span style={{ ...S.marke, color: FARBE[info.farbe], borderColor: FARBE[info.farbe] }}>{e.geaendert ? "ungespeichert" : info.label}</span>
              </span>
            </div>
            <div style={S.zwei}>
              <div>
                <div style={S.klein}>Deutsch</div>
                <div style={S.quelle}>{a.bezeichnung}</div>
                {a.shop_beschreibung ? <div style={{ ...S.quelle, marginTop: 6, whiteSpace: "pre-wrap" }}>{a.shop_beschreibung}</div> : <div style={{ ...S.klein, marginTop: 6 }}>(keine Shop-Beschreibung)</div>}
              </div>
              <div>
                <div style={S.klein}>{sprache?.name}</div>
                <input style={S.input} dir={rtl ? "rtl" : "ltr"} lang={code} value={e.name} maxLength={200} onChange={(ev) => setze(a, z, { name: ev.target.value })} placeholder="Name" />
                {a.shop_beschreibung ? (
                  <textarea style={{ ...S.input, marginTop: 6, minHeight: 70 }} dir={rtl ? "rtl" : "ltr"} lang={code} value={e.beschreibung} maxLength={1500}
                    onChange={(ev) => setze(a, z, { beschreibung: ev.target.value })} placeholder="Beschreibung" />
                ) : null}
                {(e.rueck_name || e.rueck_beschreibung) && !e.geaendert && (
                  <div style={{ ...S.klein, marginTop: 6 }}>↩︎ Rückübersetzung: <i>{[e.rueck_name, e.rueck_beschreibung].filter(Boolean).join(" — ")}</i></div>
                )}
                {e.hinweise.length > 0 && <div style={{ color: C.warn, fontSize: 13, marginTop: 6 }}>⚠️ {e.hinweise.join(" · ")}</div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button style={S.knopfKlein} disabled={!!busy} onClick={() => void vorschlagen([{ a }])}>✨ {z ? "Neu vorschlagen" : "Vorschlagen"}</button>
              <button style={S.knopfKlein} disabled={!!busy || !e.geaendert} onClick={() => void einzelnSpeichern(a, e)}>💾 Als Vorschlag speichern</button>
              {istChef && st === "vorschlag" && (
                <button style={S.knopfKlein} disabled={!!busy || e.geaendert || fehlt.length > 0} title={fehlt[0] ?? ""} onClick={() => void freigeben([z!.id])}>✓ Freigeben</button>
              )}
              {istChef && st === "freigegeben" && <button style={S.knopfKlein} disabled={!!busy} onClick={() => void zurueckziehen(z!)}>↺ Freigabe zurücknehmen</button>}
              {st === "veraltet" && <span style={{ color: C.danger, fontSize: 13 }}>Der deutsche Text wurde geändert — bitte neu vorschlagen oder anpassen und speichern.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ Oberfläche ---
function OberflaecheTeil({ code, setCode, zeile, istChef, betrieb, onNeu, setMeldung }: {
  code: string; setCode: (c: string) => void; zeile: SprachZeile | null; istChef: boolean; betrieb: string | null;
  onNeu: () => Promise<void>; setMeldung: (s: string | null) => void;
}) {
  const sprache = spracheFuer(code);
  const eingebaut = code === EINGEBAUT;
  const start = useMemo(() => {
    const eigen = saubereTexte(zeile?.texte);
    const basis: Partial<Record<TextKey, string>> = eingebaut ? { ...TEXT_EN } : {};
    return { ...basis, ...eigen } as Partial<Record<TextKey, string>>;
  }, [zeile, eingebaut]);
  const [texte, setTexte] = useState<Partial<Record<TextKey, string>>>(start);
  const [rueck, setRueck] = useState<Partial<Record<TextKey, string>>>({});
  const [hinweise, setHinweise] = useState<Partial<Record<TextKey, string[]>>>({});
  const [geaendert, setGeaendert] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const rtl = !!sprache?.rtl;

  const pruefung = pruefeOberflaeche(texte);
  const fehlen = TEXT_KEYS.filter((k) => !(texte[k] ?? "").trim());

  async function speichern(neu: Partial<Record<TextKey, string>>): Promise<boolean> {
    if (!betrieb) return false;
    const daten = { texte: saubereTexte(neu), status: "vorschlag" };
    const { error } = zeile
      ? await supabase.from("shop_sprache").update(daten).eq("id", zeile.id)
      : await supabase.from("shop_sprache").insert({ owner_user_id: betrieb, sprache: code, ...daten });
    if (error) { setFehler("Speichern hat nicht geklappt: " + error.message); return false; }
    return true;
  }

  async function vorschlagen(alle: boolean) {
    const keys = alle ? TEXT_KEYS : fehlen;
    if (!keys.length) return;
    setBusy("ki"); setFehler(null);
    const neu = { ...texte };
    const r2 = { ...rueck };
    const h2 = { ...hinweise };
    try {
      for (let i = 0; i < keys.length; i += 20) {
        const teil = keys.slice(i, i + 20);
        const r = await uebersetzen(code, teil.map((k) => TEXT_DE[k]));
        teil.forEach((k, j) => {
          const e = r.ergebnisse[j];
          if (!e) return;
          neu[k] = e.text;
          if (e.rueck) r2[k] = e.rueck;
          const ph = platzhalter(e.text).join(" ") !== platzhalter(TEXT_DE[k]).join(" ") ? ["Platzhalter verändert — bitte korrigieren."] : [];
          h2[k] = [...ph, ...e.hinweise];
        });
      }
      setTexte(neu); setRueck(r2); setHinweise(h2);
      if (await speichern(neu)) { setGeaendert(false); setMeldung(`Vorschlag für ${sprache?.name} gespeichert. Bitte lesen und freigeben.`); await onNeu(); }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Übersetzung hat nicht geklappt.");
    } finally { setBusy(null); }
  }

  async function freigeben() {
    if (!zeile || pruefung.length) return;
    setBusy("frei"); setFehler(null);
    const { error } = await supabase.from("shop_sprache").update({ status: "freigegeben" }).eq("id", zeile.id);
    setBusy(null);
    if (error) { setFehler(error.message?.includes("Geschaeftsleitung") ? "Freigeben darf nur die Geschäftsleitung." : "Freigeben hat nicht geklappt."); return; }
    setMeldung(`Oberfläche ${sprache?.name} freigegeben. Unter „Sprachen“ können Sie sie jetzt im Shop anbieten.`);
    await onNeu();
  }

  const freigabeStand = eingebaut
    ? (zeile?.status === "freigegeben" ? "Eingebaut, mit Ihren freigegebenen Änderungen." : zeile ? "Eingebaut. Ihre Änderungen sind ein Vorschlag — bis zur Freigabe gilt die eingebaute Fassung." : "Eingebaut und geprüft — Sie müssen nichts tun. Ändern ist möglich.")
    : !zeile ? "Noch keine Texte." : zeile.status === "freigegeben" ? "Freigegeben ✓" : "Vorschlag — bitte prüfen und freigeben.";

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <SprachWahl code={code} setCode={setCode} />
        {!eingebaut && (
          <button style={S.knopfGold} disabled={!!busy || !fehlen.length} onClick={() => void vorschlagen(false)}>
            {busy === "ki" ? "KI übersetzt …" : `✨ ${fehlen.length} fehlende Texte vorschlagen lassen`}
          </button>
        )}
        {!eingebaut && zeile && (
          <button style={S.knopf} disabled={!!busy} onClick={() => { if (window.confirm("Alle Texte neu vorschlagen lassen? Ihre Änderungen werden überschrieben.")) void vorschlagen(true); }}>Alle neu vorschlagen</button>
        )}
        <button style={S.knopf} disabled={!!busy || !geaendert} onClick={async () => { setBusy("sp"); const ok = await speichern(texte); setBusy(null); if (ok) { setGeaendert(false); setMeldung("Als Vorschlag gespeichert."); await onNeu(); } }}>💾 Als Vorschlag speichern</button>
        {istChef && zeile && zeile.status !== "freigegeben" && (
          <button style={S.knopf} disabled={!!busy || geaendert || pruefung.length > 0} title={pruefung[0] ?? ""} onClick={() => void freigeben()}>✓ Oberfläche freigeben</button>
        )}
      </div>
      <div style={S.hinweis}>{freigabeStand}{oberflaecheFuer(code, zeile) ? "" : " Im Shop noch nicht nutzbar."}</div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {zeile && zeile.status !== "freigegeben" && pruefung.length > 0 && (
        <div style={{ color: C.warn, fontSize: 13, margin: "6px 0" }}>Vor der Freigabe: {pruefung.slice(0, 3).join(" · ")}</div>
      )}
      <p style={{ color: C.textDim, fontSize: 13 }}>
        Texte in geschweiften Klammern wie {"{n}"} oder {"{link}"} sind Platzhalter — sie müssen genau so stehen bleiben. „Zahlungspflichtig bestellen“
        muss in jeder Sprache eindeutig sagen, dass die Bestellung etwas kostet.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={S.tabelle}>
          <thead><tr><th style={{ ...S.th, width: "42%" }}>Deutsch</th><th style={S.th}>{sprache?.name}</th></tr></thead>
          <tbody>
            {TEXT_KEYS.map((k) => (
              <tr key={k}>
                <td style={S.td}>{TEXT_DE[k]}</td>
                <td style={S.td}>
                  <input style={S.input} dir={rtl ? "rtl" : "ltr"} lang={code} value={texte[k] ?? ""} maxLength={400}
                    onChange={(e) => { setTexte((t) => ({ ...t, [k]: e.target.value })); setGeaendert(true); }} />
                  {rueck[k] && <div style={S.klein}>↩︎ {rueck[k]}</div>}
                  {(hinweise[k]?.length ?? 0) > 0 && <div style={{ color: C.warn, fontSize: 12 }}>⚠️ {hinweise[k]!.join(" · ")}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  hinweis: { background: "rgba(201,168,76,0.08)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", margin: "12px 0", color: "#E8EDF4" },
  fehler: { background: "rgba(224,102,102,0.12)", border: `1px solid ${C.danger}`, borderRadius: 10, padding: "10px 14px", margin: "12px 0", color: "#ffd6d6" },
  ok: { background: "rgba(76,175,125,0.12)", border: `1px solid ${C.green}`, borderRadius: 10, padding: "10px 14px", margin: "12px 0" },
  reiterLeiste: { display: "flex", gap: 6, flexWrap: "wrap", margin: "18px 0 14px", borderBottom: `1px solid ${C.border}` },
  reiter: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: C.textDim, padding: "10px 12px", cursor: "pointer", fontSize: 15, fontWeight: 600 },
  reiterAktiv: { color: C.gold, borderBottomColor: C.gold },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 },
  zwei: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: 10 },
  quelle: { background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", fontSize: 14 },
  klein: { color: C.textDim, fontSize: 12, marginBottom: 4 },
  input: { width: "100%", boxSizing: "border-box", background: C.navy, color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 15, fontFamily: "inherit" },
  label: { display: "flex", flexDirection: "column", gap: 4, color: C.textDim, fontSize: 13, marginTop: 8 },
  knopf: { background: "transparent", color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 14 },
  knopfGold: { background: C.gold, color: C.navy, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontWeight: 700, fontSize: 14 },
  knopfKlein: { background: "transparent", color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13, marginTop: 4 },
  marke: { fontSize: 12, border: "1px solid", borderRadius: 6, padding: "1px 6px" },
  tabelle: { width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 },
  th: { textAlign: "left", color: C.textDim, fontWeight: 600, padding: "8px 10px", borderBottom: `1px solid ${C.border}` },
  td: { padding: "10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" },
};
