"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "../../_components/KiKlartext";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E5 Bestellungen-Liste (Einkauf)
// KPIs, Status-Filter, Anlegen mit Auto-Nr. BE-JJJJ-XXXX -> Detailseite.
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  warn: "#E0A24C",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

const STATUS: { wert: string; label: string; farbe: string }[] = [
  { wert: "entwurf", label: "Entwurf", farbe: C.textDim },
  { wert: "bestellt", label: "Bestellt", farbe: C.cyan },
  { wert: "teilweise_geliefert", label: "Teilw. geliefert", farbe: C.warn },
  { wert: "geliefert", label: "Geliefert", farbe: C.green },
  { wert: "storniert", label: "Storniert", farbe: C.danger },
];

function statusInfo(wert: string) {
  return STATUS.find((s) => s.wert === wert) ?? STATUS[0];
}

interface LieferantKurz {
  id: string;
  name: string;
}

interface BestellungRow {
  id: string;
  bestellnummer: string | null;
  lieferant_id: string | null;
  status: string;
  bestelldatum: string | null;
  lieferdatum_erwartet: string | null;
  lieferant: { name: string } | null;
  positionen: { menge: number; einzelpreis: number }[];
}

type KiItem = {
  id: string;
  bezeichnung: string;
  einheit: string;
  aktueller_bestand: number;
  mindestbestand: number;
  einkaufspreis: number;
  lieferant_id: string | null;
  vorschlag_menge: number;
  begruendung: string;
};

type KiGruppe = {
  lieferant_id: string | null;
  lieferant_name: string;
  items: KiItem[];
};

function eur(n: number): string {
  return (Number(n) || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}
function datum(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE");
}
function summe(p: { menge: number; einzelpreis: number }[]): number {
  return p.reduce(
    (s, x) => s + (Number(x.menge) || 0) * (Number(x.einzelpreis) || 0),
    0
  );
}

// Tage bis zum erwarteten Liefertermin (negativ = überfällig)
function tageBis(d: string | null): number | null {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  dt.setHours(0, 0, 0, 0);
  return Math.round((dt.getTime() - heute.getTime()) / 86400000);
}

// Liefertermin-Ampel: rot überfällig, gelb ≤7 T., grün sonst; neutral bei geliefert/storniert
function lieferFarbe(status: string, lieferdatum: string | null): string {
  if (status === "geliefert" || status === "storniert") return C.textDim;
  const t = tageBis(lieferdatum);
  if (t === null) return C.textDim;
  if (t < 0) return C.danger;
  if (t <= 7) return C.warn;
  return C.green;
}

export default function BestellungenListe() {
  const router = useRouter();
  const [bestellungen, setBestellungen] = useState<BestellungRow[]>([]);
  const [lieferanten, setLieferanten] = useState<LieferantKurz[]>([]);
  const [laden, setLaden] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modalOffen, setModalOffen] = useState(false);
  const [neuLieferant, setNeuLieferant] = useState("");
  const [neuBestelldatum, setNeuBestelldatum] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [neuLieferdatum, setNeuLieferdatum] = useState("");
  const [anlegen, setAnlegen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // KI-Bestellvorschlag
  const [kiOffen, setKiOffen] = useState(false);
  const [kiLaden, setKiLaden] = useState(false);
  const [kiFehler, setKiFehler] = useState<string | null>(null);
  const [kiGruppen, setKiGruppen] = useState<KiGruppe[]>([]);
  const [kiErstellen, setKiErstellen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);
      await Promise.all([lade(), ladeLieferanten()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lade() {
    setLaden(true);
    const { data, error } = await supabase
      .from("bestellungen")
      .select(
        "id, bestellnummer, lieferant_id, status, bestelldatum, lieferdatum_erwartet, lieferant:lieferanten(name), positionen:bestellpositionen(menge, einzelpreis)"
      )
      .order("created_at", { ascending: false });
    if (!error && data) setBestellungen(data as unknown as BestellungRow[]);
    setLaden(false);
  }

  async function ladeLieferanten() {
    const { data } = await supabase
      .from("lieferanten")
      .select("id, name")
      .order("name", { ascending: true });
    if (data) setLieferanten(data as LieferantKurz[]);
  }

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return bestellungen.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (q) {
        const hay = [b.bestellnummer, b.lieferant?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bestellungen, suche, statusFilter]);

  const offen = bestellungen.filter(
    (b) => b.status !== "geliefert" && b.status !== "storniert"
  );
  const kpiOffen = offen.length;
  const kpiOffenWert = offen.reduce((s, b) => s + summe(b.positionen), 0);

  // KI-Kontext: überfällige/bald erwartete Lieferungen priorisieren
  const bestellKi = useMemo(() => {
    const offeneListe = bestellungen.filter(
      (b) => b.status !== "geliefert" && b.status !== "storniert"
    );
    const relevante = offeneListe
      .map((b) => ({ b, t: tageBis(b.lieferdatum_erwartet) }))
      .filter((x) => x.t !== null && (x.t as number) <= 7)
      .sort((a, b) => (a.t as number) - (b.t as number));
    if (relevante.length === 0) return { text: "", hatRot: false };
    const rot = relevante.filter((x) => (x.t as number) < 0).length;
    const gelb = relevante.length - rot;
    const zeile = (x: { b: BestellungRow; t: number | null }) => {
      const nr = x.b.bestellnummer || "—";
      const lief = x.b.lieferant?.name || "Lieferant";
      const wert = eur(summe(x.b.positionen));
      const t = x.t as number;
      const status =
        t < 0 ? `${-t} Tage überfällig` : t === 0 ? "heute fällig" : `fällig in ${t} Tagen`;
      return `- ${nr} von ${lief}: Lieferung ${status}, Wert ${wert}`;
    };
    const top = relevante.slice(0, 4).map(zeile).join("\n");
    const text =
      `${rot} Lieferung(en) überfällig, ${gelb} in den nächsten Tagen erwartet.\n` +
      `Am dringendsten:\n${top}`;
    return { text, hatRot: rot > 0 };
  }, [bestellungen]);

  async function naechsteNummer(): Promise<string> {
    const jahr = new Date().getFullYear();
    const prefix = `BE-${jahr}-`;
    const { data } = await supabase
      .from("bestellungen")
      .select("bestellnummer")
      .like("bestellnummer", prefix + "%");
    let max = 0;
    (data ?? []).forEach((r: { bestellnummer: string | null }) => {
      const n = parseInt((r.bestellnummer ?? "").slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return prefix + String(max + 1).padStart(4, "0");
  }

  async function bestellungAnlegen() {
    setAnlegen(true);
    setFehler(null);
    const nummer = await naechsteNummer();
    const basis = {
      bestellnummer: nummer,
      lieferant_id: neuLieferant || null,
      status: "entwurf",
      bestelldatum: neuBestelldatum || null,
      lieferdatum_erwartet: neuLieferdatum || null,
    };
    const insertObj = userId ? { ...basis, owner_user_id: userId } : basis;
    const { data, error } = await supabase
      .from("bestellungen")
      .insert(insertObj)
      .select("id")
      .single();
    setAnlegen(false);
    if (error || !data) {
      setFehler("Anlegen fehlgeschlagen: " + (error?.message ?? "unbekannt"));
      return;
    }
    router.push(`/dashboard/erp/bestellungen/${data.id}`);
  }

  async function oeffneKiVorschlag() {
    setKiOffen(true);
    setKiLaden(true);
    setKiFehler(null);
    setKiGruppen([]);

    // Aktive Artikel holen und clientseitig auf/unter Mindestbestand filtern
    const { data: art } = await supabase
      .from("artikel")
      .select(
        "id, bezeichnung, einheit, aktueller_bestand, mindestbestand, einkaufspreis, lieferant_id"
      )
      .eq("aktiv", true);
    const unter = (art ?? []).filter((a: any) => {
      const ist = Number(a.aktueller_bestand) || 0;
      const min = Number(a.mindestbestand) || 0;
      return ist <= 0 || (min > 0 && ist <= min);
    });

    if (unter.length === 0) {
      setKiLaden(false);
      setKiFehler("Aktuell liegt kein Artikel auf oder unter dem Mindestbestand. 🎉");
      return;
    }

    // ARGONAUT-KI um Mengenvorschläge bitten
    let vorschlaege: {
      id: string;
      vorschlag_menge: number;
      begruendung: string;
    }[] = [];
    try {
      const res = await fetch("/api/erp-bestellvorschlag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artikel: unter.map((a: any) => ({
            id: a.id,
            bezeichnung: a.bezeichnung,
            einheit: a.einheit,
            aktueller_bestand: Number(a.aktueller_bestand) || 0,
            mindestbestand: Number(a.mindestbestand) || 0,
          })),
        }),
      });
      const j = await res.json();
      vorschlaege = j?.vorschlaege ?? [];
    } catch {
      vorschlaege = [];
    }

    const vMap = new Map(vorschlaege.map((v) => [v.id, v]));
    const liefMap = new Map(lieferanten.map((l) => [l.id, l.name]));
    const gruppenMap = new Map<string, KiGruppe>();

    unter.forEach((a: any) => {
      const v = vMap.get(a.id);
      const min = Number(a.mindestbestand) || 0;
      const ist = Number(a.aktueller_bestand) || 0;
      const menge =
        v?.vorschlag_menge ?? Math.max(1, Math.ceil(min * 2 - ist));
      const key = a.lieferant_id ?? "__none__";
      if (!gruppenMap.has(key)) {
        gruppenMap.set(key, {
          lieferant_id: a.lieferant_id ?? null,
          lieferant_name: a.lieferant_id
            ? liefMap.get(a.lieferant_id) ?? "Lieferant"
            : "Ohne Lieferant",
          items: [],
        });
      }
      gruppenMap.get(key)!.items.push({
        id: a.id,
        bezeichnung: a.bezeichnung,
        einheit: a.einheit,
        aktueller_bestand: ist,
        mindestbestand: min,
        einkaufspreis: Number(a.einkaufspreis) || 0,
        lieferant_id: a.lieferant_id ?? null,
        vorschlag_menge: menge,
        begruendung: v?.begruendung ?? "",
      });
    });

    setKiGruppen(Array.from(gruppenMap.values()));
    setKiLaden(false);
  }

  function setKiMenge(gIdx: number, artikelId: string, wert: string) {
    const menge = Math.max(0, Math.round(Number(wert.replace(",", ".")) || 0));
    setKiGruppen((gs) =>
      gs.map((g, i) =>
        i !== gIdx
          ? g
          : {
              ...g,
              items: g.items.map((it) =>
                it.id === artikelId ? { ...it, vorschlag_menge: menge } : it
              ),
            }
      )
    );
  }

  async function bestellungAusGruppe(gruppe: KiGruppe) {
    const key = gruppe.lieferant_id ?? "__none__";
    setKiErstellen(key);
    setKiFehler(null);
    const nummer = await naechsteNummer();
    const basis = {
      bestellnummer: nummer,
      lieferant_id: gruppe.lieferant_id,
      status: "entwurf",
      bestelldatum: new Date().toISOString().slice(0, 10),
    };
    const insertObj = userId ? { ...basis, owner_user_id: userId } : basis;
    const { data, error } = await supabase
      .from("bestellungen")
      .insert(insertObj)
      .select("id")
      .single();
    if (error || !data) {
      setKiErstellen(null);
      setKiFehler("Bestellung konnte nicht erstellt werden: " + (error?.message ?? ""));
      return;
    }
    const positionen = gruppe.items
      .filter((it) => it.vorschlag_menge > 0)
      .map((it, idx) => ({
        bestellung_id: data.id,
        artikel_id: it.id,
        bezeichnung: it.bezeichnung,
        menge: it.vorschlag_menge,
        einzelpreis: it.einkaufspreis,
        position: idx + 1,
        ...(userId ? { owner_user_id: userId } : {}),
      }));
    if (positionen.length > 0) {
      await supabase.from("bestellpositionen").insert(positionen);
    }
    router.push(`/dashboard/erp/bestellungen/${data.id}`);
  }

  // ---------- Styles ----------
  const card: React.CSSProperties = {
    background: C.navy2,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "18px 20px",
  };
  const inputStil: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: 14,
    boxSizing: "border-box",
  };
  const labelStil: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    color: C.textDim,
    marginBottom: 6,
    fontWeight: 600,
  };
  const btnGold: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    background: C.gold,
    color: C.navy,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
  };
  const thStil: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: C.textDim,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdStil: React.CSSProperties = {
    padding: "12px",
    fontSize: 14,
    color: "#fff",
    borderBottom: `1px solid ${C.border}`,
  };
  const badge = (wert: string): React.ReactElement => {
    const s = statusInfo(wert);
    return (
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: s.farbe,
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${s.farbe}55`,
          borderRadius: 6,
          padding: "2px 8px",
          whiteSpace: "nowrap",
        }}
      >
        {s.label}
      </span>
    );
  };

  return (
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
            🛒 Bestellungen
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
            Einkauf: Bestellungen an Lieferanten
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: `1px solid ${C.gold}`,
              background: "rgba(201,168,76,0.12)",
              color: C.gold,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
            onClick={oeffneKiVorschlag}
          >
            🤖 KI-Bestellvorschlag
          </button>
          <button style={btnGold} onClick={() => setModalOffen(true)}>
            + Bestellung anlegen
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Offene Bestellungen
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            {kpiOffen}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Wert offener Bestellungen
          </div>
          <div
            style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: C.gold }}
          >
            {eur(kpiOffenWert)}
          </div>
        </div>
      </div>

      {/* KI-Klartext: priorisiert überfällige/anstehende Lieferungen */}
      {!laden && bestellKi.text !== "" && (
        <KiKlartext
          kontext={bestellKi.text}
          modul="Bestellungen / Liefertermine"
          akzent={bestellKi.hatRot ? C.danger : C.warn}
          dunkel
          style={{ marginBottom: 20 }}
        />
      )}

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          style={{ ...inputStil, maxWidth: 320 }}
          placeholder="Suche: Bestellnr. oder Lieferant…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        <select
          style={{ ...inputStil, maxWidth: 220 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Alle Status</option>
          {STATUS.map((s) => (
            <option key={s.wert} value={s.wert}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tabelle */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {laden ? (
          <div style={{ padding: 30, color: C.textDim }}>Lade Bestellungen…</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ padding: 30, color: C.textDim }}>
            {bestellungen.length === 0
              ? "Noch keine Bestellungen. Lege oben rechts deine erste Bestellung an."
              : "Keine Bestellungen für diese Filter gefunden."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStil}>Bestellnr.</th>
                <th style={thStil}>Lieferant</th>
                <th style={thStil}>Bestelldatum</th>
                <th style={thStil}>Lieferung erw.</th>
                <th style={thStil}>Status</th>
                <th style={{ ...thStil, textAlign: "right" }}>Summe</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((b) => (
                <tr
                  key={b.id}
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    router.push(`/dashboard/erp/bestellungen/${b.id}`)
                  }
                >
                  <td style={{ ...tdStil, fontWeight: 700, color: C.cyan }}>
                    {b.bestellnummer || "—"}
                  </td>
                  <td style={tdStil}>{b.lieferant?.name || "—"}</td>
                  <td style={{ ...tdStil, color: C.textDim }}>
                    {datum(b.bestelldatum)}
                  </td>
                  <td style={{ ...tdStil, color: lieferFarbe(b.status, b.lieferdatum_erwartet), fontWeight: 600 }}>
                    {datum(b.lieferdatum_erwartet)}
                  </td>
                  <td style={tdStil}>{badge(b.status)}</td>
                  <td
                    style={{ ...tdStil, textAlign: "right", fontWeight: 700 }}
                  >
                    {eur(summe(b.positionen))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Anlegen-Modal */}
      {modalOffen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "60px 16px",
            zIndex: 1000,
            overflowY: "auto",
          }}
          onClick={() => setModalOffen(false)}
        >
          <div
            style={{ ...card, width: "100%", maxWidth: 480, background: C.navy }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>
              Neue Bestellung
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStil}>Lieferant</label>
              <select
                style={inputStil}
                value={neuLieferant}
                onChange={(e) => setNeuLieferant(e.target.value)}
              >
                <option value="">— Lieferant wählen —</option>
                {lieferanten.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {lieferanten.length === 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: C.warn }}>
                  Noch keine Lieferanten angelegt — du kannst später einen
                  zuordnen.
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <div>
                <label style={labelStil}>Bestelldatum</label>
                <input
                  type="date"
                  style={inputStil}
                  value={neuBestelldatum}
                  onChange={(e) => setNeuBestelldatum(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Lieferung erwartet</label>
                <input
                  type="date"
                  style={inputStil}
                  value={neuLieferdatum}
                  onChange={(e) => setNeuLieferdatum(e.target.value)}
                />
              </div>
            </div>

            {fehler && (
              <div
                style={{
                  marginTop: 14,
                  color: C.danger,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {fehler}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 20,
              }}
            >
              <button style={btnGhost} onClick={() => setModalOffen(false)}>
                Abbrechen
              </button>
              <button
                style={{ ...btnGold, opacity: anlegen ? 0.6 : 1 }}
                onClick={bestellungAnlegen}
                disabled={anlegen}
              >
                {anlegen ? "Lege an…" : "Anlegen & öffnen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KI-Bestellvorschlag-Modal */}
      {kiOffen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "40px 16px",
            zIndex: 1000,
            overflowY: "auto",
          }}
          onClick={() => setKiOffen(false)}
        >
          <div
            style={{ ...card, width: "100%", maxWidth: 840, background: C.navy }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>
              🤖 KI-Bestellvorschlag
            </h2>
            <p style={{ margin: "0 0 18px", color: C.textDim, fontSize: 13 }}>
              Artikel auf oder unter Mindestbestand – gruppiert nach Lieferant.
              Mengen sind anpassbar, dann per Klick als Bestellung übernehmen.
            </p>

            {kiLaden ? (
              <div style={{ padding: "20px 0", color: C.textDim }}>
                Die ARGONAUT-KI analysiert deine Bestände…
              </div>
            ) : kiGruppen.length === 0 ? (
              <div style={{ padding: "20px 0", color: C.textDim }}>
                {kiFehler ?? "Keine Vorschläge verfügbar."}
              </div>
            ) : (
              <>
                {kiGruppen.map((g, gIdx) => {
                  const key = g.lieferant_id ?? "__none__";
                  const gSumme = g.items.reduce(
                    (s, it) => s + it.vorschlag_menge * it.einkaufspreis,
                    0
                  );
                  return (
                    <div
                      key={key}
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          🚚 {g.lieferant_name}
                          <span
                            style={{
                              marginLeft: 10,
                              color: C.textDim,
                              fontWeight: 400,
                              fontSize: 13,
                            }}
                          >
                            {g.items.length} Artikel · ~{eur(gSumme)}
                          </span>
                        </div>
                        <button
                          style={{
                            ...btnGold,
                            opacity: kiErstellen === key ? 0.6 : 1,
                            padding: "8px 14px",
                            fontSize: 13,
                          }}
                          onClick={() => bestellungAusGruppe(g)}
                          disabled={kiErstellen === key}
                        >
                          {kiErstellen === key
                            ? "Erstelle…"
                            : "🛒 Bestellung erstellen"}
                        </button>
                      </div>

                      <div style={{ overflowX: "auto" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            minWidth: 620,
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={thStil}>Artikel</th>
                              <th style={{ ...thStil, textAlign: "right" }}>
                                Bestand / Min
                              </th>
                              <th style={{ ...thStil, textAlign: "right", width: 110 }}>
                                Vorschlag
                              </th>
                              <th style={thStil}>KI-Begründung</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.items.map((it) => (
                              <tr key={it.id}>
                                <td style={tdStil}>{it.bezeichnung}</td>
                                <td
                                  style={{
                                    ...tdStil,
                                    textAlign: "right",
                                    color: C.textDim,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <span style={{ color: C.danger, fontWeight: 700 }}>
                                    {it.aktueller_bestand.toLocaleString("de-DE")}
                                  </span>{" "}
                                  / {it.mindestbestand.toLocaleString("de-DE")}{" "}
                                  {it.einheit}
                                </td>
                                <td style={tdStil}>
                                  <input
                                    style={{
                                      ...inputStil,
                                      textAlign: "right",
                                      padding: "7px 9px",
                                    }}
                                    value={String(it.vorschlag_menge)}
                                    inputMode="numeric"
                                    onChange={(e) =>
                                      setKiMenge(gIdx, it.id, e.target.value)
                                    }
                                  />
                                </td>
                                <td
                                  style={{
                                    ...tdStil,
                                    color: C.textDim,
                                    fontSize: 13,
                                  }}
                                >
                                  {it.begruendung || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {kiFehler && (
                  <div
                    style={{
                      color: C.danger,
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 10,
                    }}
                  >
                    {kiFehler}
                  </div>
                )}
              </>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 8,
              }}
            >
              <button style={btnGhost} onClick={() => setKiOffen(false)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
