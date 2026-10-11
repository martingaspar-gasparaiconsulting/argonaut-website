"use client";
// ============================================================================
// ARGONAUT OS · Paket 315 (S1) · Produkt-Dokumente in der Artikel-Akte
//
// PDF je Artikel hochladen (Sicherheitsdatenblatt, Merkblatt, Zertifikat …),
// Ampel für abgelaufene/alte Fassungen, Haken „im Shop zum Herunterladen",
// Chef: „Ins Firmen-Wissen" (fürs Team, wird ausgelesen) und Löschen.
// Rechte entscheidet die Datenbank (SQL p315): Mitarbeiter mit Schreibrecht
// ERP/Lager laden hoch und ändern, löschen nur der Chef.
// ============================================================================
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  ARTEN, SPRACHEN, artInfo, anzeigeName, dateiPruefen, dokumentAmpel, dokumentPruefen,
  erinnerungsTag, speicherPfad, wissenName, datumDe, type Dok,
} from "@/lib/produktDokumente";
import { speicherPfad as wissenPfad } from "@/lib/dokumentAuslesen";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  navy: "#0A1628", navy2: "#0F1F33", gold: "#C9A84C", cyan: "#00e5ff",
  green: "#4CAF7D", danger: "#E06666", warn: "#E0A24C", textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};
const AMPEL_FARBE: Record<string, string> = { rot: C.danger, gelb: C.warn, gruen: C.green, grau: C.textDim };

type Zeile = Dok & { id: string; datei_pfad: string; datei_name: string; datei_bytes: number; angelegt_am: string };

const BUCKET = "produkt-dokumente";

function heuteBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}
function zufall(): string {
  try { return crypto.randomUUID().replace(/-/g, "").slice(0, 12); } catch { return String(Date.now()); }
}

export default function ProduktDokumente({ artikelId, artikelName }: { artikelId: string; artikelName: string }) {
  const [liste, setListe] = useState<Zeile[]>([]);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [formAuf, setFormAuf] = useState(false);
  const [datei, setDatei] = useState<File | null>(null);
  const [art, setArt] = useState("sdb");
  const [sprache, setSprache] = useState("de");
  const [titel, setTitel] = useState("");
  const [version, setVersion] = useState("");
  const [ausgabe, setAusgabe] = useState("");
  const [bis, setBis] = useState("");
  const [imShop, setImShop] = useState(true);
  const [shopAngefasst, setShopAngefasst] = useState(false);
  const [insWissen, setInsWissen] = useState(true);
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);
  const [alteZeigen, setAlteZeigen] = useState(false);
  const heute = heuteBerlin();

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    setUserId(uid);
    let chef: string | null = null;
    try { chef = ((await supabase.rpc("mein_chef_id")).data as string | null) ?? null; } catch { chef = null; }
    setIstChef(!chef && !!uid);
    setBetrieb(chef ?? uid);
    const { data, error } = await supabase
      .from("produkt_dokument")
      .select("id, artikel_id, art, titel, sprache, version, ausgabe_am, gueltig_bis, im_shop, aktuell, document_id, datei_pfad, datei_name, datei_bytes, angelegt_am")
      .eq("artikel_id", artikelId)
      .order("aktuell", { ascending: false })
      .order("angelegt_am", { ascending: false });
    if (error) setFehler("Die Dokumente konnten nicht geladen werden. Läuft das SQL zu Paket 315 schon?");
    setListe((data as Zeile[]) ?? []);
    setLaden(false);
  }, [artikelId]);

  useEffect(() => { lade(); }, [lade]);

  function artWaehlen(neu: string) {
    setArt(neu);
    if (!shopAngefasst) setImShop(artInfo(neu)?.shopStandard ?? false);
  }

  async function wissenUebernehmen(d: Zeile): Promise<string | null> {
    if (!istChef || !userId) return "Ins Firmen-Wissen übernimmt nur die Geschäftsleitung.";
    const { data: blob, error: e1 } = await supabase.storage.from(BUCKET).download(d.datei_pfad);
    if (e1 || !blob) return "Die Datei konnte nicht geladen werden.";
    const name = wissenName(artikelName, d);
    const pfad = wissenPfad(userId, name, Date.now());
    const { error: e2 } = await supabase.storage.from("customer-documents").upload(pfad, blob, { contentType: "application/pdf" });
    if (e2) return `Ins Firmen-Wissen fehlgeschlagen: ${e2.message}`;
    const { data: doc, error: e3 } = await supabase.from("documents")
      .insert({ user_id: userId, file_name: name, file_type: "PDF", file_size: blob.size, storage_path: pfad, status: "wartet", fuer_team: true })
      .select("id").single();
    if (e3 || !doc) {
      await supabase.storage.from("customer-documents").remove([pfad]);
      return `Ins Firmen-Wissen fehlgeschlagen: ${e3?.message ?? "unbekannt"}`;
    }
    const docId = (doc as { id: string }).id;
    await supabase.from("produkt_dokument").update({ document_id: docId }).eq("id", d.id);
    try {
      await fetch("/api/documents/trigger-analysis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId }),
      });
    } catch { /* Auslesen lässt sich unter Firmen-Wissen erneut starten */ }
    return null;
  }

  async function hochladen() {
    setFehler(null); setOk(null);
    if (!betrieb) { setFehler("Bitte neu einloggen."); return; }
    const d = dateiPruefen(datei ? { name: datei.name, size: datei.size, type: datei.type } : null);
    if (!d.ok) { setFehler(d.fehler); return; }
    const p = dokumentPruefen({ art, titel, sprache, version, ausgabe_am: ausgabe, gueltig_bis: bis, im_shop: imShop });
    if (!p.ok) { setFehler(p.fehler); return; }
    const f = datei as File;
    setBusy(true);
    const pfad = speicherPfad(betrieb, artikelId, f.name, zufall());
    const { error: e1 } = await supabase.storage.from(BUCKET).upload(pfad, f, { contentType: "application/pdf", upsert: false });
    if (e1) {
      setBusy(false);
      setFehler(`Hochladen fehlgeschlagen: ${e1.message}. Zum Hochladen braucht es das Schreibrecht „ERP/Lager“.`);
      return;
    }
    const { data: neu, error: e2 } = await supabase.from("produkt_dokument")
      .insert({ artikel_id: artikelId, ...p.zeile, datei_pfad: pfad, datei_name: f.name.slice(0, 200), datei_bytes: f.size })
      .select("id, artikel_id, art, titel, sprache, version, ausgabe_am, gueltig_bis, im_shop, aktuell, document_id, datei_pfad, datei_name, datei_bytes, angelegt_am")
      .single();
    if (e2 || !neu) {
      await supabase.storage.from(BUCKET).remove([pfad]);
      setBusy(false);
      setFehler(`Gespeichert wurde nichts: ${e2?.message ?? "unbekannt"}`);
      return;
    }
    let hinweis = `„${anzeigeName(neu as Zeile)}“ hochgeladen.`;
    if (istChef && insWissen) {
      const w = await wissenUebernehmen(neu as Zeile);
      hinweis += w ? ` ${w}` : " Es steht jetzt auch im Firmen-Wissen (fürs Team) und wird ausgelesen.";
    }
    if (artInfo(art)?.ersetzt) hinweis += " Eine ältere Fassung derselben Sprache steht jetzt auf „ersetzt“.";
    setBusy(false);
    setOk(hinweis);
    setDatei(null); setTitel(""); setVersion(""); setAusgabe(""); setBis(""); setShopAngefasst(false); setFormAuf(false);
    await lade();
  }

  async function oeffnen(d: Zeile) {
    setFehler(null);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.datei_pfad, 120);
    if (error || !data?.signedUrl) { setFehler("Die Datei konnte nicht geöffnet werden."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function aendern(d: Zeile, felder: Partial<Pick<Zeile, "im_shop" | "aktuell">>, text: string) {
    setFehler(null); setOk(null); setBusy(true);
    const { data, error } = await supabase.from("produkt_dokument").update(felder).eq("id", d.id).select("id");
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler("Nicht geändert — dafür braucht es das Schreibrecht „ERP/Lager“."); return; }
    setOk(text);
    await lade();
  }

  async function erinnern(d: Zeile) {
    if (!betrieb || !d.gueltig_bis) return;
    setFehler(null); setOk(null); setBusy(true);
    const tag = erinnerungsTag(d.gueltig_bis, heute);
    const { error } = await supabase.from("erinnerung").insert({
      owner_user_id: betrieb, bezug_typ: "frei", kanal: "persoenlich", status: "offen",
      titel: `${artikelName}: ${anzeigeName(d)} gültig bis ${datumDe(d.gueltig_bis)}`.slice(0, 200),
      faellig_am: `${tag}T09:00`,
      notiz: "Neue Fassung beim Hersteller bzw. Prüfstelle anfordern und in der Artikel-Akte unter „Produkt-Dokumente“ hochladen.",
    });
    setBusy(false);
    if (error) { setFehler("Die Erinnerung wurde nicht angelegt — dafür braucht es das Recht „Erinnerungen“."); return; }
    setOk(`Erinnerung angelegt für ${datumDe(tag)} (unter „Erinnerungen“).`);
  }

  async function wissenKnopf(d: Zeile) {
    setFehler(null); setOk(null); setBusy(true);
    const w = await wissenUebernehmen(d);
    setBusy(false);
    if (w) { setFehler(w); return; }
    setOk("Im Firmen-Wissen abgelegt (fürs Team freigegeben) — es wird jetzt ausgelesen.");
    await lade();
  }

  async function loeschen(d: Zeile) {
    setFehler(null); setOk(null); setBusy(true);
    const { data, error } = await supabase.from("produkt_dokument").delete().eq("id", d.id).select("id");
    if (error || !data || data.length === 0) {
      setBusy(false); setLoeschFrage(null);
      setFehler("Nicht gelöscht — löschen darf nur die Geschäftsleitung. Alternativ „als ersetzt markieren“.");
      return;
    }
    await supabase.storage.from(BUCKET).remove([d.datei_pfad]);
    setBusy(false); setLoeschFrage(null);
    setOk(d.document_id ? "Gelöscht. Die Kopie im Firmen-Wissen bleibt — dort bei Bedarf separat löschen." : "Gelöscht.");
    await lade();
  }

  const aktuelle = liste.filter((d) => d.aktuell !== false);
  const alte = liste.filter((d) => d.aktuell === false);
  const sichtbar = alteZeigen ? liste : aktuelle;

  return (
    <div style={S.karte}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "clamp(16px, 1.38vw, 22px)" }}>📑 Produkt-Dokumente</h3>
          <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>
            Sicherheitsdatenblatt, Technisches Merkblatt, Zertifikate, Anleitungen als PDF — auf Wunsch zum Herunterladen im Shop.
            {" "}<a href="/dashboard/erp/dokumente" style={{ color: C.cyan }}>Alle Produkt-Dokumente</a>
          </div>
        </div>
        {!formAuf && <button style={S.knopfGold} onClick={() => { setFormAuf(true); setFehler(null); setOk(null); }}>＋ Dokument hochladen</button>}
      </div>

      {fehler && <div style={S.fehler}>{fehler}</div>}
      {ok && <div style={S.ok}>{ok}</div>}

      {formAuf && (
        <div style={{ ...S.innen, marginTop: 14 }}>
          <div style={S.raster}>
            <label style={S.label}>PDF-Datei (bis 20 MB)
              <input type="file" accept="application/pdf,.pdf" style={S.feld} onChange={(e) => setDatei(e.target.files?.[0] ?? null)} />
            </label>
            <label style={S.label}>Art
              <select style={S.feld} value={art} onChange={(e) => artWaehlen(e.target.value)}>
                {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
            <label style={S.label}>Sprache
              <select style={S.feld} value={sprache} onChange={(e) => setSprache(e.target.value)}>
                {SPRACHEN.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <label style={S.label}>Eigener Titel (freiwillig)
              <input style={S.feld} value={titel} maxLength={120} onChange={(e) => setTitel(e.target.value)} placeholder={artInfo(art)?.label} />
            </label>
            <label style={S.label}>Version / Fassung
              <input style={S.feld} value={version} maxLength={40} onChange={(e) => setVersion(e.target.value)} placeholder="z. B. 4.2" />
            </label>
            <label style={S.label}>Ausgabe- bzw. Überarbeitungsdatum
              <input type="date" style={S.feld} value={ausgabe} onChange={(e) => setAusgabe(e.target.value)} />
            </label>
            <label style={S.label}>Gültig bis (z. B. bei Zertifikaten)
              <input type="date" style={S.feld} value={bis} onChange={(e) => setBis(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <label style={S.haken}><input type="checkbox" checked={imShop} onChange={(e) => { setImShop(e.target.checked); setShopAngefasst(true); }} /> Im Shop am Produkt zum Herunterladen anbieten</label>
            {istChef && <label style={S.haken}><input type="checkbox" checked={insWissen} onChange={(e) => setInsWissen(e.target.checked)} /> Auch ins Firmen-Wissen (fürs Team, der Wissens-Chat kann daraus antworten)</label>}
            {artInfo(art)?.ersetzt && <div style={{ color: C.textDim, fontSize: 12.5 }}>Eine ältere {artInfo(art)?.label} in derselben Sprache wird automatisch auf „ersetzt“ gesetzt und verschwindet aus dem Shop.</div>}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button style={S.knopfGold} disabled={busy} onClick={hochladen}>{busy ? "Lädt hoch …" : "💾 Hochladen"}</button>
            <button style={S.knopf2} disabled={busy} onClick={() => setFormAuf(false)}>Abbrechen</button>
          </div>
        </div>
      )}

      {laden ? (
        <div style={{ color: C.textDim, marginTop: 14 }}>Lade Dokumente …</div>
      ) : liste.length === 0 ? (
        !formAuf && (
          <div style={{ ...S.innen, marginTop: 14, color: C.textDim, fontSize: 14 }}>
            Noch keine Dokumente. So geht&apos;s: „＋ Dokument hochladen“, PDF wählen (z. B. das Sicherheitsdatenblatt vom Hersteller), Art und Datum angeben, „💾 Hochladen“.
            ARGONAUT erstellt oder prüft keine Datenblätter — es verwaltet die hochgeladene Fassung.
          </div>
        )
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {sichtbar.map((d) => {
            const a = dokumentAmpel(d, heute);
            return (
              <div key={d.id} style={{ ...S.innen, opacity: d.aktuell === false ? 0.7 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span title={a.text} style={{ width: 10, height: 10, borderRadius: "50%", background: AMPEL_FARBE[a.stufe], display: "inline-block" }} />
                      <span style={S.marke}>{artInfo(d.art)?.kurz ?? "Dok."}</span>
                      {anzeigeName(d)}
                      {d.im_shop && d.aktuell !== false && a.stufe !== "rot" && <span style={{ ...S.marke, color: C.green, borderColor: C.green }}>im Shop</span>}
                      {d.document_id && <span style={{ ...S.marke, color: C.cyan, borderColor: C.cyan }}>im Firmen-Wissen</span>}
                    </div>
                    <div style={{ color: AMPEL_FARBE[a.stufe], fontSize: 13, marginTop: 4 }}>{a.text}</div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2, overflowWrap: "anywhere" }}>
                      {d.datei_name} · {(d.datei_bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB
                      {d.ausgabe_am ? ` · Ausgabe ${datumDe(d.ausgabe_am)}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <button style={S.knopfKlein} onClick={() => oeffnen(d)}>Öffnen</button>
                    {d.aktuell !== false && (
                      <button style={S.knopfKlein} disabled={busy} onClick={() => aendern(d, { im_shop: !d.im_shop }, d.im_shop ? "Aus dem Shop genommen." : "Im Shop zum Herunterladen freigegeben.")}>
                        {d.im_shop ? "Aus dem Shop" : "In den Shop"}
                      </button>
                    )}
                    <button style={S.knopfKlein} disabled={busy} onClick={() => aendern(d, { aktuell: d.aktuell === false }, d.aktuell === false ? "Wieder als aktuelle Fassung markiert." : "Als ersetzt markiert — erscheint nicht mehr im Shop.")}>
                      {d.aktuell === false ? "Wieder aktuell" : "Als ersetzt markieren"}
                    </button>
                    {d.gueltig_bis && d.aktuell !== false && <button style={S.knopfKlein} disabled={busy} onClick={() => erinnern(d)}>🔔 Erinnern</button>}
                    {istChef && !d.document_id && <button style={S.knopfKlein} disabled={busy} onClick={() => wissenKnopf(d)}>Ins Firmen-Wissen</button>}
                    {istChef && loeschFrage !== d.id && <button style={{ ...S.knopfKlein, color: C.danger, borderColor: C.danger }} onClick={() => setLoeschFrage(d.id)}>Löschen</button>}
                    {istChef && loeschFrage === d.id && (
                      <>
                        <button style={{ ...S.knopfKlein, background: C.danger, color: "#fff", borderColor: C.danger }} disabled={busy} onClick={() => loeschen(d)}>Ja, löschen</button>
                        <button style={S.knopfKlein} onClick={() => setLoeschFrage(null)}>Nein</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {alte.length > 0 && (
            <button style={{ ...S.knopf2, justifySelf: "start" }} onClick={() => setAlteZeigen(!alteZeigen)}>
              {alteZeigen ? "Ersetzte Fassungen ausblenden" : `Ersetzte Fassungen zeigen (${alte.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 },
  innen: { background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 },
  raster: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  label: { display: "grid", gap: 4, fontSize: 13, color: C.textDim },
  feld: { background: C.navy, color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, width: "100%", boxSizing: "border-box" },
  haken: { display: "flex", gap: 8, alignItems: "center", fontSize: 14 },
  knopfGold: { background: C.gold, color: C.navy, border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 14 },
  knopf2: { background: "transparent", color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 14 },
  knopfKlein: { background: "transparent", color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12.5 },
  marke: { fontSize: 11, border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: "1px 8px", fontWeight: 600 },
  fehler: { color: C.danger, background: "rgba(224,102,102,0.08)", border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 12px", marginTop: 12, fontSize: 14 },
  ok: { color: C.green, background: "rgba(76,175,125,0.08)", border: `1px solid ${C.green}`, borderRadius: 8, padding: "10px 12px", marginTop: 12, fontSize: 14 },
};
