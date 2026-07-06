"use client";
import { useMemo, useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · ERP · Preisliste · KI-Import (Etappe 2, Baustein 2a-2)
// "KI nimmt, was du hast": Rohtext einfügen -> KI räumt auf (/api/preis-import)
// -> Vorschau (neu vs. Update) -> prüfen/korrigieren -> in die artikel-Tabelle.
// Update ändert bewusst NUR die Preise (Stammdaten bleiben unangetastet);
// Preisänderungen protokolliert der DB-Trigger automatisch in preis_historie.
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

interface BestArtikel {
  id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  einkaufspreis: number | null;
  verkaufspreis: number | null;
}

interface Vorschau {
  bezeichnung: string;
  artikelnummer: string | null;
  einheit: string;
  ekStr: string;
  vkStr: string;
  kategorie: string;
  uebernehmen: boolean;
  matchId: string | null;
  altEk: number | null;
  altVk: number | null;
}

function zahl(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  let x = t.replace(/[€\s]/g, "");
  if (x.includes(",") && x.includes(".")) x = x.replace(/\./g, "").replace(",", ".");
  else if (x.includes(",")) x = x.replace(",", ".");
  const n = Number(x.replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : null;
}

function eur(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

const BEISPIEL = `ART-001; Sägekette 3/8" .050; Stück; EK 18,50; VK 29,90; Verschleißteile
ART-003 Sägekettenöl Bio 5 Liter  Kanister  14,20
Schnittschutz-Handschuhe Gr. L, Paar, Einkauf 24,50 €, Verkauf 39,90 €`;

export default function PreisImport() {
  const [userId, setUserId] = useState<string | null>(null);
  const [bestand, setBestand] = useState<BestArtikel[]>([]);
  const [rohtext, setRohtext] = useState("");
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<Vorschau[] | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [ergebnis, setErgebnis] = useState<string | null>(null);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const { data: u } = await supabase.auth.getUser();
    setUserId(u.user?.id ?? null);
    const { data } = await supabase
      .from("artikel")
      .select("id, artikelnummer, bezeichnung, einkaufspreis, verkaufspreis");
    if (data) setBestand(data as BestArtikel[]);
  }

  function findeMatch(
    artikelnummer: string | null,
    bezeichnung: string
  ): BestArtikel | null {
    const nr = (artikelnummer || "").trim().toLowerCase();
    if (nr) {
      const m = bestand.find(
        (b) => (b.artikelnummer || "").trim().toLowerCase() === nr
      );
      if (m) return m;
    }
    const bez = bezeichnung.trim().toLowerCase();
    if (!bez) return null;
    return bestand.find((b) => b.bezeichnung.trim().toLowerCase() === bez) || null;
  }

  async function aufraeumen() {
    const txt = rohtext.trim();
    if (!txt) {
      setFehler("Bitte zuerst eine Liste einfügen.");
      return;
    }
    setLaden(true);
    setFehler(null);
    setErgebnis(null);
    setVorschau(null);
    try {
      const res = await fetch("/api/preis-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rohtext: txt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFehler(data?.error || "Aufbereitung fehlgeschlagen.");
        setLaden(false);
        return;
      }
      const arr: any[] = Array.isArray(data.artikel) ? data.artikel : [];
      if (arr.length === 0) {
        setFehler(
          "Es wurde kein Artikel erkannt. Prüfe kurz, ob wirklich eine Artikelliste im Text steht."
        );
        setLaden(false);
        return;
      }
      const v: Vorschau[] = arr.map((a) => {
        const match = findeMatch(a.artikelnummer, a.bezeichnung);
        return {
          bezeichnung: String(a.bezeichnung ?? ""),
          artikelnummer: a.artikelnummer ?? null,
          einheit: String(a.einheit ?? "Stück"),
          ekStr: a.einkaufspreis == null ? "" : String(a.einkaufspreis).replace(".", ","),
          vkStr: a.verkaufspreis == null ? "" : String(a.verkaufspreis).replace(".", ","),
          kategorie: a.kategorie ? String(a.kategorie) : "",
          uebernehmen: true,
          matchId: match?.id ?? null,
          altEk: match?.einkaufspreis ?? null,
          altVk: match?.verkaufspreis ?? null,
        };
      });
      setVorschau(v);
    } catch (e) {
      setFehler("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    }
    setLaden(false);
  }

  function setV(i: number, patch: Partial<Vorschau>) {
    setVorschau((v) => (v ? v.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) : v));
  }

  const anzNeu = useMemo(
    () => (vorschau || []).filter((x) => x.uebernehmen && !x.matchId).length,
    [vorschau]
  );
  const anzUpd = useMemo(
    () => (vorschau || []).filter((x) => x.uebernehmen && x.matchId).length,
    [vorschau]
  );

  async function uebernehmen() {
    if (!vorschau) return;
    if (!userId) {
      setFehler("Nicht eingeloggt. Bitte Seite neu laden.");
      return;
    }
    setSpeichern(true);
    setFehler(null);
    let neu = 0;
    let upd = 0;
    let fehlerAnz = 0;

    for (const x of vorschau) {
      if (!x.uebernehmen) continue;
      if (!x.bezeichnung.trim()) {
        fehlerAnz++;
        continue;
      }
      const ek = zahl(x.ekStr);
      const vk = zahl(x.vkStr);

      if (x.matchId) {
        // Bestehender Artikel: NUR Preise aktualisieren (Stammdaten unangetastet)
        const { error } = await supabase
          .from("artikel")
          .update({
            einkaufspreis: ek,
            verkaufspreis: vk,
            updated_at: new Date().toISOString(),
          })
          .eq("id", x.matchId);
        if (error) fehlerAnz++;
        else upd++;
      } else {
        // Neuer Artikel: mit Grunddaten anlegen
        const { error } = await supabase.from("artikel").insert({
          owner_user_id: userId,
          artikelnummer: x.artikelnummer?.trim() || null,
          bezeichnung: x.bezeichnung.trim(),
          einheit: x.einheit.trim() || "Stück",
          kategorie: x.kategorie.trim() || null,
          einkaufspreis: ek,
          verkaufspreis: vk,
          mindestbestand: 0,
          aktueller_bestand: 0,
          aktiv: true,
        });
        if (error) fehlerAnz++;
        else neu++;
      }
    }

    setSpeichern(false);
    setErgebnis(
      `${neu} Artikel neu angelegt, ${upd} aktualisiert` +
        (fehlerAnz > 0 ? `, ${fehlerAnz} fehlgeschlagen` : "") +
        "."
    );
    setVorschau(null);
    setRohtext("");
    await init(); // Bestand für eine evtl. nächste Runde neu laden
  }

  // ---------- Styles ----------
  const card: React.CSSProperties = {
    background: C.navy2,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "18px 20px",
  };
  const btnGold: React.CSSProperties = {
    padding: "11px 20px",
    borderRadius: 8,
    border: "none",
    background: C.gold,
    color: C.navy,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  };
  const zellInput: React.CSSProperties = {
    width: "100%",
    padding: "7px 9px",
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: 13,
    boxSizing: "border-box",
  };
  const zellInputDisabled: React.CSSProperties = {
    ...zellInput,
    background: "rgba(255,255,255,0.02)",
    color: C.textDim,
  };
  const thStil: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: C.textDim,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdStil: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 13,
    color: "#fff",
    borderBottom: `1px solid ${C.border}`,
    verticalAlign: "middle",
  };

  return (
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto" }}>
      <a
        href="/dashboard/erp/preisliste"
        style={{ color: C.cyan, textDecoration: "none", fontSize: 13.5 }}
      >
        ← zurück zur Preisliste
      </a>

      <h1 style={{ margin: "10px 0 4px", fontSize: 26, fontWeight: 800 }}>
        🪄 KI-Import
      </h1>
      <p style={{ margin: "0 0 20px", color: C.textDim, fontSize: 14, maxWidth: 760 }}>
        Füg einfach ein, was du hast – aus Excel, einer PDF, Word oder von einem
        Zettel abgetippt. Die KI erkennt die Artikel, räumt Preise und Einheiten
        auf und zeigt dir vor dem Speichern eine Vorschau. Du bestätigst, was
        übernommen wird.
      </p>

      {/* Ergebnis nach Übernahme */}
      {ergebnis && (
        <div style={{ ...card, borderLeft: `4px solid ${C.green}`, marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
            ✅ {ergebnis}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/dashboard/erp/preisliste" style={btnGhost}>
              Zur Preisliste
            </a>
            <button style={btnGhost} onClick={() => setErgebnis(null)}>
              Weitere Liste einlesen
            </button>
          </div>
        </div>
      )}

      {/* Eingabe (nur wenn keine Vorschau offen ist und kein Ergebnis steht) */}
      {!vorschau && !ergebnis && (
        <div style={{ ...card, marginBottom: 18 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: C.textDim,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Deine Liste hier einfügen
          </label>
          <textarea
            value={rohtext}
            onChange={(e) => setRohtext(e.target.value)}
            placeholder={"Beispiel:\n" + BEISPIEL}
            style={{
              width: "100%",
              minHeight: 200,
              padding: "12px 14px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "rgba(255,255,255,0.04)",
              color: "#fff",
              fontSize: 14,
              lineHeight: 1.5,
              boxSizing: "border-box",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            <button
              style={{ ...btnGold, opacity: laden ? 0.6 : 1 }}
              onClick={aufraeumen}
              disabled={laden}
            >
              {laden ? "KI räumt auf…" : "🪄 KI aufräumen lassen"}
            </button>
            <button
              style={btnGhost}
              onClick={() => setRohtext(BEISPIEL)}
              disabled={laden}
            >
              Beispiel einfügen
            </button>
            <span style={{ color: C.textDim, fontSize: 12.5 }}>
              Tipp: Ruhig unordentlich – Spalten, Semikolons oder Fließtext, die
              KI sortiert das.
            </span>
          </div>
        </div>
      )}

      {fehler && (
        <div
          style={{
            ...card,
            borderLeft: `4px solid ${C.danger}`,
            marginBottom: 18,
            color: C.danger,
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          {fehler}
        </div>
      )}

      {/* Vorschau */}
      {vorschau && (
        <div style={{ ...card, padding: 0 }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                Vorschau – {vorschau.length} Artikel erkannt
              </div>
              <div style={{ fontSize: 13, color: C.textDim, marginTop: 4 }}>
                <span style={{ color: C.cyan, fontWeight: 700 }}>{anzNeu} neu</span>{" "}
                ·{" "}
                <span style={{ color: C.green, fontWeight: 700 }}>
                  {anzUpd} werden aktualisiert
                </span>{" "}
                · Häkchen entfernen = überspringen
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                style={btnGhost}
                onClick={() => {
                  setVorschau(null);
                  setFehler(null);
                }}
                disabled={speichern}
              >
                Verwerfen
              </button>
              <button
                style={{
                  ...btnGold,
                  opacity: speichern || anzNeu + anzUpd === 0 ? 0.6 : 1,
                }}
                onClick={uebernehmen}
                disabled={speichern || anzNeu + anzUpd === 0}
              >
                {speichern
                  ? "Übernehme…"
                  : `✓ ${anzNeu + anzUpd} in Preisliste übernehmen`}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStil, width: 36 }}></th>
                  <th style={thStil}>Status</th>
                  <th style={thStil}>Bezeichnung</th>
                  <th style={thStil}>Art.-Nr.</th>
                  <th style={thStil}>Einheit</th>
                  <th style={{ ...thStil, textAlign: "right" }}>Einkauf</th>
                  <th style={{ ...thStil, textAlign: "right" }}>Verkauf</th>
                  <th style={thStil}>Kategorie</th>
                </tr>
              </thead>
              <tbody>
                {vorschau.map((x, i) => {
                  const istUpdate = !!x.matchId;
                  const aus = !x.uebernehmen;
                  return (
                    <tr key={i} style={{ opacity: aus ? 0.45 : 1 }}>
                      <td style={{ ...tdStil, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={x.uebernehmen}
                          onChange={(e) => setV(i, { uebernehmen: e.target.checked })}
                        />
                      </td>
                      <td style={tdStil}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            color: istUpdate ? C.green : C.cyan,
                            background: istUpdate
                              ? "rgba(76,175,125,0.14)"
                              : "rgba(0,229,255,0.12)",
                            border: `1px solid ${
                              istUpdate ? "rgba(76,175,125,0.4)" : "rgba(0,229,255,0.4)"
                            }`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {istUpdate ? "Update" : "Neu"}
                        </span>
                      </td>
                      <td style={{ ...tdStil, minWidth: 200 }}>
                        {istUpdate ? (
                          <span>{x.bezeichnung}</span>
                        ) : (
                          <input
                            style={zellInput}
                            value={x.bezeichnung}
                            onChange={(e) => setV(i, { bezeichnung: e.target.value })}
                          />
                        )}
                      </td>
                      <td style={{ ...tdStil, color: C.textDim, whiteSpace: "nowrap" }}>
                        {x.artikelnummer || "—"}
                      </td>
                      <td style={{ ...tdStil, width: 120 }}>
                        {istUpdate ? (
                          <span style={{ color: C.textDim }}>—</span>
                        ) : (
                          <input
                            style={zellInput}
                            value={x.einheit}
                            onChange={(e) => setV(i, { einheit: e.target.value })}
                          />
                        )}
                      </td>
                      <td style={{ ...tdStil, width: 130, textAlign: "right" }}>
                        <input
                          style={{ ...zellInput, textAlign: "right" }}
                          value={x.ekStr}
                          inputMode="decimal"
                          placeholder="—"
                          onChange={(e) => setV(i, { ekStr: e.target.value })}
                        />
                        {istUpdate && (
                          <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>
                            vorher {x.altEk == null ? "—" : eur(x.altEk)}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStil, width: 130, textAlign: "right" }}>
                        <input
                          style={{ ...zellInput, textAlign: "right" }}
                          value={x.vkStr}
                          inputMode="decimal"
                          placeholder="—"
                          onChange={(e) => setV(i, { vkStr: e.target.value })}
                        />
                        {istUpdate && (
                          <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>
                            vorher {x.altVk == null ? "—" : eur(x.altVk)}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStil, minWidth: 150 }}>
                        {istUpdate ? (
                          <span style={{ color: C.textDim }}>—</span>
                        ) : (
                          <input
                            style={zellInput}
                            value={x.kategorie}
                            onChange={(e) => setV(i, { kategorie: e.target.value })}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding: "12px 20px",
              borderTop: `1px solid ${C.border}`,
              color: C.textDim,
              fontSize: 12.5,
            }}
          >
            Bei „Update"-Zeilen werden nur die Preise aktualisiert – Bezeichnung,
            Einheit und Kategorie des bestehenden Artikels bleiben unverändert. Jede
            Preisänderung wird automatisch im Verlauf protokolliert.
          </div>
        </div>
      )}
    </div>
  );
}
