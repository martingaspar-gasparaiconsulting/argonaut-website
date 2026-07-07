"use client";
import { useMemo, useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import DateiImport from "../../../_components/DateiImport";

// ---------------------------------------------------------------------
// ARGONAUT OS · ERP · Lieferanten · KI-Import (Punkt 1, L-2)
// "KI nimmt, was du hast": Rohtext/Datei -> KI räumt auf
// (/api/lieferanten-import) -> Vorschau (neu vs. Update, mit Herkunft +
// Umschalter) -> prüfen/korrigieren -> in die lieferanten-Tabelle.
// Update = MERGE: nur ausgefüllte Felder überschreiben (leere lassen den
// bestehenden Wert unverändert). Der Firmenname ist die Erkennung.
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

interface BestLieferant {
  id: string;
  name: string;
}

interface Vorschau {
  name: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  adresse: string;
  website: string;
  kundennummer: string;
  uebernehmen: boolean;
  matchId: string | null;
  matchName: string | null;
  alsUpdate: boolean;
}

const BEISPIEL = `Forsttechnik Müller GmbH; Ansprechp. Hans Müller; info@mueller-forst.de; 07031/12345; Waldweg 12, 71032 Böblingen; Kundennr. K-4711
Aspen Kraftstoffe AG, vertrieb@aspen.de, www.aspen.de
STIHL Vertriebszentrale – Tel. 0800 1234567 – Badstraße 3, 71336 Waiblingen`;

export default function LieferantenImport() {
  const [userId, setUserId] = useState<string | null>(null);
  const [bestand, setBestand] = useState<BestLieferant[]>([]);
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
    const { data } = await supabase.from("lieferanten").select("id, name");
    if (data) setBestand(data as BestLieferant[]);
  }

  function findeMatch(name: string): BestLieferant | null {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    return bestand.find((b) => b.name.trim().toLowerCase() === n) || null;
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
      const res = await fetch("/api/lieferanten-import", {
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
      const arr: any[] = Array.isArray(data.lieferanten) ? data.lieferanten : [];
      if (arr.length === 0) {
        setFehler(
          "Es wurde kein Lieferant erkannt. Prüfe kurz, ob wirklich eine Kontaktliste im Text steht."
        );
        setLaden(false);
        return;
      }
      const v: Vorschau[] = arr.map((a) => {
        const name = String(a.name ?? "");
        const match = findeMatch(name);
        return {
          name,
          ansprechpartner: a.ansprechpartner ?? "",
          email: a.email ?? "",
          telefon: a.telefon ?? "",
          adresse: a.adresse ?? "",
          website: a.website ?? "",
          kundennummer: a.kundennummer ?? "",
          uebernehmen: true,
          matchId: match?.id ?? null,
          matchName: match?.name ?? null,
          alsUpdate: !!match,
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

  function toggleModus(i: number) {
    setVorschau((v) =>
      v ? v.map((x, idx) => (idx === i ? { ...x, alsUpdate: !x.alsUpdate } : x)) : v
    );
  }

  const anzNeu = useMemo(
    () =>
      (vorschau || []).filter((x) => x.uebernehmen && !(x.alsUpdate && x.matchId)).length,
    [vorschau]
  );
  const anzUpd = useMemo(
    () =>
      (vorschau || []).filter((x) => x.uebernehmen && x.alsUpdate && x.matchId).length,
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
      if (!x.name.trim()) {
        fehlerAnz++;
        continue;
      }

      if (x.alsUpdate && x.matchId) {
        // MERGE: nur ausgefüllte Felder überschreiben (Name bleibt = Erkennung)
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        if (x.ansprechpartner.trim()) patch.ansprechpartner = x.ansprechpartner.trim();
        if (x.email.trim()) patch.email = x.email.trim();
        if (x.telefon.trim()) patch.telefon = x.telefon.trim();
        if (x.adresse.trim()) patch.adresse = x.adresse.trim();
        if (x.website.trim()) patch.website = x.website.trim();
        if (x.kundennummer.trim()) patch.kundennummer = x.kundennummer.trim();
        const { error } = await supabase
          .from("lieferanten")
          .update(patch)
          .eq("id", x.matchId);
        if (error) fehlerAnz++;
        else upd++;
      } else {
        const { error } = await supabase.from("lieferanten").insert({
          owner_user_id: userId,
          name: x.name.trim(),
          ansprechpartner: x.ansprechpartner.trim() || null,
          email: x.email.trim() || null,
          telefon: x.telefon.trim() || null,
          adresse: x.adresse.trim() || null,
          website: x.website.trim() || null,
          kundennummer: x.kundennummer.trim() || null,
          aktiv: true,
        });
        if (error) fehlerAnz++;
        else neu++;
      }
    }

    setSpeichern(false);
    setErgebnis(
      `${neu} Lieferanten neu angelegt, ${upd} aktualisiert` +
        (fehlerAnz > 0 ? `, ${fehlerAnz} fehlgeschlagen` : "") +
        "."
    );
    setVorschau(null);
    setRohtext("");
    await init();
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
        href="/dashboard/erp/lieferanten"
        style={{ color: C.cyan, textDecoration: "none", fontSize: 13.5 }}
      >
        ← zurück zu den Lieferanten
      </a>

      <h1 style={{ margin: "10px 0 4px", fontSize: 26, fontWeight: 800 }}>
        🪄 KI-Import · Lieferanten
      </h1>
      <p style={{ margin: "0 0 20px", color: C.textDim, fontSize: 14, maxWidth: 760 }}>
        Füg einfach ein, was du hast – eine Lieferantenliste aus Excel, einer PDF,
        Word oder abgetippte Visitenkarten. Die KI erkennt Firma, Ansprechpartner
        und Kontaktdaten und zeigt dir vor dem Speichern eine Vorschau.
      </p>

      {ergebnis && (
        <div style={{ ...card, borderLeft: `4px solid ${C.green}`, marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
            ✅ {ergebnis}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/dashboard/erp/lieferanten" style={btnGhost}>
              Zu den Lieferanten
            </a>
            <button style={btnGhost} onClick={() => setErgebnis(null)}>
              Weitere Liste einlesen
            </button>
          </div>
        </div>
      )}

      {!vorschau && !ergebnis && (
        <div style={{ ...card, marginBottom: 18 }}>
          <DateiImport
            dunkel
            akzent={C.gold}
            onText={(text, meta) => {
              setRohtext(text);
              setFehler(
                meta.gekuerzt
                  ? "Hinweis: Die Datei war sehr lang und wurde für die Aufbereitung auf 20.000 Zeichen gekürzt. Den Rest ggf. in einer zweiten Runde einlesen."
                  : null
              );
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "18px 0 14px",
              color: C.textDim,
              fontSize: 12.5,
            }}
          >
            <div style={{ flex: 1, height: 1, background: C.border }} />
            oder Text direkt einfügen
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: C.textDim,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Deine Lieferantenliste hier einfügen
          </label>
          <textarea
            value={rohtext}
            onChange={(e) => setRohtext(e.target.value)}
            placeholder={"Beispiel:\n" + BEISPIEL}
            style={{
              width: "100%",
              minHeight: 180,
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
            <button style={btnGhost} onClick={() => setRohtext(BEISPIEL)} disabled={laden}>
              Beispiel einfügen
            </button>
            <span style={{ color: C.textDim, fontSize: 12.5 }}>
              Tipp: Ruhig unordentlich – die KI trennt Firma, Person und Kontaktdaten.
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
                Vorschau – {vorschau.length} Lieferanten erkannt
              </div>
              <div style={{ fontSize: 13, color: C.textDim, marginTop: 4 }}>
                <span style={{ color: C.cyan, fontWeight: 700 }}>{anzNeu} neu</span> ·{" "}
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
                  : `✓ ${anzNeu + anzUpd} übernehmen`}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ ...thStil, width: 36 }}></th>
                  <th style={thStil}>Status</th>
                  <th style={thStil}>Firmenname</th>
                  <th style={thStil}>Ansprechpartner</th>
                  <th style={thStil}>E-Mail</th>
                  <th style={thStil}>Telefon</th>
                  <th style={thStil}>Adresse</th>
                  <th style={thStil}>Website</th>
                  <th style={thStil}>Kundennr.</th>
                </tr>
              </thead>
              <tbody>
                {vorschau.map((x, i) => {
                  const hatMatch = !!x.matchId;
                  const istUpdate = x.alsUpdate && hatMatch;
                  const nummerKollision = hatMatch && !x.alsUpdate;
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
                      <td style={{ ...tdStil, minWidth: 140 }}>
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
                        {istUpdate && x.matchName && (
                          <div
                            style={{ fontSize: 11, color: C.textDim, marginTop: 5, lineHeight: 1.3 }}
                          >
                            von: <span style={{ color: "#fff" }}>{x.matchName}</span>
                          </div>
                        )}
                        {nummerKollision && (
                          <div
                            style={{
                              fontSize: 11,
                              color: C.warn,
                              marginTop: 5,
                              lineHeight: 1.3,
                              fontWeight: 600,
                            }}
                          >
                            ⚠ Name gibt es schon
                          </div>
                        )}
                        {hatMatch && (
                          <button
                            onClick={() => toggleModus(i)}
                            style={{
                              marginTop: 6,
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: C.cyan,
                              fontSize: 11.5,
                              fontWeight: 600,
                              textDecoration: "underline",
                              cursor: "pointer",
                              display: "block",
                            }}
                          >
                            {x.alsUpdate ? "→ doch neu anlegen" : "→ doch aktualisieren"}
                          </button>
                        )}
                      </td>
                      <td style={{ ...tdStil, minWidth: 180 }}>
                        {istUpdate ? (
                          <span>{x.name}</span>
                        ) : (
                          <input
                            style={zellInput}
                            value={x.name}
                            onChange={(e) => setV(i, { name: e.target.value })}
                          />
                        )}
                      </td>
                      <td style={{ ...tdStil, minWidth: 140 }}>
                        <input
                          style={zellInput}
                          value={x.ansprechpartner}
                          onChange={(e) => setV(i, { ansprechpartner: e.target.value })}
                        />
                      </td>
                      <td style={{ ...tdStil, minWidth: 160 }}>
                        <input
                          style={zellInput}
                          value={x.email}
                          onChange={(e) => setV(i, { email: e.target.value })}
                        />
                      </td>
                      <td style={{ ...tdStil, minWidth: 130 }}>
                        <input
                          style={zellInput}
                          value={x.telefon}
                          onChange={(e) => setV(i, { telefon: e.target.value })}
                        />
                      </td>
                      <td style={{ ...tdStil, minWidth: 180 }}>
                        <input
                          style={zellInput}
                          value={x.adresse}
                          onChange={(e) => setV(i, { adresse: e.target.value })}
                        />
                      </td>
                      <td style={{ ...tdStil, minWidth: 130 }}>
                        <input
                          style={zellInput}
                          value={x.website}
                          onChange={(e) => setV(i, { website: e.target.value })}
                        />
                      </td>
                      <td style={{ ...tdStil, minWidth: 100 }}>
                        <input
                          style={zellInput}
                          value={x.kundennummer}
                          onChange={(e) => setV(i, { kundennummer: e.target.value })}
                        />
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
              lineHeight: 1.5,
            }}
          >
            <b style={{ color: "#fff" }}>Wichtig:</b> Bei „Update"-Zeilen steht unter dem
            Status, welchen <i>bestehenden</i> Lieferanten die Zeile trifft („von: …").
            Passt das nicht, klick auf „→ doch neu anlegen". Bei Updates werden nur
            ausgefüllte Felder übernommen – leere Felder lassen den bestehenden Wert
            unverändert. Der Firmenname dient als Erkennung und bleibt unverändert.
          </div>
        </div>
      )}
    </div>
  );
}
