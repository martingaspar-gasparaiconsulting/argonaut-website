"use client";
// ============================================================================
// ARGONAUT OS · Paket 315 (S1) · /dashboard/erp/dokumente — alle Produkt-Dokumente
//
// Überblick über Datenblätter, Zertifikate, Anleitungen aller Artikel:
// Ampel (abgelaufen, läuft bald ab, alte Fassung), was im Shop steht,
// Shop-Artikel ohne Dokument. Hochladen und Ändern in der Artikel-Akte.
// ============================================================================
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Leerzustand from "../../_components/Leerzustand";
import { anzeigeName, artInfo, dokumentAmpel, zaehlen, type Dok } from "@/lib/produktDokumente";

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

type Zeile = Dok & { id: string; artikel_id: string; datei_name: string };
type Filter = "achtung" | "aktuell" | "shop" | "ersetzt";
const FILTER: { key: Filter; label: string }[] = [
  { key: "achtung", label: "Handlungsbedarf" },
  { key: "aktuell", label: "Alle aktuellen" },
  { key: "shop", label: "Im Shop" },
  { key: "ersetzt", label: "Ersetzte Fassungen" },
];

function heuteBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

export default function ProduktDokumenteSeite() {
  const [liste, setListe] = useState<Zeile[]>([]);
  const [namen, setNamen] = useState<Record<string, string>>({});
  const [ohneDok, setOhneDok] = useState<{ id: string; bezeichnung: string }[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("achtung");
  const [suche, setSuche] = useState("");
  const heute = heuteBerlin();

  useEffect(() => {
    (async () => {
      const alle: Zeile[] = [];
      for (let von = 0; von < 10000; von += 1000) {
        const { data, error } = await supabase.from("produkt_dokument")
          .select("id, artikel_id, art, titel, sprache, version, ausgabe_am, gueltig_bis, im_shop, aktuell, document_id, datei_name")
          .order("angelegt_am", { ascending: false }).order("id", { ascending: true })
          .range(von, von + 999);
        if (error) { setFehler("Die Dokumente konnten nicht geladen werden. Läuft das SQL zu Paket 315 schon?"); break; }
        alle.push(...((data as Zeile[]) ?? []));
        if (!data || data.length < 1000) break;
      }
      setListe(alle);
      const art: Record<string, string> = {};
      const shopOhne: { id: string; bezeichnung: string }[] = [];
      const mitDok = new Set(alle.filter((d) => d.aktuell !== false).map((d) => d.artikel_id));
      for (let von = 0; von < 20000; von += 1000) {
        const { data } = await supabase.from("artikel").select("id, bezeichnung, im_shop")
          .order("bezeichnung", { ascending: true }).order("id", { ascending: true }).range(von, von + 999);
        const zeilen = (data as { id: string; bezeichnung: string; im_shop: boolean | null }[]) ?? [];
        for (const a of zeilen) {
          art[a.id] = a.bezeichnung;
          if (a.im_shop && !mitDok.has(a.id)) shopOhne.push({ id: a.id, bezeichnung: a.bezeichnung });
        }
        if (zeilen.length < 1000) break;
      }
      setNamen(art);
      setOhneDok(shopOhne);
      setLaden(false);
    })();
  }, []);

  const z = useMemo(() => zaehlen(liste, heute), [liste, heute]);
  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return liste.filter((d) => {
      const a = dokumentAmpel(d, heute).stufe;
      if (filter === "achtung" && !(a === "rot" || a === "gelb")) return false;
      if (filter === "aktuell" && d.aktuell === false) return false;
      if (filter === "shop" && !(d.im_shop && d.aktuell !== false && a !== "rot")) return false;
      if (filter === "ersetzt" && d.aktuell !== false) return false;
      if (!s) return true;
      return `${namen[d.artikel_id] ?? ""} ${anzeigeName(d)} ${d.datei_name}`.toLowerCase().includes(s);
    }).sort((x, y) => {
      const o = { rot: 0, gelb: 1, gruen: 2, grau: 3 } as Record<string, number>;
      return o[dokumentAmpel(x, heute).stufe] - o[dokumentAmpel(y, heute).stufe]
        || (namen[x.artikel_id] ?? "").localeCompare(namen[y.artikel_id] ?? "", "de");
    });
  }, [liste, filter, suche, namen, heute]);

  return (
    <div style={{ color: "#fff", maxWidth: 1100, margin: "0 auto" }}>
      <a href="/dashboard/erp" style={{ color: C.cyan }}>← Zurück zum Lager</a>
      <h1 style={{ margin: "14px 0 4px", fontSize: "clamp(26px, 2.25vw, 36px)", fontWeight: 800 }}>📑 Produkt-Dokumente</h1>
      <p style={{ margin: 0, color: C.textDim, maxWidth: 760 }}>
        Sicherheitsdatenblätter, Technische Merkblätter, Zertifikate, Leistungserklärungen und Anleitungen aller Artikel.
        Hochgeladen wird in der Artikel-Akte. Die Ampel zeigt abgelaufene und bald ablaufende Dokumente sowie
        Sicherheitsdatenblätter, deren Fassung älter als drei Jahre ist.
      </p>

      {fehler && <div style={S.fehler}>{fehler}</div>}

      <div style={S.kacheln}>
        <div style={S.kachel}><b style={S.zahl}>{z.gesamt - z.ersetzt}</b><span>aktuelle Dokumente</span></div>
        <div style={{ ...S.kachel, borderColor: z.rot ? C.danger : C.border }}><b style={{ ...S.zahl, color: z.rot ? C.danger : "#fff" }}>{z.rot}</b><span>abgelaufen</span></div>
        <div style={{ ...S.kachel, borderColor: z.gelb ? C.warn : C.border }}><b style={{ ...S.zahl, color: z.gelb ? C.warn : "#fff" }}>{z.gelb}</b><span>bald fällig oder alte Fassung</span></div>
        <div style={S.kachel}><b style={S.zahl}>{z.imShop}</b><span>im Shop zum Herunterladen</span></div>
        <div style={{ ...S.kachel, borderColor: ohneDok.length ? C.warn : C.border }}><b style={S.zahl}>{ohneDok.length}</b><span>Shop-Artikel ohne Dokument</span></div>
      </div>

      {!laden && ohneDok.length > 0 && (
        <details style={{ ...S.karte, marginBottom: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Shop-Artikel ohne Dokument ({ohneDok.length})</summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {ohneDok.slice(0, 200).map((a) => <a key={a.id} href={`/dashboard/erp/${a.id}`} style={S.chip}>{a.bezeichnung}</a>)}
          </div>
        </details>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {FILTER.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={filter === f.key ? { ...S.tab, ...S.tabAktiv } : S.tab}>{f.label}</button>
        ))}
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Artikel oder Dokument suchen …" style={{ ...S.feld, maxWidth: 280 }} />
      </div>

      {laden ? (
        <div style={{ color: C.textDim }}>Lade …</div>
      ) : liste.length === 0 ? (
        <Leerzustand
          icon="📑"
          titel="Noch keine Produkt-Dokumente"
          text="Datenblätter, Zertifikate und Anleitungen hängen am Artikel — von dort lassen sie sich im Shop zum Herunterladen anbieten."
          schritte={["Unter „ERP/Lager“ einen Artikel öffnen", "Bei „Produkt-Dokumente“ auf „＋ Dokument hochladen“ klicken", "PDF wählen, Art und Datum angeben, „💾 Hochladen“"]}
        />
      ) : gefiltert.length === 0 ? (
        <div style={{ ...S.karte, color: C.textDim }}>{filter === "achtung" ? "Kein Handlungsbedarf — alles aktuell." : "Keine Treffer."}</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {gefiltert.slice(0, 500).map((d) => {
            const a = dokumentAmpel(d, heute);
            return (
              <a key={d.id} href={`/dashboard/erp/${d.artikel_id}`} style={{ ...S.karte, display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: "#fff", flexWrap: "wrap" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: AMPEL_FARBE[a.stufe], flex: "0 0 auto" }} />
                <span style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <b>{namen[d.artikel_id] ?? "Artikel"}</b>
                  <span style={{ color: C.textDim }}> · {artInfo(d.art)?.kurz} · {anzeigeName(d)}</span>
                </span>
                <span style={{ color: AMPEL_FARBE[a.stufe], fontSize: 13 }}>{a.text}</span>
                {d.im_shop && d.aktuell !== false && a.stufe !== "rot" && <span style={{ fontSize: 11, color: C.green, border: `1px solid ${C.green}`, borderRadius: 999, padding: "1px 8px" }}>im Shop</span>}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" },
  kacheln: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, margin: "18px 0" },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "grid", gap: 2, color: C.textDim, fontSize: 13 },
  zahl: { fontSize: 26, color: "#fff" },
  tab: { background: "transparent", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 },
  tabAktiv: { color: C.navy, background: C.gold, borderColor: C.gold, fontWeight: 600 },
  feld: { background: C.navy, color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 14, width: "100%", boxSizing: "border-box" },
  chip: { fontSize: 13, color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px", textDecoration: "none" },
  fehler: { color: C.danger, background: "rgba(224,102,102,0.08)", border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 12px", margin: "12px 0" },
};
