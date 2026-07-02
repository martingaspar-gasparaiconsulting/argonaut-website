"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E5 Bestellung-Detailseite
// Kopf editierbar · Positions-Editor (Artikel-Auswahl + Auto-Preis) ·
// Status-Flow · Gesamtsumme. Positionen speichern onBlur/onChange.
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

interface Bestellung {
  id: string;
  bestellnummer: string | null;
  lieferant_id: string | null;
  status: string;
  bestelldatum: string | null;
  lieferdatum_erwartet: string | null;
  notizen: string | null;
}

interface LieferantKurz {
  id: string;
  name: string;
}

interface ArtikelKurz {
  id: string;
  bezeichnung: string;
  einheit: string;
  einkaufspreis: number | null;
}

// Editierbare Position (Zahlen als Strings fuer die Eingabe)
type PosEdit = {
  id: string;
  artikel_id: string | null;
  bezeichnung: string;
  menge: string;
  einzelpreis: string;
  position: number;
};

function eur(n: number): string {
  return (Number(n) || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

export default function BestellungDetail() {
  const params = useParams();
  const bestellungId = Array.isArray(params.id)
    ? params.id[0]
    : (params.id as string);

  const [bestellung, setBestellung] = useState<Bestellung | null>(null);
  const [positionen, setPositionen] = useState<PosEdit[]>([]);
  const [lieferanten, setLieferanten] = useState<LieferantKurz[]>([]);
  const [artikelListe, setArtikelListe] = useState<ArtikelKurz[]>([]);
  const [laden, setLaden] = useState(true);
  const [notizen, setNotizen] = useState("");

  useEffect(() => {
    lade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestellungId]);

  async function lade() {
    setLaden(true);
    const { data: best } = await supabase
      .from("bestellungen")
      .select("*")
      .eq("id", bestellungId)
      .maybeSingle();
    const b = (best as Bestellung) ?? null;
    setBestellung(b);
    setNotizen(b?.notizen ?? "");

    const { data: pos } = await supabase
      .from("bestellpositionen")
      .select("id, artikel_id, bezeichnung, menge, einzelpreis, position")
      .eq("bestellung_id", bestellungId)
      .order("position", { ascending: true });
    setPositionen(
      (pos ?? []).map((p: any) => ({
        id: p.id,
        artikel_id: p.artikel_id,
        bezeichnung: p.bezeichnung ?? "",
        menge: p.menge != null ? String(p.menge) : "",
        einzelpreis: p.einzelpreis != null ? String(p.einzelpreis) : "",
        position: p.position ?? 1,
      }))
    );

    const { data: lief } = await supabase
      .from("lieferanten")
      .select("id, name")
      .order("name", { ascending: true });
    setLieferanten((lief as LieferantKurz[]) ?? []);

    const { data: art } = await supabase
      .from("artikel")
      .select("id, bezeichnung, einheit, einkaufspreis")
      .order("bezeichnung", { ascending: true });
    setArtikelListe((art as ArtikelKurz[]) ?? []);

    setLaden(false);
  }

  const gesamt = useMemo(
    () =>
      positionen.reduce(
        (s, p) =>
          s +
          (Number(p.menge.replace(",", ".")) || 0) *
            (Number(p.einzelpreis.replace(",", ".")) || 0),
        0
      ),
    [positionen]
  );

  async function updateBestellung(patch: Partial<Bestellung>) {
    if (!bestellung) return;
    await supabase.from("bestellungen").update(patch).eq("id", bestellung.id);
    setBestellung({ ...bestellung, ...patch });
  }

  function setPos(id: string, patch: Partial<PosEdit>) {
    setPositionen((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function speicherePos(id: string) {
    const p = positionen.find((x) => x.id === id);
    if (!p) return;
    await supabase
      .from("bestellpositionen")
      .update({
        artikel_id: p.artikel_id,
        bezeichnung: p.bezeichnung.trim() || "Position",
        menge: Number(p.menge.replace(",", ".")) || 0,
        einzelpreis: Number(p.einzelpreis.replace(",", ".")) || 0,
      })
      .eq("id", id);
  }

  async function artikelWaehlen(id: string, artikelId: string) {
    const p = positionen.find((x) => x.id === id);
    if (!p) return;
    const art = artikelListe.find((a) => a.id === artikelId);
    const patch: Partial<PosEdit> = { artikel_id: artikelId || null };
    if (art) {
      if (!p.bezeichnung.trim()) patch.bezeichnung = art.bezeichnung;
      if (!p.einzelpreis || Number(p.einzelpreis) === 0)
        patch.einzelpreis = String(art.einkaufspreis ?? 0);
    }
    const neu = { ...p, ...patch };
    setPos(id, patch);
    // direkt speichern (mit neuen Werten)
    await supabase
      .from("bestellpositionen")
      .update({
        artikel_id: neu.artikel_id,
        bezeichnung: neu.bezeichnung.trim() || "Position",
        einzelpreis: Number(neu.einzelpreis.replace(",", ".")) || 0,
      })
      .eq("id", id);
  }

  async function positionHinzufuegen() {
    if (!bestellung) return;
    const maxPos = positionen.reduce((m, p) => Math.max(m, p.position), 0);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    const basis = {
      bestellung_id: bestellung.id,
      bezeichnung: "",
      menge: 1,
      einzelpreis: 0,
      position: maxPos + 1,
    };
    const insertObj = uid ? { ...basis, owner_user_id: uid } : basis;
    const { data } = await supabase
      .from("bestellpositionen")
      .insert(insertObj)
      .select("id")
      .single();
    if (data) {
      setPositionen((ps) => [
        ...ps,
        {
          id: data.id,
          artikel_id: null,
          bezeichnung: "",
          menge: "1",
          einzelpreis: "0",
          position: maxPos + 1,
        },
      ]);
    }
  }

  async function positionLoeschen(id: string) {
    await supabase.from("bestellpositionen").delete().eq("id", id);
    setPositionen((ps) => ps.filter((p) => p.id !== id));
  }

  const lieferantName = bestellung?.lieferant_id
    ? lieferanten.find((l) => l.id === bestellung.lieferant_id)?.name ?? null
    : null;

  // ---------- Styles ----------
  const card: React.CSSProperties = {
    background: C.navy2,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "18px 20px",
  };
  const inputStil: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
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
    padding: "8px 10px",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: C.textDim,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdStil: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 14,
    color: "#fff",
    borderBottom: `1px solid ${C.border}`,
    verticalAlign: "middle",
  };

  if (laden) {
    return <div style={{ color: C.textDim, padding: 30 }}>Lade Bestellung…</div>;
  }

  if (!bestellung) {
    return (
      <div style={{ color: "#fff", maxWidth: 700, margin: "0 auto" }}>
        <a
          href="/dashboard/erp/bestellungen"
          style={{ color: C.cyan, fontSize: 14 }}
        >
          ← Zurück zu Bestellungen
        </a>
        <div style={{ ...card, marginTop: 16, color: C.textDim }}>
          Bestellung nicht gefunden.
        </div>
      </div>
    );
  }

  const aktuellerStatus =
    STATUS.find((s) => s.wert === bestellung.status) ?? STATUS[0];

  return (
    <div style={{ color: "#fff", maxWidth: 1100, margin: "0 auto" }}>
      <a
        href="/dashboard/erp/bestellungen"
        style={{ color: C.cyan, fontSize: 14 }}
      >
        ← Zurück zu Bestellungen
      </a>

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
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
            {bestellung.bestellnummer || "Bestellung"}
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
            {lieferantName ? (
              <a
                href={`/dashboard/erp/lieferanten/${bestellung.lieferant_id}`}
                style={{ color: C.cyan, textDecoration: "none" }}
              >
                {lieferantName}
              </a>
            ) : (
              "Kein Lieferant zugeordnet"
            )}
          </p>
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: aktuellerStatus.farbe,
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${aktuellerStatus.farbe}55`,
            borderRadius: 8,
            padding: "6px 12px",
          }}
        >
          {aktuellerStatus.label}
        </span>
      </div>

      {/* Kopf editierbar */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <label style={labelStil}>Lieferant</label>
            <select
              style={inputStil}
              value={bestellung.lieferant_id ?? ""}
              onChange={(e) =>
                updateBestellung({ lieferant_id: e.target.value || null })
              }
            >
              <option value="">— kein Lieferant —</option>
              {lieferanten.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStil}>Status</label>
            <select
              style={inputStil}
              value={bestellung.status}
              onChange={(e) => updateBestellung({ status: e.target.value })}
            >
              {STATUS.map((s) => (
                <option key={s.wert} value={s.wert}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStil}>Bestelldatum</label>
            <input
              type="date"
              style={inputStil}
              value={bestellung.bestelldatum ?? ""}
              onChange={(e) =>
                updateBestellung({ bestelldatum: e.target.value || null })
              }
            />
          </div>
          <div>
            <label style={labelStil}>Lieferung erwartet</label>
            <input
              type="date"
              style={inputStil}
              value={bestellung.lieferdatum_erwartet ?? ""}
              onChange={(e) =>
                updateBestellung({
                  lieferdatum_erwartet: e.target.value || null,
                })
              }
            />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={labelStil}>Notizen</label>
          <textarea
            style={{ ...inputStil, minHeight: 60, resize: "vertical" }}
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            onBlur={() => updateBestellung({ notizen: notizen.trim() || null })}
          />
        </div>
      </div>

      {/* Positionen */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Positionen</h3>
          <button style={btnGhost} onClick={positionHinzufuegen}>
            + Position
          </button>
        </div>

        {positionen.length === 0 ? (
          <div style={{ padding: "0 20px 20px", color: C.textDim }}>
            Noch keine Positionen. Füge oben rechts die erste Position hinzu.
          </div>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}
          >
            <thead>
              <tr>
                <th style={{ ...thStil, width: "26%" }}>Artikel</th>
                <th style={{ ...thStil, width: "28%" }}>Bezeichnung</th>
                <th style={{ ...thStil, textAlign: "right", width: "10%" }}>
                  Menge
                </th>
                <th style={{ ...thStil, textAlign: "right", width: "14%" }}>
                  Einzelpreis
                </th>
                <th style={{ ...thStil, textAlign: "right", width: "14%" }}>
                  Gesamt
                </th>
                <th style={{ ...thStil, width: "8%" }}></th>
              </tr>
            </thead>
            <tbody>
              {positionen.map((p) => {
                const zeilenSumme =
                  (Number(p.menge.replace(",", ".")) || 0) *
                  (Number(p.einzelpreis.replace(",", ".")) || 0);
                const einheit = p.artikel_id
                  ? artikelListe.find((a) => a.id === p.artikel_id)?.einheit ?? ""
                  : "";
                return (
                  <tr key={p.id}>
                    <td style={tdStil}>
                      <select
                        style={inputStil}
                        value={p.artikel_id ?? ""}
                        onChange={(e) => artikelWaehlen(p.id, e.target.value)}
                      >
                        <option value="">— frei —</option>
                        {artikelListe.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.bezeichnung}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStil}>
                      <input
                        style={inputStil}
                        value={p.bezeichnung}
                        onChange={(e) =>
                          setPos(p.id, { bezeichnung: e.target.value })
                        }
                        onBlur={() => speicherePos(p.id)}
                        placeholder="Bezeichnung"
                      />
                    </td>
                    <td style={tdStil}>
                      <input
                        style={{ ...inputStil, textAlign: "right" }}
                        value={p.menge}
                        inputMode="decimal"
                        onChange={(e) => setPos(p.id, { menge: e.target.value })}
                        onBlur={() => speicherePos(p.id)}
                      />
                      {einheit && (
                        <div
                          style={{
                            fontSize: 11,
                            color: C.textDim,
                            textAlign: "right",
                            marginTop: 2,
                          }}
                        >
                          {einheit}
                        </div>
                      )}
                    </td>
                    <td style={tdStil}>
                      <input
                        style={{ ...inputStil, textAlign: "right" }}
                        value={p.einzelpreis}
                        inputMode="decimal"
                        onChange={(e) =>
                          setPos(p.id, { einzelpreis: e.target.value })
                        }
                        onBlur={() => speicherePos(p.id)}
                      />
                    </td>
                    <td
                      style={{
                        ...tdStil,
                        textAlign: "right",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {eur(zeilenSumme)}
                    </td>
                    <td style={{ ...tdStil, textAlign: "right" }}>
                      <button
                        style={{
                          ...btnGhost,
                          color: C.danger,
                          borderColor: "rgba(224,102,102,0.4)",
                          padding: "7px 10px",
                        }}
                        onClick={() => positionLoeschen(p.id)}
                        title="Position löschen"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ ...tdStil, textAlign: "right", border: "none" }}>
                  <span style={{ color: C.textDim, fontWeight: 600 }}>
                    Gesamtsumme (netto)
                  </span>
                </td>
                <td
                  style={{
                    ...tdStil,
                    textAlign: "right",
                    fontWeight: 800,
                    fontSize: 16,
                    color: C.gold,
                    border: "none",
                  }}
                >
                  {eur(gesamt)}
                </td>
                <td style={{ border: "none" }}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: C.textDim }}>
        Änderungen an Kopf und Positionen werden automatisch gespeichert.
      </div>
    </div>
  );
}
