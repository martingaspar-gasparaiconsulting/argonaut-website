"use client";
// ============================================================================
// ARGONAUT OS · Paket 325 (S2) · /dashboard/shop/gefahrstoffe
//
// Gefahr-Angaben je Shop-Artikel: Piktogramme, Signalwort, Gefahrenhinweise
// (H/EUH) und Sicherheitshinweise (P) mit Wortlaut, UN-Nummer, UFI — oder
// „nicht kennzeichnungspflichtig".
//   · „Aus dem SDB lesen" (KI, nur Vorschlag, /api/shop/gefahr-auslesen)
//   · „Aus dem Gefahrstoffverzeichnis" (Codes ohne Wortlaut)
//   · von Hand
// Ein Mensch vergleicht mit dem Sicherheitsdatenblatt und bestätigt.
// Im Shop erscheint davon nichts, bis der Anwalt freigibt (startSperre
// „gefahrstoffShop", R49). ARGONAUT stuft nichts ein.
// ============================================================================
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Leerzustand from "../../_components/Leerzustand";
import { startFrei } from "@/lib/startSperre";
import { useFreigabeStand } from "@/lib/useFreigabeStand";
import {
  PIKTOGRAMME, LEER, STATUS_TEXT, ausVerzeichnis, bestaetigFehler, gefahrStatus, kurzText, plausiHinweise, sauber,
  type GefahrAngaben, type GefahrStatus, type Satz,
} from "@/lib/shopGefahr";
import { STATUS_TEXT as VERSAND_TEXT } from "@/lib/sdbVersand";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  navy: "#0A1628", navy2: "#0F1F33", gold: "#C9A84C", cyan: "#00e5ff",
  green: "#4CAF7D", danger: "#E06666", warn: "#E0A24C", textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};
const FARBE: Record<GefahrStatus, string> = { fehlt: C.textDim, vorschlag: C.warn, bestaetigt: C.green };

type Artikel = { id: string; bezeichnung: string | null; artikelnummer: string | null };
type Zeile = GefahrAngaben & { id: string; artikel_id: string; status: string; quelle: string; sdb_dokument_id: string | null; bestaetigt_am: string | null };
type Sdb = { id: string; artikel_id: string; sprache: string | null; version: string | null; ausgabe_am: string | null };
type Verz = { artikel_id: string | null; h_saetze: string | null; piktogramme: string[] | null; signalwort: string | null };

async function alleSeiten<T>(laden: (von: number, bis: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ zeilen: T[]; fehler: boolean }> {
  const zeilen: T[] = [];
  for (let von = 0; von < 20000; von += 1000) {
    const { data, error } = await laden(von, von + 999);
    if (error) return { zeilen, fehler: true };
    const d = (data as T[]) ?? [];
    zeilen.push(...d);
    if (d.length < 1000) break;
  }
  return { zeilen, fehler: false };
}

function datum(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}

export default function ShopGefahrSeite() {
  const freigabe = useFreigabeStand().start; // Paket 346: Code ODER Freigabe-Zentrale
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [zeilen, setZeilen] = useState<Record<string, Zeile>>({});
  const [sdb, setSdb] = useState<Record<string, Sdb[]>>({});
  const [verz, setVerz] = useState<Record<string, Verz>>({});
  const [offen, setOffen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | GefahrStatus>("alle");

  const neuLaden = useCallback(async () => {
    setFehler(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLaden(false); return; }
    let chef: string | null = null;
    try { chef = ((await supabase.rpc("mein_chef_id")).data as string | null) ?? null; } catch { chef = null; }
    setBetrieb(chef || user.id);
    setIstChef(!chef);
    const [a, g, d, v] = await Promise.all([
      alleSeiten<Artikel>((x, y) => supabase.from("artikel").select("id, bezeichnung, artikelnummer").eq("im_shop", true)
        .order("bezeichnung", { ascending: true }).order("id", { ascending: true }).range(x, y)),
      alleSeiten<Zeile>((x, y) => supabase.from("artikel_gefahr")
        .select("id, artikel_id, piktogramme, signalwort, h_saetze, p_saetze, un_nummer, ufi, keine_kennzeichnung, status, quelle, sdb_dokument_id, bestaetigt_am")
        .order("id", { ascending: true }).range(x, y)),
      alleSeiten<Sdb>((x, y) => supabase.from("produkt_dokument").select("id, artikel_id, sprache, version, ausgabe_am")
        .eq("art", "sdb").eq("aktuell", true).order("id", { ascending: true }).range(x, y)),
      alleSeiten<Verz>((x, y) => supabase.from("gefahrstoff").select("artikel_id, h_saetze, piktogramme, signalwort")
        .not("artikel_id", "is", null).order("id", { ascending: true }).range(x, y)),
    ]);
    if (a.fehler) setFehler("Die Shop-Artikel konnten nicht geladen werden.");
    else if (g.fehler) setFehler("Die Gefahr-Angaben konnten nicht geladen werden. Läuft das SQL zu Paket 325 schon?");
    setArtikel(a.zeilen);
    setZeilen(Object.fromEntries(g.zeilen.map((z) => [z.artikel_id, z])));
    const s: Record<string, Sdb[]> = {};
    for (const x of d.zeilen) (s[x.artikel_id] ??= []).push(x);
    setSdb(s);
    setVerz(Object.fromEntries(v.zeilen.filter((x) => x.artikel_id).map((x) => [x.artikel_id as string, x])));
    setLaden(false);
  }, []);

  useEffect(() => { void neuLaden(); }, [neuLaden]);

  const liste = useMemo(() => artikel.map((a) => ({ a, z: zeilen[a.id] ?? null, st: gefahrStatus(zeilen[a.id]) })), [artikel, zeilen]);
  const sichtbar = liste.filter((x) => filter === "alle" || x.st === filter);
  const zahl = (st: GefahrStatus) => liste.filter((x) => x.st === st).length;

  return (
    <div style={{ color: "#fff", maxWidth: 1150, margin: "0 auto" }}>
      <a href="/dashboard/shop" style={{ color: C.cyan }}>← Zurück zum Shop</a>
      <h1 style={{ margin: "14px 0 4px", fontSize: "clamp(26px, 2.25vw, 36px)", fontWeight: 800 }}>⚠️ Gefahr-Angaben im Shop</h1>
      <p style={{ margin: 0, color: C.textDim, maxWidth: 840 }}>
        Für Produkte mit Gefahrstoff-Kennzeichnung: Piktogramme, Signalwort, Gefahren- und Sicherheitshinweise, UN-Nummer und UFI — so,
        wie sie im Sicherheitsdatenblatt (Abschnitt 2.2 und 14) stehen. Die KI liest nur ab und schlägt vor; Sie vergleichen mit dem SDB und bestätigen.
        ARGONAUT stuft nichts selbst ein.
      </p>
      {!startFrei("gefahrstoffShop", freigabe) && (
        <div style={S.hinweis}>Im Shop werden diese Angaben erst nach der rechtlichen Prüfung angezeigt. Sie können schon jetzt alles vorbereiten und bestätigen.</div>
      )}
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {meldung && <div style={S.ok} role="status">{meldung}</div>}

      {laden ? <div style={{ color: C.textDim, padding: 20 }}>Wird geladen …</div> : !artikel.length ? (
        <Leerzustand icon="⚠️" titel="Noch keine Artikel im Shop" text="Übernehmen Sie zuerst Artikel unter „Produkte in den Shop“. Danach pflegen Sie hier die Gefahr-Angaben." />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
            {(["alle", "fehlt", "vorschlag", "bestaetigt"] as const).map((k) => (
              <button key={k} style={{ ...S.chip, ...(filter === k ? S.chipAktiv : {}) }} onClick={() => setFilter(k)}>
                {k === "alle" ? `alle (${liste.length})` : `${STATUS_TEXT[k]} (${zahl(k)})`}
              </button>
            ))}
          </div>
          {sichtbar.length === 0 && <div style={{ color: C.textDim, padding: 12 }}>Keine Treffer für diesen Filter.</div>}
          {sichtbar.map(({ a, z, st }) => (
            <div key={a.id} style={S.karte}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <b>{a.bezeichnung || "Ohne Namen"}</b>{a.artikelnummer ? <span style={{ color: C.textDim }}> · {a.artikelnummer}</span> : null}
                  <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>
                    {z ? kurzText(sauber(z)) : "—"} · SDB: {(sdb[a.id] ?? []).length ? (sdb[a.id] ?? []).map((x) => (x.sprache || "de").toUpperCase()).join(" ") : "keins hinterlegt"}
                  </div>
                </div>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ ...S.marke, color: FARBE[st], borderColor: FARBE[st] }}>{STATUS_TEXT[st]}{st === "bestaetigt" && z?.bestaetigt_am ? ` am ${datum(z.bestaetigt_am)}` : ""}</span>
                  <button style={S.knopfKlein} onClick={() => setOffen(offen === a.id ? null : a.id)}>{offen === a.id ? "Schließen" : "Bearbeiten"}</button>
                </span>
              </div>
              {offen === a.id && (
                <>
                  <Editor key={a.id + (z?.id ?? "") + (z?.status ?? "")} artikel={a} zeile={z} sdb={sdb[a.id] ?? []} verz={verz[a.id] ?? null} betrieb={betrieb}
                    onGespeichert={async (t) => { setMeldung(t); await neuLaden(); }} />
                  <SdbVersand artikel={a} istChef={istChef} hatSdb={(sdb[a.id] ?? []).length > 0} setMeldung={setMeldung} />
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Editor({ artikel, zeile, sdb, verz, betrieb, onGespeichert }: {
  artikel: Artikel; zeile: Zeile | null; sdb: Sdb[]; verz: Verz | null; betrieb: string | null;
  onGespeichert: (meldung: string) => Promise<void>;
}) {
  const [w, setW] = useState<GefahrAngaben>(zeile ? sauber(zeile) : { ...LEER });
  const [quelle, setQuelle] = useState<string>(zeile?.quelle ?? "hand");
  const [sdbId, setSdbId] = useState<string | null>(zeile?.sdb_dokument_id ?? null);
  const [verglichen, setVerglichen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kiHinweise, setKiHinweise] = useState<string[]>([]);

  const s0 = sauber(w);
  const ungueltig = w.keine_kennzeichnung ? 0 : (w.h_saetze.length - s0.h_saetze.length) + (w.p_saetze.length - s0.p_saetze.length);
  const formatFehler = [
    ...(ungueltig > 0 ? [`${ungueltig} Zeile(n) mit leerem, doppeltem oder ungültigem Code (z. B. H225, EUH066, P210, P303+P361+P353) — bitte korrigieren oder entfernen.`] : []),
    ...(w.un_nummer && !s0.un_nummer ? ['UN-Nummer: vier Ziffern, z. B. 1993.'] : []),
    ...(w.ufi && !s0.ufi && !w.keine_kennzeichnung ? ['UFI: 16 Zeichen, z. B. N1QV-R00N-0007-C4RN.'] : []),
  ];
  const rot = [...formatFehler, ...bestaetigFehler(s0)];
  const gelb = plausiHinweise(s0);

  function setze(t: Partial<GefahrAngaben>) { setW((alt) => ({ ...alt, ...t })); }

  async function ausSdb() {
    setBusy("ki"); setFehler(null); setKiHinweise([]);
    try {
      const r = await fetch("/api/shop/gefahr-auslesen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ artikelId: artikel.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler(d.error || "Das Auslesen hat nicht geklappt."); return; }
      setW(sauber(d.erkannt)); setQuelle("sdb"); setSdbId(d.dokumentId ?? null); setVerglichen(false);
      setKiHinweise(Array.isArray(d.hinweise) ? d.hinweise : []);
    } finally { setBusy(null); }
  }

  async function speichern(status: "vorschlag" | "bestaetigt") {
    if (!betrieb) return;
    const s = sauber(w);
    // Nichts still verwerfen: ungültige Codes, UN-Nummer oder UFI erst korrigieren.
    if (formatFehler.length) { setFehler(formatFehler[0]); return; }
    if (status === "bestaetigt" && rot.length) { setFehler(rot[0]); return; }
    if (status === "bestaetigt") {
      if (!verglichen) { setFehler("Bitte bestätigen Sie, dass Sie die Angaben mit dem Sicherheitsdatenblatt verglichen haben."); return; }
    }
    setBusy(status); setFehler(null);
    const daten = { owner_user_id: betrieb, artikel_id: artikel.id, ...s, quelle, sdb_dokument_id: sdbId, status };
    const { error } = await supabase.from("artikel_gefahr").upsert(daten, { onConflict: "artikel_id" });
    setBusy(null);
    if (error) { setFehler("Speichern hat nicht geklappt: " + error.message); return; }
    await onGespeichert(status === "bestaetigt" ? `${artikel.bezeichnung}: Angaben bestätigt.` : `${artikel.bezeichnung}: als Vorschlag gespeichert.`);
  }

  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={S.knopfGold} disabled={!!busy || !sdb.length} title={sdb.length ? "" : "Kein Sicherheitsdatenblatt hinterlegt"} onClick={() => void ausSdb()}>
          {busy === "ki" ? "KI liest das SDB …" : "📄 Aus dem Sicherheitsdatenblatt lesen"}
        </button>
        {verz && (
          <button style={S.knopf} disabled={!!busy} onClick={() => { setW(ausVerzeichnis(verz)); setQuelle("verzeichnis"); setVerglichen(false); setKiHinweise(["Aus dem Gefahrstoffverzeichnis: nur Codes — den Wortlaut bitte aus dem SDB ergänzen."]); }}>
            📋 Aus dem Gefahrstoffverzeichnis
          </button>
        )}
        {!sdb.length && <span style={{ color: C.textDim, fontSize: 13, alignSelf: "center" }}>Kein SDB hinterlegt — <a href="/dashboard/erp/dokumente" style={{ color: C.cyan }}>unter Produkt-Dokumente hochladen</a> oder von Hand eintragen.</span>}
      </div>
      {kiHinweise.length > 0 && <div style={{ ...S.hinweis, borderColor: C.warn }}>⚠️ {kiHinweise.join(" · ")}</div>}
      {fehler && <div style={S.fehler}>{fehler}</div>}

      <label style={S.haken}>
        <input type="checkbox" checked={w.keine_kennzeichnung} onChange={(e) => setze(e.target.checked ? { ...LEER, keine_kennzeichnung: true, un_nummer: w.un_nummer } : { keine_kennzeichnung: false })} />
        Nicht kennzeichnungspflichtig (steht so in Abschnitt 2.2 des SDB)
      </label>

      {!w.keine_kennzeichnung && (
        <>
          <div style={S.klein}>Piktogramme</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PIKTOGRAMME.map((p) => (
              <label key={p.key} style={{ ...S.pikto, ...(w.piktogramme.includes(p.key) ? S.piktoAn : {}) }}>
                <input type="checkbox" style={{ display: "none" }} checked={w.piktogramme.includes(p.key)}
                  onChange={(e) => setze({ piktogramme: e.target.checked ? [...w.piktogramme, p.key].sort() : w.piktogramme.filter((x) => x !== p.key) })} />
                <span style={S.raute}>◆</span>{p.key} · {p.label}
              </label>
            ))}
          </div>
          <label style={{ ...S.label, maxWidth: 260 }}>Signalwort
            <select style={S.input} value={w.signalwort ?? ""} onChange={(e) => setze({ signalwort: (e.target.value || null) as GefahrAngaben["signalwort"] })}>
              <option value="">—</option><option value="Gefahr">Gefahr</option><option value="Achtung">Achtung</option>
            </select>
          </label>
          <SatzListe titel="Gefahrenhinweise (H- und EUH-Sätze)" beispiel="H225" saetze={w.h_saetze} onAendern={(h) => setze({ h_saetze: h })} />
          <SatzListe titel="Sicherheitshinweise (P-Sätze)" beispiel="P210" saetze={w.p_saetze} onAendern={(p) => setze({ p_saetze: p })} />
        </>
      )}

      <div style={S.raster}>
        <label style={S.label}>UN-Nummer (Abschnitt 14.1)
          <input style={S.input} value={w.un_nummer ?? ""} placeholder="z. B. 1993" onChange={(e) => setze({ un_nummer: e.target.value || null })} />
        </label>
        {!w.keine_kennzeichnung && (
          <label style={S.label}>UFI (falls auf dem Etikett)
            <input style={S.input} value={w.ufi ?? ""} placeholder="XXXX-XXXX-XXXX-XXXX" onChange={(e) => setze({ ufi: e.target.value || null })} />
          </label>
        )}
      </div>

      {rot.length > 0 && <div style={{ color: C.danger, fontSize: 13, marginTop: 10 }}>Vor dem Bestätigen: {rot.join(" ")}</div>}
      {gelb.length > 0 && <div style={{ color: C.warn, fontSize: 13, marginTop: 6 }}>Bitte prüfen: {gelb.join(" ")}</div>}

      <label style={{ ...S.haken, marginTop: 14 }}>
        <input type="checkbox" checked={verglichen} onChange={(e) => setVerglichen(e.target.checked)} />
        Ich habe die Angaben mit dem aktuellen Sicherheitsdatenblatt verglichen.
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button style={S.knopf} disabled={!!busy} onClick={() => void speichern("vorschlag")}>💾 Als Vorschlag speichern</button>
        <button style={S.knopfGold} disabled={!!busy || rot.length > 0 || !verglichen} onClick={() => void speichern("bestaetigt")}>✓ Geprüft und bestätigen</button>
      </div>
      <p style={{ color: C.textDim, fontSize: 12, marginTop: 8 }}>
        Jede Änderung braucht eine neue Bestätigung. Gespeichert wird, wer wann bestätigt hat.
      </p>
    </div>
  );
}

// ------------------------------------------- SDB-Versand-Nachweis (P328) ---
type Versand = { id: string; empfaenger_email: string | null; empfaenger_name: string | null; anlass: string; status: string; versendet_am: string; sprache: string; dokument_version: string | null };

function SdbVersand({ artikel, istChef, hatSdb, setMeldung }: { artikel: Artikel; istChef: boolean; hatSdb: boolean; setMeldung: (t: string | null) => void }) {
  const sdbFrei = startFrei("sdbVersand", useFreigabeStand().start); // Paket 346: Code ODER Freigabe-Zentrale
  const [liste, setListe] = useState<Versand[] | null>(null);
  const [nach, setNach] = useState<{ empfaenger: { email: string; name: string | null; sprache: string; fassung: string | null }[]; frei: boolean; grund: string | null } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    const { data, error } = await supabase.from("sdb_versand")
      .select("id, empfaenger_email, empfaenger_name, anlass, status, versendet_am, sprache, dokument_version")
      .eq("artikel_id", artikel.id).order("versendet_am", { ascending: false }).limit(50);
    setListe(error ? [] : ((data as Versand[]) ?? []));
    if (istChef) {
      const r = await fetch(`/api/shop/sdb-nachversand?artikelId=${encodeURIComponent(artikel.id)}`);
      const d = await r.json().catch(() => null);
      setNach(r.ok && d ? d : null);
    }
  }, [artikel.id, istChef]);
  useEffect(() => { void laden(); }, [laden]);

  async function nachsenden() {
    if (!nach?.empfaenger.length) return;
    if (!window.confirm(`Die aktuelle Fassung an ${nach.empfaenger.length} Empfänger der letzten 12 Monate senden?`)) return;
    setBusy(true); setFehler(null);
    const r = await fetch("/api/shop/sdb-nachversand", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ artikelId: artikel.id }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setFehler(d.error || "Der Nachversand hat nicht geklappt."); return; }
    setMeldung(`${artikel.bezeichnung}: ${d.gesendet} gesendet${d.fehler ? `, ${d.fehler} fehlgeschlagen (bitte selbst senden)` : ""}.`);
    await laden();
  }

  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
      <b>📨 Sicherheitsdatenblatt-Versand</b>
      <span style={{ color: C.textDim, fontSize: 13 }}> — geht mit der Bestellbestätigung mit (spätestens bei der ersten Lieferung, REACH Art. 31)</span>
      {!sdbFrei && <div style={{ color: C.warn, fontSize: 13, marginTop: 6 }}>Der automatische Versand wird nach der rechtlichen Prüfung freigeschaltet. Bis dahin senden Sie die Datenblätter bitte selbst.</div>}
      {!hatSdb && <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Kein Sicherheitsdatenblatt hinterlegt — dann geht nichts mit, und die Bestell-Mail an Sie weist darauf hin.</div>}
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {liste === null ? <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Wird geladen …</div> : liste.length === 0 ? (
        <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Noch nichts versendet.</div>
      ) : (
        <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 13 }}>
          {liste.slice(0, 12).map((v) => (
            <div key={v.id} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.textDim, minWidth: 92 }}>{datum(v.versendet_am)}</span>
              <span>{v.empfaenger_name || v.empfaenger_email || "ohne E-Mail"}</span>
              <span style={{ color: C.textDim }}>{v.anlass === "nachversand" ? "Nachversand" : "Bestellung"} · {(v.sprache || "de").toUpperCase()}{v.dokument_version ? ` · V${v.dokument_version}` : ""}</span>
              <span style={{ color: v.status === "versendet" ? C.green : C.warn }}>{VERSAND_TEXT[v.status] ?? v.status}</span>
            </div>
          ))}
          {liste.length > 12 && <div style={{ color: C.textDim }}>… und {liste.length - 12} weitere</div>}
        </div>
      )}
      {istChef && nach && (
        <div style={{ marginTop: 10 }}>
          {nach.empfaenger.length === 0
            ? <span style={{ color: C.textDim, fontSize: 13 }}>Alle Empfänger der letzten 12 Monate haben die aktuelle Fassung.</span>
            : <button style={S.knopf} disabled={busy || !nach.frei} title={nach.frei ? "" : nach.grund ?? ""} onClick={() => void nachsenden()}>
                🔁 Aktuelle Fassung an {nach.empfaenger.length} Empfänger der letzten 12 Monate senden
              </button>}
        </div>
      )}
    </div>
  );
}

function SatzListe({ titel, beispiel, saetze, onAendern }: { titel: string; beispiel: string; saetze: Satz[]; onAendern: (s: Satz[]) => void }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={S.klein}>{titel}</div>
      {saetze.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 32px", gap: 6, marginBottom: 6 }}>
          <input style={S.input} value={s.code} placeholder={beispiel} onChange={(e) => onAendern(saetze.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
          <input style={S.input} value={s.text} placeholder="Wortlaut aus dem SDB" onChange={(e) => onAendern(saetze.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <button style={{ ...S.knopfKlein, marginTop: 0, color: C.danger }} aria-label="Entfernen" onClick={() => onAendern(saetze.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button style={S.knopfKlein} onClick={() => onAendern([...saetze, { code: "", text: "" }])}>+ Zeile</button>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  hinweis: { background: "rgba(201,168,76,0.08)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", margin: "12px 0", color: "#E8EDF4" },
  fehler: { background: "rgba(224,102,102,0.12)", border: `1px solid ${C.danger}`, borderRadius: 10, padding: "10px 14px", margin: "12px 0", color: "#ffd6d6" },
  ok: { background: "rgba(76,175,125,0.12)", border: `1px solid ${C.green}`, borderRadius: 10, padding: "10px 14px", margin: "12px 0" },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 },
  chip: { background: "transparent", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontSize: 13 },
  chipAktiv: { color: C.gold, borderColor: C.gold },
  klein: { color: C.textDim, fontSize: 13, margin: "12px 0 6px" },
  pikto: { display: "inline-flex", gap: 6, alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13, color: C.textDim },
  piktoAn: { borderColor: C.danger, color: "#fff", background: "rgba(224,102,102,0.12)" },
  raute: { color: C.danger },
  input: { width: "100%", boxSizing: "border-box", background: C.navy, color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 15, fontFamily: "inherit" },
  label: { display: "flex", flexDirection: "column", gap: 4, color: C.textDim, fontSize: 13, marginTop: 10 },
  haken: { display: "flex", gap: 8, alignItems: "center", marginTop: 12 },
  raster: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 },
  knopf: { background: "transparent", color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 14 },
  knopfGold: { background: C.gold, color: C.navy, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontWeight: 700, fontSize: 14 },
  knopfKlein: { background: "transparent", color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13, marginTop: 4 },
  marke: { fontSize: 12, border: "1px solid", borderRadius: 6, padding: "1px 6px" },
};
