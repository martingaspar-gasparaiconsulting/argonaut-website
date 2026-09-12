"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { leseStandortCookie } from "@/lib/aktiverStandort";
import { konkreterStandort } from "@/lib/standortDaten";
import {
  standortFuerBuchung, buchenArgumente, vereineBewegungen, abgangImZeitraum,
  artText, RPC_BUCHEN, type BewegungAnzeige,
} from "@/lib/lagerBuchung";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E3 Artikel-Detailseite
// Stammdaten (Bearbeiten-Modal) · manuelle Bestand-Buchung · Historie.
//
// ▄▄▄ WAS SICH AM 08.09.26 GEÄNDERT HAT (D1) ▄▄▄
// Gebucht wird über `lager_buchen`: Bewegung, Filialbestand und Gesamtsumme
// in einem Vorgang. Vorher waren es zwei Schreibvorgänge — der alte Code
// meldete im Fehlerfall wörtlich „Bestand-Update fehlgeschlagen (Buchung
// wurde gespeichert)". Genau dieser halbe Zustand kann jetzt nicht mehr
// entstehen.
//
// Die Historie liest BEIDE Tabellen: die alte `lagerbewegungen` und die neue
// `lager_bewegung`. Ohne das stünde ab heute jede neue Buchung nicht mehr in
// der Liste — die Seite sähe aus, als sei nichts passiert.
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

const EINHEIT_OPTIONEN = ["Stk", "kg", "g", "m", "m²", "m³", "l", "h", "Pauschal"];

interface Artikel {
  id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  beschreibung: string | null;
  kategorie: string | null;
  einheit: string;
  einkaufspreis: number | null;
  verkaufspreis: number | null;
  mindestbestand: number;
  aktueller_bestand: number;
  lagerort: string | null;
  lieferant_id: string | null;
  aktiv: boolean;
  created_at: string;
}

interface LieferantKurz {
  id: string;
  name: string;
}

type FormState = {
  artikelnummer: string;
  bezeichnung: string;
  beschreibung: string;
  kategorie: string;
  einheit: string;
  einkaufspreis: string;
  verkaufspreis: string;
  mindestbestand: string;
  lagerort: string;
  lieferant_id: string;
  aktiv: boolean;
};

type BuchModus = "eingang" | "ausgang" | "inventur";

function ampel(bestand: number, min: number): { farbe: string; text: string } {
  if (bestand <= 0) return { farbe: C.danger, text: "Leer" };
  if (min > 0 && bestand <= min) return { farbe: C.danger, text: "Kritisch" };
  if (min > 0 && bestand <= min * 1.5) return { farbe: C.warn, text: "Knapp" };
  return { farbe: C.green, text: "OK" };
}

function eur(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}
function num(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
function datum(s: string): string {
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("de-DE");
}

export default function ArtikelDetail() {
  const params = useParams();
  const artikelId = Array.isArray(params.id)
    ? params.id[0]
    : (params.id as string);

  const [artikel, setArtikel] = useState<Artikel | null>(null);
  const [bewegungen, setBewegungen] = useState<BewegungAnzeige[]>([]);
  const [standorte, setStandorte] = useState<{ id: string; name: string }[]>([]);
  /** Bestand an dem Ort, auf den gebucht wird. null = hier noch nie gezählt. */
  const [bestandHier, setBestandHier] = useState<number | null>(null);
  const [lieferanten, setLieferanten] = useState<LieferantKurz[]>([]);
  const [laden, setLaden] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Buchung
  const [modus, setModus] = useState<BuchModus>("eingang");
  const [buchMenge, setBuchMenge] = useState("");
  const [buchGrund, setBuchGrund] = useState("");
  const [buchen, setBuchen] = useState(false);
  const [buchFehler, setBuchFehler] = useState<string | null>(null);

  // Stammdaten-Modal
  const [modalOffen, setModalOffen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [formFehler, setFormFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);
      await ladeAlles();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artikelId]);

  async function ladeAlles() {
    setLaden(true);
    const { data: art } = await supabase
      .from("artikel")
      .select("*")
      .eq("id", artikelId)
      .maybeSingle();
    setArtikel((art as Artikel) ?? null);

    // Beide Bewegungstabellen — die alte ohne Filiale, die neue mit.
    const [bewAlt, bewNeu, lief, st, bz] = await Promise.all([
      supabase.from("lagerbewegungen").select("*").eq("artikel_id", artikelId)
        .order("bewegung_am", { ascending: false }),
      supabase.from("lager_bewegung").select("*").eq("artikel_id", artikelId)
        .order("erstellt_am", { ascending: false }),
      supabase.from("lieferanten").select("id, name").order("name", { ascending: true }),
      supabase.from("standorte").select("id, name").eq("aktiv", true).order("name"),
      supabase.from("artikel_bestand_standort")
        .select("artikel_id, standort_id, bestand").eq("artikel_id", artikelId),
    ]);
    setBewegungen(vereineBewegungen(
      (bewAlt.data as Record<string, unknown>[]) ?? [],
      (bewNeu.data as Record<string, unknown>[]) ?? [],
    ));
    setLieferanten((lief.data as LieferantKurz[]) ?? []);
    const stListe = (st.data as { id: string; name: string }[]) ?? [];
    setStandorte(stListe);

    // Bestand an dem Ort, auf den gebucht würde.
    const wahlJetzt = standortFuerBuchung(konkreterStandort(leseStandortCookie()), stListe);
    if (wahlJetzt.ok) {
      const zeilen = (bz.data as { standort_id: string | null; bestand: number | null }[]) ?? [];
      const treffer = zeilen.find((z) => (z.standort_id ?? null) === wahlJetzt.standortId);
      const roh = Number(treffer?.bestand);
      setBestandHier(treffer && Number.isFinite(roh) ? roh : null);
    } else {
      setBestandHier(null);
    }

    setLaden(false);
  }

  // Der Gesamtbestand über alle Filialen — für Ampel und Anzeige.
  const bestand = Number(artikel?.aktueller_bestand) || 0;
  const min = Number(artikel?.mindestbestand) || 0;
  const am = ampel(bestand, min);
  const lieferantName = artikel?.lieferant_id
    ? lieferanten.find((l) => l.id === artikel.lieferant_id)?.name ?? null
    : null;

  const wahl = useMemo(
    () => standortFuerBuchung(konkreterStandort(leseStandortCookie()), standorte),
    [standorte],
  );
  const filialName = wahl.ok && wahl.standortId
    ? (standorte.find((s) => s.id === wahl.standortId)?.name ?? "Filiale")
    : null;

  /**
   * Gerechnet wird auf dem Bestand DES BUCHUNGSORTS, nicht auf der Summe.
   * Sonst würde eine Inventur in einer Filiale den Gesamtbestand setzen und
   * die anderen Filialen stillschweigend leeren.
   */
  const basisBestand = filialName ? (bestandHier ?? 0) : bestand;

  // Vorschau des neuen Bestands (am Buchungsort)
  const vorschau = useMemo(() => {
    const m = buchMenge.trim() === "" ? 0 : Number(buchMenge.replace(",", "."));
    if (isNaN(m)) return null;
    if (modus === "eingang") return basisBestand + m;
    if (modus === "ausgang") return basisBestand - m;
    return m; // inventur: absoluter Zielwert
  }, [buchMenge, modus, basisBestand]);

  async function bucheBestand() {
    setBuchFehler(null);
    const m = buchMenge.trim() === "" ? NaN : Number(buchMenge.replace(",", "."));
    if (isNaN(m) || m < 0) {
      setBuchFehler("Bitte eine gültige Menge eingeben.");
      return;
    }
    if (!artikel) return;
    if (!wahl.ok) { setBuchFehler(wahl.fehler); return; }

    setBuchen(true);

    // Ein einziger Vorgang. Der frühere zweite Schritt (Bestand schreiben)
    // konnte fehlschlagen, nachdem die Bewegung schon stand.
    const { error } = await supabase.rpc(RPC_BUCHEN, buchenArgumente({
      artikelId: artikel.id,
      standortId: wahl.standortId,
      art: modus === "eingang" ? "zugang" : modus === "ausgang" ? "abgang" : "korrektur",
      menge: m,
      herkunft: modus === "inventur" ? "inventur" : "artikel",
      notiz: buchGrund.trim() || null,
    }));
    if (error) {
      setBuchen(false);
      setBuchFehler("Buchung fehlgeschlagen: " + error.message);
      return;
    }

    setBuchen(false);
    setBuchMenge("");
    setBuchGrund("");
    await ladeAlles();
  }

  function oeffneBearbeiten() {
    if (!artikel) return;
    setForm({
      artikelnummer: artikel.artikelnummer ?? "",
      bezeichnung: artikel.bezeichnung ?? "",
      beschreibung: artikel.beschreibung ?? "",
      kategorie: artikel.kategorie ?? "",
      einheit: artikel.einheit ?? "Stk",
      einkaufspreis:
        artikel.einkaufspreis != null ? String(artikel.einkaufspreis) : "",
      verkaufspreis:
        artikel.verkaufspreis != null ? String(artikel.verkaufspreis) : "",
      mindestbestand:
        artikel.mindestbestand != null ? String(artikel.mindestbestand) : "",
      lagerort: artikel.lagerort ?? "",
      lieferant_id: artikel.lieferant_id ?? "",
      aktiv: artikel.aktiv,
    });
    setFormFehler(null);
    setModalOffen(true);
  }

  function setF<K extends keyof FormState>(key: K, wert: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: wert } : f));
  }

  async function speichereStammdaten() {
    if (!form || !artikel) return;
    if (!form.bezeichnung.trim()) {
      setFormFehler("Bezeichnung ist ein Pflichtfeld.");
      return;
    }
    setSpeichern(true);
    setFormFehler(null);
    const zahl = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));
    const payload = {
      artikelnummer: form.artikelnummer.trim() || null,
      bezeichnung: form.bezeichnung.trim(),
      beschreibung: form.beschreibung.trim() || null,
      kategorie: form.kategorie.trim() || null,
      einheit: form.einheit || "Stk",
      einkaufspreis: zahl(form.einkaufspreis),
      verkaufspreis: zahl(form.verkaufspreis),
      mindestbestand: zahl(form.mindestbestand),
      lagerort: form.lagerort.trim() || null,
      lieferant_id: form.lieferant_id || null,
      aktiv: form.aktiv,
    };
    const { error } = await supabase
      .from("artikel")
      .update(payload)
      .eq("id", artikel.id);
    setSpeichern(false);
    if (error) {
      setFormFehler("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    setModalOffen(false);
    await ladeAlles();
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
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    boxSizing: "border-box",
  };
  const labelStil: React.CSSProperties = {
    display: "block",
    fontSize: 'clamp(12px, 1.06vw, 17px)',
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
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: 'clamp(13px, 1.13vw, 18px)',
    cursor: "pointer",
  };
  const infoZeile = (label: string, wert: React.ReactNode): React.ReactElement => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{label}</span>
      <span style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600, textAlign: "right" }}>
        {wert}
      </span>
    </div>
  );
  const thStil: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 'clamp(11px, 0.94vw, 15px)',
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: C.textDim,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdStil: React.CSSProperties = {
    padding: "12px",
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    color: "#fff",
    borderBottom: `1px solid ${C.border}`,
  };

  const modusBtn = (m: BuchModus, label: string): React.ReactElement => {
    const aktiv = modus === m;
    return (
      <button
        onClick={() => setModus(m)}
        style={{
          flex: 1,
          padding: "9px 0",
          borderRadius: 8,
          border: aktiv ? `1px solid ${C.gold}` : `1px solid ${C.border}`,
          background: aktiv ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
          color: aktiv ? C.gold : "#fff",
          fontWeight: 700,
          fontSize: 'clamp(13px, 1.13vw, 18px)',
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  if (laden) {
    return (
      <div style={{ color: C.textDim, padding: 30 }}>Lade Artikel…</div>
    );
  }

  if (!artikel) {
    return (
      <div style={{ color: "#fff", maxWidth: 700, margin: "0 auto" }}>
        <a href="/dashboard/erp" style={{ color: C.cyan, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
          ← Zurück zum Lager
        </a>
        <div style={{ ...card, marginTop: 16, color: C.textDim }}>
          Artikel nicht gefunden.
        </div>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", maxWidth: 1100, margin: "0 auto" }}>
      <a href="/dashboard/erp" style={{ color: C.cyan, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
        ← Zurück zum Lager
      </a>

      {/* Kopf */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          margin: "14px 0 20px",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(26px, 2.25vw, 36px)',
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              title={am.text}
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: am.farbe,
                boxShadow: `0 0 10px ${am.farbe}`,
              }}
            />
            {artikel.bezeichnung}
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
            {artikel.artikelnummer ? `Nr. ${artikel.artikelnummer} · ` : ""}
            {artikel.kategorie || "Ohne Kategorie"}
          </p>
        </div>
        <button style={btnGhost} onClick={oeffneBearbeiten}>
          Stammdaten bearbeiten
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Stammdaten */}
        <div style={card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 'clamp(16px, 1.38vw, 22px)' }}>Stammdaten</h3>
          {infoZeile(
            "Aktueller Bestand",
            <span style={{ color: am.farbe }}>
              {num(bestand)} {artikel.einheit}
            </span>
          )}
          {infoZeile("Mindestbestand", `${num(min)} ${artikel.einheit}`)}
          {infoZeile("Einheit", artikel.einheit)}
          {infoZeile("Lagerort", artikel.lagerort || "—")}
          {infoZeile(
            "Lieferant",
            artikel.lieferant_id ? (
              <a
                href={`/dashboard/erp/lieferanten/${artikel.lieferant_id}`}
                style={{ color: C.cyan, textDecoration: "none" }}
              >
                {lieferantName || "Lieferant"}
              </a>
            ) : (
              "—"
            )
          )}
          {infoZeile("Einkaufspreis", eur(artikel.einkaufspreis))}
          {infoZeile("Verkaufspreis", eur(artikel.verkaufspreis))}
          {infoZeile(
            "Lagerwert (EK)",
            <span style={{ color: C.gold }}>
              {eur(bestand * (Number(artikel.einkaufspreis) || 0))}
            </span>
          )}
          {infoZeile("Status", artikel.aktiv ? "Aktiv" : "Inaktiv")}
          {artikel.beschreibung && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', marginBottom: 4 }}>
                Beschreibung
              </div>
              <div style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', lineHeight: 1.5 }}>
                {artikel.beschreibung}
              </div>
            </div>
          )}
        </div>

        {/* Bestand buchen */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 'clamp(16px, 1.38vw, 22px)' }}>Bestand buchen</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {modusBtn("eingang", "Zugang")}
            {modusBtn("ausgang", "Abgang")}
            {modusBtn("inventur", "Inventur")}
          </div>

          <label style={labelStil}>
            {modus === "inventur"
              ? "Gezählter Bestand (Zielwert)"
              : "Menge"}
          </label>
          <input
            style={inputStil}
            value={buchMenge}
            onChange={(e) => setBuchMenge(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />

          <div style={{ marginTop: 12 }}>
            <label style={labelStil}>Grund / Notiz (optional)</label>
            <input
              style={inputStil}
              value={buchGrund}
              onChange={(e) => setBuchGrund(e.target.value)}
              placeholder={
                modus === "eingang"
                  ? "z.B. Wareneingang Lieferant X"
                  : modus === "ausgang"
                  ? "z.B. Entnahme Baustelle"
                  : "z.B. Jahresinventur"
              }
            />
          </div>

          {vorschau != null && buchMenge.trim() !== "" && (
            <div
              style={{
                marginTop: 12,
                fontSize: 'clamp(13px, 1.13vw, 18px)',
                color: C.textDim,
              }}
            >
              Neuer Bestand:{" "}
              <span
                style={{
                  color: vorschau < 0 ? C.danger : C.cyan,
                  fontWeight: 700,
                }}
              >
                {num(vorschau)} {artikel.einheit}
              </span>
              {vorschau < 0 && " (negativ!)"}
            </div>
          )}

          {buchFehler && (
            <div
              style={{
                marginTop: 12,
                color: C.danger,
                fontSize: 'clamp(13px, 1.13vw, 18px)',
                fontWeight: 600,
              }}
            >
              {buchFehler}
            </div>
          )}

          <button
            style={{ ...btnGold, marginTop: 16, width: "100%", opacity: buchen ? 0.6 : 1 }}
            onClick={bucheBestand}
            disabled={buchen}
          >
            {buchen ? "Buche…" : "Buchen"}
          </button>
        </div>

        {/* Optimale Bestellmenge (EOQ) */}
        <EoqKarte
          bewegungen={bewegungen}
          einkaufspreis={Number(artikel.einkaufspreis) || 0}
          einheit={artikel.einheit}
          card={card}
          inputStil={inputStil}
          labelStil={labelStil}
        />
      </div>

      {/* Historie */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <h3 style={{ margin: 0, padding: "16px 20px", fontSize: 'clamp(16px, 1.38vw, 22px)' }}>
          Bestandshistorie
        </h3>
        {bewegungen.length === 0 ? (
          <div style={{ padding: "0 20px 20px", color: C.textDim }}>
            Noch keine Buchungen. Nutze oben „Bestand buchen".
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStil}>Datum</th>
                <th style={thStil}>Art</th>
                <th style={{ ...thStil, textAlign: "right" }}>Menge</th>
                <th style={thStil}>Grund</th>
              </tr>
            </thead>
            <tbody>
              {bewegungen.map((b, i) => {
                // Eine Zählung hat keine Veränderung, sondern einen Stand.
                // „auf 7 gesetzt" und „+7" sind zwei verschiedene Aussagen.
                const zaehlung = b.veraenderung === null;
                const positiv = (b.veraenderung ?? 0) >= 0;
                const wo = b.standortId
                  ? (standorte.find((s) => s.id === b.standortId)?.name ?? null)
                  : null;
                return (
                  <tr key={b.id || `${b.quelle}-${i}`}>
                    <td style={{ ...tdStil, color: C.textDim, whiteSpace: "nowrap" }}>
                      {b.zeit ? datum(b.zeit) : "—"}
                    </td>
                    <td style={tdStil}>
                      {b.art === "unbekannt" ? "Bewegung" : artText(b.art)}
                      {wo ? <span style={{ color: C.textDim }}> · {wo}</span> : null}
                    </td>
                    <td
                      style={{
                        ...tdStil,
                        textAlign: "right",
                        fontWeight: 700,
                        color: zaehlung ? C.cyan : positiv ? C.green : C.danger,
                      }}
                    >
                      {zaehlung
                        ? `auf ${num(b.zaehlstand ?? 0)} ${artikel.einheit}`
                        : `${positiv ? "+" : ""}${num(b.veraenderung ?? 0)} ${artikel.einheit}`}
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {b.grund || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Stammdaten-Modal */}
      {modalOffen && form && (
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
          onClick={() => setModalOffen(false)}
        >
          <div
            style={{ ...card, width: "100%", maxWidth: 560, background: C.navy }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800 }}>
              Stammdaten bearbeiten
            </h2>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Bezeichnung *</label>
                <input
                  style={inputStil}
                  value={form.bezeichnung}
                  onChange={(e) => setF("bezeichnung", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Artikelnummer</label>
                <input
                  style={inputStil}
                  value={form.artikelnummer}
                  onChange={(e) => setF("artikelnummer", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Kategorie</label>
                <input
                  style={inputStil}
                  value={form.kategorie}
                  onChange={(e) => setF("kategorie", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Mindestbestand</label>
                <input
                  style={inputStil}
                  value={form.mindestbestand}
                  onChange={(e) => setF("mindestbestand", e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div>
                <label style={labelStil}>Einheit</label>
                <select
                  style={inputStil}
                  value={form.einheit}
                  onChange={(e) => setF("einheit", e.target.value)}
                >
                  {EINHEIT_OPTIONEN.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStil}>Einkaufspreis (€)</label>
                <input
                  style={inputStil}
                  value={form.einkaufspreis}
                  onChange={(e) => setF("einkaufspreis", e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div>
                <label style={labelStil}>Verkaufspreis (€)</label>
                <input
                  style={inputStil}
                  value={form.verkaufspreis}
                  onChange={(e) => setF("verkaufspreis", e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Lagerort</label>
                <input
                  style={inputStil}
                  value={form.lagerort}
                  onChange={(e) => setF("lagerort", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Lieferant</label>
                <select
                  style={inputStil}
                  value={form.lieferant_id}
                  onChange={(e) => setF("lieferant_id", e.target.value)}
                >
                  <option value="">— kein Lieferant —</option>
                  {lieferanten.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Beschreibung</label>
                <textarea
                  style={{ ...inputStil, minHeight: 70, resize: "vertical" }}
                  value={form.beschreibung}
                  onChange={(e) => setF("beschreibung", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 'clamp(14px, 1.25vw, 20px)',
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.aktiv}
                    onChange={(e) => setF("aktiv", e.target.checked)}
                  />
                  Artikel aktiv
                </label>
              </div>
            </div>

            {formFehler && (
              <div
                style={{
                  marginTop: 14,
                  color: C.danger,
                  fontSize: 'clamp(13px, 1.13vw, 18px)',
                  fontWeight: 600,
                }}
              >
                {formFehler}
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
                style={{ ...btnGold, opacity: speichern ? 0.6 : 1 }}
                onClick={speichereStammdaten}
                disabled={speichern}
              >
                {speichern ? "Speichere…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// EOQ-Karte (Optimale Bestellmenge / Andler-Formel)
// Jahresbedarf automatisch aus den Abgängen der letzten 12 Monate.
// Formel: EOQ = wurzel( 2 * Jahresbedarf * Bestellkosten / (Einkaufspreis * Lagerzins%) )
// ---------------------------------------------------------------------
function EoqKarte({
  bewegungen,
  einkaufspreis,
  einheit,
  card,
  inputStil,
  labelStil,
}: {
  bewegungen: BewegungAnzeige[];
  einkaufspreis: number;
  einheit: string;
  card: React.CSSProperties;
  inputStil: React.CSSProperties;
  labelStil: React.CSSProperties;
}) {
  const CE = {
    gold: "#C9A84C",
    cyan: "#00e5ff",
    green: "#4CAF7D",
    warn: "#E0A24C",
    textDim: "#8FA3BE",
    border: "rgba(255,255,255,0.08)",
  };

  // Jahresbedarf automatisch: Summe der Abgänge der letzten 12 Monate, aus
  // BEIDEN Bewegungstabellen. Eine Inventur zählt nicht mit — eine Zählung
  // nach unten ist eine Berichtigung, kein Verbrauch, und würde den
  // Bestellvorschlag sonst ohne Grund nach oben treiben.
  const autoJahresbedarf = useMemo(
    () => abgangImZeitraum(bewegungen, 365),
    [bewegungen],
  );

  // Eingaben (mit sinnvollen Standardwerten). Jahresbedarf ist überschreibbar.
  const [bedarfText, setBedarfText] = useState<string>("");
  const [bestellkosten, setBestellkosten] = useState<string>("15");
  const [lagerzins, setLagerzins] = useState<string>("20");

  const parse = (s: string) =>
    s.trim() === "" ? NaN : Number(s.replace(",", "."));

  // Wenn kein manueller Wert eingegeben ist, den Auto-Wert nutzen.
  const bedarf =
    bedarfText.trim() === "" ? autoJahresbedarf : parse(bedarfText);
  const bk = parse(bestellkosten);
  const lz = parse(lagerzins);

  // Lagerkostensatz pro Einheit/Jahr = Einkaufspreis * Lagerzins%
  const lagerkostenProEinheit =
    einkaufspreis > 0 && !isNaN(lz) ? einkaufspreis * (lz / 100) : 0;

  const berechenbar =
    einkaufspreis > 0 &&
    !isNaN(bedarf) &&
    bedarf > 0 &&
    !isNaN(bk) &&
    bk > 0 &&
    lagerkostenProEinheit > 0;

  const eoq = berechenbar
    ? Math.sqrt((2 * bedarf * bk) / lagerkostenProEinheit)
    : 0;
  const bestellungenProJahr = eoq > 0 ? bedarf / eoq : 0;

  const fmt = (n: number) =>
    (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });

  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 4px", fontSize: 'clamp(16px, 1.38vw, 22px)' }}>📦 Optimale Bestellmenge</h3>
      <p style={{ margin: "0 0 14px", color: CE.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', lineHeight: 1.5 }}>
        Wie viel Sie pro Bestellung ordern sollten, damit Bestell- und Lagerkosten
        zusammen am geringsten sind (Andler-Formel).
      </p>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStil}>
          Jahresbedarf ({einheit}){" "}
          {bedarfText.trim() === "" && autoJahresbedarf > 0 && (
            <span style={{ color: CE.cyan, fontWeight: 400 }}>
              · auto aus Abgängen
            </span>
          )}
        </label>
        <input
          style={inputStil}
          value={bedarfText}
          onChange={(e) => setBedarfText(e.target.value)}
          inputMode="decimal"
          placeholder={
            autoJahresbedarf > 0
              ? `${fmt(autoJahresbedarf)} (automatisch)`
              : "z.B. 200"
          }
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStil}>Bestellkosten (€)</label>
          <input
            style={inputStil}
            value={bestellkosten}
            onChange={(e) => setBestellkosten(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStil}>Lagerzins (%)</label>
          <input
            style={inputStil}
            value={lagerzins}
            onChange={(e) => setLagerzins(e.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>

      {/* Ergebnis */}
      {berechenbar ? (
        <div
          style={{
            marginTop: 14,
            padding: "14px 16px",
            borderRadius: 10,
            background: "rgba(0,229,255,0.08)",
            border: `1px solid rgba(0,229,255,0.3)`,
          }}
        >
          <div style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: CE.textDim }}>
            Optimale Bestellmenge
          </div>
          <div style={{ fontSize: 'clamp(26px, 2.25vw, 36px)', fontWeight: 800, color: CE.cyan }}>
            {fmt(eoq)} {einheit}
          </div>
          <div style={{ marginTop: 6, fontSize: 'clamp(13px, 1.13vw, 18px)', color: "#fff" }}>
            ca. <b>{fmt(bestellungenProJahr)}</b> Bestellungen pro Jahr
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(224,162,76,0.10)",
            border: `1px solid rgba(224,162,76,0.3)`,
            fontSize: 'clamp(13px, 1.13vw, 18px)',
            color: CE.warn,
            lineHeight: 1.5,
          }}
        >
          {einkaufspreis <= 0
            ? "Für die Berechnung fehlt der Einkaufspreis. Trage ihn oben in den Stammdaten ein."
            : !(bedarf > 0)
            ? "Noch kein Jahresbedarf: Sobald Abgänge gebucht sind, wird er automatisch ermittelt — oder trage ihn oben von Hand ein."
            : "Bitte Bestellkosten und Lagerzins ausfüllen."}
        </div>
      )}
    </div>
  );
}
