"use client";
// ============================================================================
// ARGONAUT OS · Paket 316 (S3a) · /dashboard/shop/geschaeftskunden
//
// Geschäftskunden-Shop: Kunden mit eigener Preisliste, Kauf auf Rechnung,
// Zahlungsziel und Kreditrahmen; Kundenkonto per geheimem Link; Preislisten
// mit Netto-Preisen und Staffeln; Gebinde und Mindestmenge je Artikel;
// Preis-Basis des Artikelstamms (brutto oder netto).
// Pflegen darf nur die Geschäftsleitung, Mitarbeiter mit „Shop“ sehen.
// ============================================================================
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Leerzustand from "../../_components/Leerzustand";
import { inCent, zahlAusFeld, zahlFeld } from "@/lib/zahlen";
import { startFrei } from "@/lib/startSperre";
import {
  SHOP_B2B_MODUL, basisNettoCent, centText, kundeName, mengenRegel, preisBasis, preisZeilePruefen,
  regelEingabePruefen, schaufensterStaffeln, zahlungsziel, type PreisBasis, type Preisliste,
} from "@/lib/shopB2b";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  navy: "#0A1628", navy2: "#0F1F33", gold: "#C9A84C", cyan: "#00e5ff",
  green: "#4CAF7D", danger: "#E06666", warn: "#E0A24C", textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

type Reiter = "kunden" | "listen" | "mengen" | "einstellung";
const REITER: { key: Reiter; label: string }[] = [
  { key: "kunden", label: "🏢 Geschäftskunden" },
  { key: "listen", label: "💶 Preislisten" },
  { key: "mengen", label: "📦 Gebinde & Mindestmenge" },
  { key: "einstellung", label: "⚙️ Preis-Basis" },
];

type Kunde = {
  id: string; kontakt_id: string; preisliste_id: string | null; auf_rechnung: boolean; zahlungsziel_tage: number;
  kreditrahmen_cent: number | null; aktiv: boolean; token_hash: string | null; link_erstellt_am: string | null;
  zuletzt_da_am: string | null; notiz: string | null;
};
type Kontakt = { id: string; firma: string | null; vorname: string | null; nachname: string | null; email: string | null };
type Liste = { id: string; name: string; rabatt_prozent: number; notiz: string | null };
type Preis = { id: string; preisliste_id: string; artikel_id: string; ab_menge: number; netto_cent: number };
type Artikel = {
  id: string; bezeichnung: string; artikelnummer: string | null; verkaufspreis: number | null; einheit: string | null;
  shop_mwst: number | null; shop_gebinde: number | null; shop_mindestmenge: number | null; im_shop: boolean | null; aktiv: boolean | null;
};

function datum(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}

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

export default function GeschaeftskundenSeite() {
  const [reiter, setReiter] = useState<Reiter>("kunden");
  const [istChef, setIstChef] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [kontakte, setKontakte] = useState<Record<string, Kontakt>>({});
  const [listen, setListen] = useState<Liste[]>([]);
  const [preise, setPreise] = useState<Preis[]>([]);
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [basis, setBasis] = useState<PreisBasis>("brutto");

  const neuLaden = useCallback(async () => {
    setFehler(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLaden(false); return; }
    setUid(user.id);
    let chef: string | null = null;
    try { chef = ((await supabase.rpc("mein_chef_id")).data as string | null) ?? null; } catch { chef = null; }
    setIstChef(!chef);
    const betrieb = chef || user.id;

    const [k, l, p] = await Promise.all([
      alleSeiten<Kunde>((v, b) => supabase.from("shop_kunde")
        .select("id, kontakt_id, preisliste_id, auf_rechnung, zahlungsziel_tage, kreditrahmen_cent, aktiv, token_hash, link_erstellt_am, zuletzt_da_am, notiz")
        .order("angelegt_am", { ascending: true }).order("id", { ascending: true }).range(v, b)),
      alleSeiten<Liste>((v, b) => supabase.from("shop_preisliste").select("id, name, rabatt_prozent, notiz")
        .order("name", { ascending: true }).order("id", { ascending: true }).range(v, b)),
      alleSeiten<Preis>((v, b) => supabase.from("shop_preis").select("id, preisliste_id, artikel_id, ab_menge, netto_cent")
        .order("ab_menge", { ascending: true }).order("id", { ascending: true }).range(v, b)),
    ]);
    if (k.fehler || l.fehler || p.fehler) {
      setFehler("Die Geschäftskunden konnten nicht geladen werden. Läuft das SQL zu Paket 316 schon?");
    }
    setKunden(k.zeilen); setListen(l.zeilen); setPreise(p.zeilen);

    const a = await alleSeiten<Artikel>((v, b) => supabase.from("artikel")
      .select("id, bezeichnung, artikelnummer, verkaufspreis, einheit, shop_mwst, shop_gebinde, shop_mindestmenge, im_shop, aktiv")
      .eq("im_shop", true).order("bezeichnung", { ascending: true }).order("id", { ascending: true }).range(v, b));
    setArtikel(a.zeilen);

    const ids = Array.from(new Set(k.zeilen.map((x) => x.kontakt_id)));
    const kt: Record<string, Kontakt> = {};
    for (let i = 0; i < ids.length; i += 80) {
      const { data } = await supabase.from("kontakte").select("id, firma, vorname, nachname, email").in("id", ids.slice(i, i + 80));
      for (const x of (data as Kontakt[]) ?? []) kt[x.id] = x;
    }
    setKontakte(kt);

    const { data: me } = await supabase.from("modul_einstellung").select("einstellung")
      .eq("owner_user_id", betrieb).eq("modul", SHOP_B2B_MODUL).maybeSingle();
    setBasis(preisBasis((me as { einstellung?: { preisbasis?: unknown } } | null)?.einstellung?.preisbasis));
    setLaden(false);
  }, []);

  useEffect(() => { void neuLaden(); }, [neuLaden]);

  const listeName = useMemo(() => Object.fromEntries(listen.map((l) => [l.id, l.name])), [listen]);

  return (
    <div style={{ color: "#fff", maxWidth: 1150, margin: "0 auto" }}>
      <a href="/dashboard/shop" style={{ color: C.cyan }}>← Zurück zum Shop</a>
      <h1 style={{ margin: "14px 0 4px", fontSize: "clamp(26px, 2.25vw, 36px)", fontWeight: 800 }}>🏢 Geschäftskunden-Shop</h1>
      <p style={{ margin: 0, color: C.textDim, maxWidth: 800 }}>
        Geschäftskunden sehen im Shop ihre eigenen Netto-Preise mit Staffeln und dürfen — wenn Sie es freigeben — auf Rechnung kaufen.
        Jeder Kunde bekommt einen persönlichen Link. Gebinde und Mindestmenge gelten für alle Käufer im Shop.
      </p>
      {!startFrei("shop") && (
        <div style={S.hinweis}>Der Online-Shop ist bis zur rechtlichen Freigabe geschlossen. Sie können hier schon alles vorbereiten; Kunden sehen bis dahin einen Hinweis.</div>
      )}
      {!istChef && !laden && <div style={S.hinweis}>Preise, Kauf auf Rechnung und Links pflegt die Geschäftsleitung. Sie sehen hier den Stand.</div>}
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
          {reiter === "kunden" && (
            <KundenTeil kunden={kunden} kontakte={kontakte} listen={listen} listeName={listeName} istChef={istChef}
              uid={uid} onNeu={neuLaden} setMeldung={setMeldung} />
          )}
          {reiter === "listen" && (
            <ListenTeil listen={listen} preise={preise} artikel={artikel} basis={basis} istChef={istChef}
              onNeu={neuLaden} setMeldung={setMeldung} />
          )}
          {reiter === "mengen" && <MengenTeil artikel={artikel} istChef={istChef} onNeu={neuLaden} setMeldung={setMeldung} />}
          {reiter === "einstellung" && (
            <BasisTeil basis={basis} istChef={istChef} uid={uid} onGespeichert={(b) => { setBasis(b); setMeldung("Preis-Basis gespeichert."); }} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Kunden ---
function KundenTeil({ kunden, kontakte, listen, listeName, istChef, uid, onNeu, setMeldung }: {
  kunden: Kunde[]; kontakte: Record<string, Kontakt>; listen: Liste[]; listeName: Record<string, string>; istChef: boolean;
  uid: string | null; onNeu: () => Promise<void>; setMeldung: (s: string | null) => void;
}) {
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<Kontakt[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [link, setLink] = useState<{ kunde: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const s = suche.trim();
    if (s.length < 2) { setTreffer([]); return; }
    const t = setTimeout(async () => {
      const muster = `%${s.replace(/[%_,()]/g, " ")}%`;
      const { data } = await supabase.from("kontakte").select("id, firma, vorname, nachname, email")
        .or(`firma.ilike.${muster},nachname.ilike.${muster},vorname.ilike.${muster},email.ilike.${muster}`).limit(12);
      setTreffer((data as Kontakt[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [suche]);

  const schon = useMemo(() => new Set(kunden.map((k) => k.kontakt_id)), [kunden]);

  async function anlegen(k: Kontakt) {
    if (!uid) return;
    setBusy(true); setFehler(null);
    const { error } = await supabase.from("shop_kunde").insert({ owner_user_id: uid, kontakt_id: k.id });
    setBusy(false);
    if (error) { setFehler(error.code === "23505" ? "Dieser Kontakt ist schon Geschäftskunde." : "Der Kunde konnte nicht angelegt werden."); return; }
    setSuche(""); setTreffer([]);
    setMeldung(`${kundeName(k)} ist jetzt Geschäftskunde. Bitte Preisliste wählen und den Link erzeugen.`);
    await onNeu();
  }

  async function linkErzeugen(kunde: Kunde, senden: boolean) {
    if (kunde.token_hash && !window.confirm("Der bisherige Link wird damit ungültig. Neuen Link erzeugen?")) return;
    setBusy(true); setFehler(null); setLink(null);
    try {
      const r = await fetch("/api/shop/kundenlink", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kundeId: kunde.id, senden }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler(d.error || "Der Link konnte nicht erzeugt werden."); return; }
      setLink({ kunde: kunde.id, link: d.link });
      setMeldung(senden ? (d.mail ? "Neuer Link erzeugt und per E-Mail an den Kunden geschickt." : (d.hinweis || "Neuer Link erzeugt — die E-Mail ging nicht raus. Bitte den Link selbst weitergeben.")) : "Neuer Link erzeugt. Er wird nur jetzt angezeigt.");
      await onNeu();
    } finally { setBusy(false); }
  }

  async function linkSperren(kunde: Kunde) {
    if (!window.confirm("Link sperren? Der Kunde sieht danach wieder die normalen Shop-Preise.")) return;
    const { data, error } = await supabase.from("shop_kunde").update({ token_hash: null }).eq("id", kunde.id).select("id");
    if (error || !data?.length) { setFehler("Der Link konnte nicht gesperrt werden."); return; }
    setLink(null); setMeldung("Link gesperrt."); await onNeu();
  }

  async function loeschen(kunde: Kunde) {
    if (!window.confirm("Geschäftskunden entfernen? Der Kontakt bleibt im CRM, bisherige Bestellungen bleiben erhalten.")) return;
    const { data, error } = await supabase.from("shop_kunde").delete().eq("id", kunde.id).select("id");
    if (error || !data?.length) { setFehler("Der Kunde konnte nicht entfernt werden."); return; }
    setOffen(null); setMeldung("Geschäftskunde entfernt."); await onNeu();
  }

  return (
    <div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {istChef && (
        <div style={S.karte}>
          <b>＋ Geschäftskunden aus den Kontakten anlegen</b>
          <input style={{ ...S.input, marginTop: 8, maxWidth: 420 }} placeholder="Firma, Name oder E-Mail suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Kontakt suchen" />
          {treffer.length > 0 && (
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {treffer.map((t) => (
                <div key={t.id} style={S.zeile}>
                  <span>{kundeName(t)}{t.email ? <span style={{ color: C.textDim }}> · {t.email}</span> : null}</span>
                  {schon.has(t.id)
                    ? <span style={{ color: C.textDim }}>schon Geschäftskunde</span>
                    : <button style={S.knopf} disabled={busy} onClick={() => anlegen(t)}>Als Geschäftskunde anlegen</button>}
                </div>
              ))}
            </div>
          )}
          {suche.trim().length >= 2 && treffer.length === 0 && <div style={{ color: C.textDim, marginTop: 8 }}>Kein Kontakt gefunden. Neue Kontakte legen Sie unter Vertrieb/CRM an.</div>}
        </div>
      )}

      {kunden.length === 0 ? (
        <Leerzustand
          icon="🏢"
          titel="Noch keine Geschäftskunden"
          text="Legen Sie oben Ihren ersten Geschäftskunden aus den Kontakten an. Danach Preisliste wählen, Kauf auf Rechnung festlegen und den persönlichen Link schicken."
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={S.tabelle}>
            <thead><tr>
              <th style={S.th}>Kunde</th><th style={S.th}>Preisliste</th><th style={S.th}>Zahlung</th>
              <th style={S.th}>Kreditrahmen</th><th style={S.th}>Link</th><th style={S.th}>Zuletzt im Shop</th><th style={S.th}></th>
            </tr></thead>
            <tbody>
              {kunden.map((k) => {
                const kt = kontakte[k.kontakt_id];
                return (
                  <tr key={k.id} style={{ opacity: k.aktiv ? 1 : 0.55 }}>
                    <td style={S.td}><b>{kundeName(kt)}</b>{!k.aktiv && <span style={S.marke}>pausiert</span>}{kt?.email ? <div style={{ color: C.textDim, fontSize: 13 }}>{kt.email}</div> : null}</td>
                    <td style={S.td}>{k.preisliste_id ? listeName[k.preisliste_id] ?? "—" : <span style={{ color: C.textDim }}>Standardpreise</span>}</td>
                    <td style={S.td}>{k.auf_rechnung ? `Auf Rechnung · ${k.zahlungsziel_tage} Tage` : "Vorkasse"}</td>
                    <td style={S.td}>{k.kreditrahmen_cent ? centText(k.kreditrahmen_cent) : "—"}</td>
                    <td style={S.td}>{k.token_hash ? <span style={{ color: C.green }}>aktiv seit {datum(k.link_erstellt_am)}</span> : <span style={{ color: C.warn }}>kein Link</span>}</td>
                    <td style={S.td}>{datum(k.zuletzt_da_am)}</td>
                    <td style={S.td}><button style={S.knopfKlein} onClick={() => setOffen(offen === k.id ? null : k.id)}>{offen === k.id ? "Schließen" : istChef ? "Bearbeiten" : "Ansehen"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {kunden.filter((k) => k.id === offen).map((k) => (
        <KundeBearbeiten key={k.id} kunde={k} name={kundeName(kontakte[k.kontakt_id])} listen={listen} istChef={istChef} busy={busy}
          link={link?.kunde === k.id ? link.link : null}
          onLink={(s) => linkErzeugen(k, s)} onSperren={() => linkSperren(k)} onLoeschen={() => loeschen(k)}
          onGespeichert={async () => { setMeldung("Gespeichert."); await onNeu(); }} />
      ))}
    </div>
  );
}

function KundeBearbeiten({ kunde, name, listen, istChef, busy, link, onLink, onSperren, onLoeschen, onGespeichert }: {
  kunde: Kunde; name: string; listen: Liste[]; istChef: boolean; busy: boolean; link: string | null;
  onLink: (senden: boolean) => void; onSperren: () => void; onLoeschen: () => void; onGespeichert: () => Promise<void>;
}) {
  const [liste, setListe] = useState(kunde.preisliste_id ?? "");
  const [aufRechnung, setAufRechnung] = useState(kunde.auf_rechnung);
  const [ziel, setZiel] = useState(String(kunde.zahlungsziel_tage));
  const [rahmen, setRahmen] = useState(kunde.kreditrahmen_cent ? zahlFeld(kunde.kreditrahmen_cent / 100) : "");
  const [aktiv, setAktiv] = useState(kunde.aktiv);
  const [notiz, setNotiz] = useState(kunde.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  async function speichern() {
    setFehler(null);
    const z = zahlAusFeld(ziel);
    if (!Number.isInteger(z) || z < 0 || z > 90 || zahlungsziel(z) !== z) { setFehler("Zahlungsziel: ganze Tage von 0 bis 90."); return; }
    let rahmenCent: number | null = null;
    if (rahmen.trim()) {
      const r = zahlAusFeld(rahmen);
      if (!(r > 0) || r > 20000000) { setFehler("Kreditrahmen: Betrag über 0 € oder leer lassen (= ohne Grenze)."); return; }
      rahmenCent = inCent(r) > 0 ? inCent(r) : null;
    }
    const { data, error } = await supabase.from("shop_kunde").update({
      preisliste_id: liste || null, auf_rechnung: aufRechnung, zahlungsziel_tage: z,
      kreditrahmen_cent: rahmenCent, aktiv, notiz: notiz.trim() ? notiz.trim().slice(0, 500) : null,
    }).eq("id", kunde.id).select("id");
    if (error || !data?.length) { setFehler("Speichern hat nicht geklappt."); return; }
    await onGespeichert();
  }

  return (
    <div style={{ ...S.karte, marginTop: 14, borderColor: C.gold }}>
      <h3 style={{ margin: "0 0 10px" }}>{name}</h3>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      <div style={S.raster}>
        <label style={S.label}>Preisliste
          <select style={S.input} value={liste} disabled={!istChef} onChange={(e) => setListe(e.target.value)}>
            <option value="">Standardpreise (keine Liste)</option>
            {listen.map((l) => <option key={l.id} value={l.id}>{l.name}{Number(l.rabatt_prozent) > 0 ? ` · ${zahlFeld(l.rabatt_prozent)} % Rabatt` : ""}</option>)}
          </select>
        </label>
        <label style={S.label}>Zahlungsziel (Tage)
          <input style={S.input} inputMode="numeric" value={ziel} disabled={!istChef} onChange={(e) => setZiel(e.target.value)} />
        </label>
        <label style={S.label}>Kreditrahmen brutto in € (leer = ohne Grenze)
          <input style={S.input} inputMode="decimal" value={rahmen} disabled={!istChef} placeholder="z. B. 5.000,00" onChange={(e) => setRahmen(e.target.value)} />
        </label>
      </div>
      <label style={S.haken}><input type="checkbox" checked={aufRechnung} disabled={!istChef} onChange={(e) => setAufRechnung(e.target.checked)} /> Kauf auf Rechnung erlauben (sonst Vorkasse)</label>
      <label style={S.haken}><input type="checkbox" checked={aktiv} disabled={!istChef} onChange={(e) => setAktiv(e.target.checked)} /> Aktiv (pausiert = Link wirkt nicht, Kunde sieht Standardpreise)</label>
      <label style={S.label}>Interne Notiz
        <input style={S.input} value={notiz} maxLength={500} disabled={!istChef} onChange={(e) => setNotiz(e.target.value)} />
      </label>
      {aufRechnung && kunde.kreditrahmen_cent == null && !rahmen.trim() && (
        <div style={{ color: C.warn, fontSize: 13, marginTop: 6 }}>Hinweis: ohne Kreditrahmen kann der Kunde unbegrenzt auf Rechnung bestellen.</div>
      )}
      {istChef && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button style={S.knopfGold} onClick={speichern} disabled={busy}>💾 Speichern</button>
          <button style={S.knopf} onClick={() => onLink(true)} disabled={busy || !kunde.aktiv}>✉️ {kunde.token_hash ? "Neuen Link per E-Mail senden" : "Link per E-Mail senden"}</button>
          <button style={S.knopf} onClick={() => onLink(false)} disabled={busy || !kunde.aktiv}>🔗 {kunde.token_hash ? "Neuen Link nur anzeigen" : "Link nur anzeigen"}</button>
          {kunde.token_hash && <button style={S.knopf} onClick={onSperren} disabled={busy}>⛔ Link sperren</button>}
          <button style={{ ...S.knopf, color: C.danger, borderColor: C.danger }} onClick={onLoeschen} disabled={busy}>Entfernen</button>
        </div>
      )}
      {link && (
        <div style={{ ...S.hinweis, marginTop: 12, borderColor: C.green }}>
          <div style={{ marginBottom: 6 }}>Persönlicher Link (wird nur jetzt angezeigt):</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <code style={{ wordBreak: "break-all", background: "rgba(0,0,0,0.3)", padding: "6px 8px", borderRadius: 6, flex: "1 1 260px" }}>{link}</code>
            <button style={S.knopf} onClick={async () => { try { await navigator.clipboard.writeText(link); setKopiert(true); } catch { setKopiert(false); } }}>{kopiert ? "✓ Kopiert" : "📋 Kopieren"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------- Preislisten ---
function ListenTeil({ listen, preise, artikel, basis, istChef, onNeu, setMeldung }: {
  listen: Liste[]; preise: Preis[]; artikel: Artikel[]; basis: PreisBasis; istChef: boolean;
  onNeu: () => Promise<void>; setMeldung: (s: string | null) => void;
}) {
  const [aktiv, setAktiv] = useState<string | null>(listen[0]?.id ?? null);
  const [neuName, setNeuName] = useState("");
  const [neuRabatt, setNeuRabatt] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [art, setArt] = useState("");
  const [ab, setAb] = useState("1");
  const [netto, setNetto] = useState("");
  const [suche, setSuche] = useState("");

  const liste = listen.find((l) => l.id === aktiv) ?? null;
  const listePreise = useMemo(() => preise.filter((p) => p.preisliste_id === aktiv), [preise, aktiv]);
  const artName = useMemo(() => Object.fromEntries(artikel.map((a) => [a.id, a])), [artikel]);

  async function listeAnlegen() {
    setFehler(null);
    const name = neuName.trim();
    if (!name || name.length > 80) { setFehler("Bitte einen Namen (bis 80 Zeichen) eingeben."); return; }
    const r = neuRabatt.trim() ? zahlAusFeld(neuRabatt) : 0;
    if (!(r >= 0 && r <= 90)) { setFehler("Rabatt: 0 bis 90 %."); return; }
    const { data, error } = await supabase.from("shop_preisliste").insert({ name, rabatt_prozent: r }).select("id").single();
    if (error || !data) { setFehler(error?.code === "23505" ? "Eine Liste mit diesem Namen gibt es schon." : "Die Liste konnte nicht angelegt werden."); return; }
    setNeuName(""); setNeuRabatt(""); setAktiv((data as { id: string }).id);
    setMeldung(`Preisliste „${name}“ angelegt.`); await onNeu();
  }

  async function listeSpeichern(l: Liste, name: string, rabatt: string) {
    setFehler(null);
    const r = rabatt.trim() ? zahlAusFeld(rabatt) : 0;
    if (!name.trim() || !(r >= 0 && r <= 90)) { setFehler("Name nötig, Rabatt 0 bis 90 %."); return; }
    const { data, error } = await supabase.from("shop_preisliste").update({ name: name.trim().slice(0, 80), rabatt_prozent: r }).eq("id", l.id).select("id");
    if (error || !data?.length) { setFehler(error?.code === "23505" ? "Eine Liste mit diesem Namen gibt es schon." : "Speichern hat nicht geklappt."); return; }
    setMeldung("Preisliste gespeichert."); await onNeu();
  }

  async function listeLoeschen(l: Liste) {
    if (!window.confirm(`Preisliste „${l.name}“ mit allen Preisen löschen? Kunden mit dieser Liste bekommen wieder die Standardpreise.`)) return;
    const { data, error } = await supabase.from("shop_preisliste").delete().eq("id", l.id).select("id");
    if (error || !data?.length) { setFehler("Die Liste konnte nicht gelöscht werden."); return; }
    setAktiv(null); setMeldung("Preisliste gelöscht."); await onNeu();
  }

  async function preisAnlegen() {
    setFehler(null);
    if (!liste) return;
    if (!art) { setFehler("Bitte einen Artikel wählen."); return; }
    const p = preisZeilePruefen({ ab_menge: ab, netto });
    if (!p.ok) { setFehler(p.fehler); return; }
    const { error } = await supabase.from("shop_preis").upsert(
      { preisliste_id: liste.id, artikel_id: art, ab_menge: p.ab_menge, netto_cent: p.netto_cent },
      { onConflict: "preisliste_id,artikel_id,ab_menge" });
    if (error) { setFehler("Der Preis konnte nicht gespeichert werden."); return; }
    setNetto(""); setAb("1"); setMeldung("Preis gespeichert."); await onNeu();
  }

  async function preisLoeschen(p: Preis) {
    const { data, error } = await supabase.from("shop_preis").delete().eq("id", p.id).select("id");
    if (error || !data?.length) { setFehler("Der Preis konnte nicht gelöscht werden."); return; }
    await onNeu();
  }

  const nachArtikel = useMemo(() => {
    const m = new Map<string, Preis[]>();
    for (const p of listePreise) { const a = m.get(p.artikel_id) ?? []; a.push(p); m.set(p.artikel_id, a); }
    const s = suche.trim().toLowerCase();
    return Array.from(m.entries())
      .filter(([id]) => !s || `${artName[id]?.bezeichnung ?? ""} ${artName[id]?.artikelnummer ?? ""}`.toLowerCase().includes(s))
      .sort((a, b) => (artName[a[0]]?.bezeichnung ?? "").localeCompare(artName[b[0]]?.bezeichnung ?? "", "de"));
  }, [listePreise, artName, suche]);

  const listeObj: Preisliste | null = liste ? { rabatt_prozent: Number(liste.rabatt_prozent) || 0, preise: listePreise } : null;

  return (
    <div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {listen.map((l) => (
          <button key={l.id} style={{ ...S.knopf, ...(l.id === aktiv ? { borderColor: C.gold, color: C.gold } : {}) }} onClick={() => setAktiv(l.id)}>{l.name}</button>
        ))}
      </div>
      {istChef && (
        <div style={S.karte}>
          <b>＋ Neue Preisliste</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <input style={{ ...S.input, maxWidth: 260 }} placeholder="Name, z. B. Händler A" value={neuName} maxLength={80} onChange={(e) => setNeuName(e.target.value)} />
            <input style={{ ...S.input, maxWidth: 180 }} placeholder="Rabatt % (optional)" inputMode="decimal" value={neuRabatt} onChange={(e) => setNeuRabatt(e.target.value)} />
            <button style={S.knopfGold} onClick={listeAnlegen}>Anlegen</button>
          </div>
          <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Der Rabatt gilt für alle Artikel ohne festen Preis in der Liste. Ein fester Preis geht immer vor — Rabatt und fester Preis werden nie zusammengerechnet.</div>
        </div>
      )}

      {listen.length === 0 ? (
        <Leerzustand icon="💶" titel="Noch keine Preislisten" text="Legen Sie eine Preisliste an, z. B. „Händler“ mit 10 % Rabatt, und tragen Sie für einzelne Artikel feste Netto-Preise und Staffeln ein." />
      ) : !liste ? (
        <div style={{ color: C.textDim }}>Bitte oben eine Preisliste wählen.</div>
      ) : (
        <div style={{ ...S.karte, marginTop: 12 }}>
          <ListeKopf key={liste.id} liste={liste} istChef={istChef} onSpeichern={listeSpeichern} onLoeschen={listeLoeschen} />
          {istChef && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0", alignItems: "flex-end" }}>
              <label style={{ ...S.label, flex: "2 1 240px" }}>Artikel (im Shop)
                <select style={S.input} value={art} onChange={(e) => setArt(e.target.value)}>
                  <option value="">— wählen —</option>
                  {artikel.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}{a.artikelnummer ? ` (${a.artikelnummer})` : ""}</option>)}
                </select>
              </label>
              <label style={{ ...S.label, flex: "0 1 110px" }}>Ab Menge
                <input style={S.input} inputMode="numeric" value={ab} onChange={(e) => setAb(e.target.value)} />
              </label>
              <label style={{ ...S.label, flex: "0 1 150px" }}>Netto je Stück €
                <input style={S.input} inputMode="decimal" value={netto} placeholder="0,00" onChange={(e) => setNetto(e.target.value)} />
              </label>
              <button style={S.knopfGold} onClick={preisAnlegen}>Preis speichern</button>
            </div>
          )}
          {artikel.length === 0 && <div style={{ color: C.warn }}>Noch keine Artikel im Shop. Artikel übernehmen Sie unter „Produkte in den Shop“.</div>}
          {listePreise.length > 0 && (
            <input style={{ ...S.input, maxWidth: 320, marginBottom: 8 }} placeholder="In der Liste suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
          )}
          {nachArtikel.length === 0 ? (
            <div style={{ color: C.textDim }}>Noch keine festen Preise in dieser Liste{Number(liste.rabatt_prozent) > 0 ? ` — es gilt der Rabatt von ${zahlFeld(liste.rabatt_prozent)} % auf alle Artikel.` : "."}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.tabelle}>
                <thead><tr><th style={S.th}>Artikel</th><th style={S.th}>Standard netto</th><th style={S.th}>Staffeln netto</th><th style={S.th}>So sieht der Kunde</th></tr></thead>
                <tbody>
                  {nachArtikel.map(([id, ps]) => {
                    const a = artName[id];
                    const satz = Number(a?.shop_mwst ?? 19);
                    const bn = a ? basisNettoCent(a.verkaufspreis, satz === 7 || satz === 0 ? satz : 19, basis) : null;
                    const regel = mengenRegel(a?.shop_gebinde, a?.shop_mindestmenge);
                    const sicht = schaufensterStaffeln(id, bn, regel.mindest, listeObj);
                    return (
                      <tr key={id}>
                        <td style={S.td}><b>{a?.bezeichnung ?? "Artikel nicht mehr im Shop"}</b>{a?.artikelnummer ? <div style={{ color: C.textDim, fontSize: 13 }}>{a.artikelnummer}</div> : null}</td>
                        <td style={S.td}>{bn ? centText(bn) : "—"}</td>
                        <td style={S.td}>
                          {ps.slice().sort((x, y) => x.ab_menge - y.ab_menge).map((p) => (
                            <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span>ab {p.ab_menge.toLocaleString("de-DE")}: <b>{centText(p.netto_cent)}</b></span>
                              {istChef && <button style={S.knopfMini} aria-label="Staffel löschen" onClick={() => preisLoeschen(p)}>✕</button>}
                            </div>
                          ))}
                        </td>
                        <td style={S.td}>{sicht.map((s) => <div key={s.ab}>ab {s.ab.toLocaleString("de-DE")}: {centText(s.netto_cent)}</div>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ListeKopf({ liste, istChef, onSpeichern, onLoeschen }: {
  liste: Liste; istChef: boolean; onSpeichern: (l: Liste, name: string, rabatt: string) => void; onLoeschen: (l: Liste) => void;
}) {
  const [name, setName] = useState(liste.name);
  const [rabatt, setRabatt] = useState(Number(liste.rabatt_prozent) ? zahlFeld(liste.rabatt_prozent) : "");
  if (!istChef) return <h3 style={{ margin: 0 }}>{liste.name}{Number(liste.rabatt_prozent) > 0 ? ` · ${zahlFeld(liste.rabatt_prozent)} % Rabatt` : ""}</h3>;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ ...S.label, flex: "1 1 220px" }}>Name<input style={S.input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <label style={{ ...S.label, flex: "0 1 160px" }}>Rabatt % auf Standard<input style={S.input} inputMode="decimal" value={rabatt} onChange={(e) => setRabatt(e.target.value)} /></label>
      <button style={S.knopf} onClick={() => onSpeichern(liste, name, rabatt)}>💾 Speichern</button>
      <button style={{ ...S.knopf, color: C.danger, borderColor: C.danger }} onClick={() => onLoeschen(liste)}>Liste löschen</button>
    </div>
  );
}

// ------------------------------------------------------------- Mengen ---
function MengenTeil({ artikel, istChef, onNeu, setMeldung }: {
  artikel: Artikel[]; istChef: boolean; onNeu: () => Promise<void>; setMeldung: (s: string | null) => void;
}) {
  const [werte, setWerte] = useState<Record<string, { g: string; m: string }>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState("");

  const wert = (a: Artikel) => werte[a.id] ?? { g: String(a.shop_gebinde ?? 1), m: String(a.shop_mindestmenge ?? 1) };

  async function speichern(a: Artikel) {
    setFehler(null);
    const w = wert(a);
    const p = regelEingabePruefen(w.g, w.m);
    if (!p.ok) { setFehler(`${a.bezeichnung}: ${p.fehler}`); return; }
    const { data, error } = await supabase.from("artikel").update({ shop_gebinde: p.gebinde, shop_mindestmenge: p.mindest }).eq("id", a.id).select("id");
    if (error || !data?.length) { setFehler(`${a.bezeichnung}: Speichern hat nicht geklappt. Läuft das SQL zu Paket 316 schon?`); return; }
    setWerte((x) => { const n = { ...x }; delete n[a.id]; return n; });
    setMeldung(`${a.bezeichnung}: Gebinde ${p.gebinde}, Mindestmenge ${p.mindest}.`); await onNeu();
  }

  const s = suche.trim().toLowerCase();
  const sicht = artikel.filter((a) => !s || `${a.bezeichnung} ${a.artikelnummer ?? ""}`.toLowerCase().includes(s));

  if (!artikel.length) return <Leerzustand icon="📦" titel="Noch keine Artikel im Shop" text="Übernehmen Sie zuerst Artikel unter „Produkte in den Shop“. Danach legen Sie hier Gebinde und Mindestmenge fest." />;
  return (
    <div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      <p style={{ color: C.textDim, marginTop: 0 }}>
        Gebinde = der Artikel ist nur in Vielfachen bestellbar (z. B. 6er-Karton). Mindestmenge = kleinste Bestellmenge, immer ein Vielfaches des Gebindes.
        Gilt für alle Käufer im Shop. Standard 1 und 1 = keine Einschränkung.
      </p>
      <input style={{ ...S.input, maxWidth: 320, marginBottom: 8 }} placeholder="Artikel suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div style={{ overflowX: "auto" }}>
        <table style={S.tabelle}>
          <thead><tr><th style={S.th}>Artikel</th><th style={S.th}>Gebinde</th><th style={S.th}>Mindestmenge</th><th style={S.th}></th></tr></thead>
          <tbody>
            {sicht.map((a) => {
              const w = wert(a);
              const geaendert = !!werte[a.id];
              return (
                <tr key={a.id}>
                  <td style={S.td}><b>{a.bezeichnung}</b>{a.einheit ? <span style={{ color: C.textDim }}> · {a.einheit}</span> : null}</td>
                  <td style={S.td}><input style={{ ...S.input, width: 90 }} inputMode="numeric" disabled={!istChef} value={w.g} onChange={(e) => setWerte((x) => ({ ...x, [a.id]: { ...w, g: e.target.value } }))} aria-label={`Gebinde ${a.bezeichnung}`} /></td>
                  <td style={S.td}><input style={{ ...S.input, width: 90 }} inputMode="numeric" disabled={!istChef} value={w.m} onChange={(e) => setWerte((x) => ({ ...x, [a.id]: { ...w, m: e.target.value } }))} aria-label={`Mindestmenge ${a.bezeichnung}`} /></td>
                  <td style={S.td}>{istChef && geaendert && <button style={S.knopfGold} onClick={() => speichern(a)}>Speichern</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- Preis-Basis ---
function BasisTeil({ basis, istChef, uid, onGespeichert }: { basis: PreisBasis; istChef: boolean; uid: string | null; onGespeichert: (b: PreisBasis) => void }) {
  const [wahl, setWahl] = useState<PreisBasis>(basis);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    if (!uid) return;
    setFehler(null);
    const r0 = await supabase.from("modul_einstellung").select("einstellung").eq("owner_user_id", uid).eq("modul", SHOP_B2B_MODUL).maybeSingle();
    const alt = ((r0.data as { einstellung?: Record<string, unknown> } | null)?.einstellung) ?? {};
    const { error } = await supabase.from("modul_einstellung").upsert(
      { owner_user_id: uid, modul: SHOP_B2B_MODUL, einstellung: { ...alt, preisbasis: wahl }, aktualisiert_am: new Date().toISOString() },
      { onConflict: "owner_user_id,modul" });
    if (error) { setFehler("Speichern hat nicht geklappt."); return; }
    onGespeichert(wahl);
  }

  return (
    <div style={S.karte}>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      <h3 style={{ marginTop: 0 }}>Was steht im Artikelstamm als Verkaufspreis?</h3>
      <p style={{ color: C.textDim, marginTop: 0 }}>
        Der Shop zeigt Privatkunden Brutto-Preise und Geschäftskunden Netto-Preise. Dafür muss ARGONAUT wissen, ob Ihr Verkaufspreis unter ERP/Lager brutto oder netto eingetragen ist.
        Wer Artikel per BMEcat oder Datanorm eingelesen hat, hat dort meist Netto-Preise.
      </p>
      <label style={S.haken}><input type="radio" name="basis" checked={wahl === "brutto"} disabled={!istChef} onChange={() => setWahl("brutto")} /> Brutto (inkl. MwSt) — so rechnet der Shop bisher</label>
      <label style={S.haken}><input type="radio" name="basis" checked={wahl === "netto"} disabled={!istChef} onChange={() => setWahl("netto")} /> Netto (zzgl. MwSt)</label>
      {istChef && <button style={{ ...S.knopfGold, marginTop: 10 }} disabled={wahl === basis} onClick={speichern}>💾 Speichern</button>}
      <div style={{ color: C.textDim, fontSize: 13, marginTop: 10 }}>Beispiel bei 19 %: Verkaufspreis 11,90 → als Brutto gelesen sind das 10,00 netto, als Netto gelesen 14,16 brutto.</div>
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
  zeile: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", background: "rgba(255,255,255,0.03)", padding: "8px 10px", borderRadius: 8 },
  input: { width: "100%", boxSizing: "border-box", background: C.navy, color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 15 },
  label: { display: "flex", flexDirection: "column", gap: 4, color: C.textDim, fontSize: 13, marginTop: 8 },
  haken: { display: "flex", gap: 8, alignItems: "center", marginTop: 10 },
  raster: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 },
  knopf: { background: "transparent", color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 14 },
  knopfGold: { background: C.gold, color: C.navy, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontWeight: 700, fontSize: 14 },
  knopfKlein: { background: "transparent", color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13 },
  knopfMini: { background: "transparent", color: C.danger, border: "none", cursor: "pointer", fontSize: 13, padding: 2 },
  marke: { marginLeft: 8, fontSize: 12, color: C.warn, border: `1px solid ${C.warn}`, borderRadius: 6, padding: "1px 6px" },
  tabelle: { width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 },
  th: { textAlign: "left", color: C.textDim, fontWeight: 600, padding: "8px 10px", borderBottom: `1px solid ${C.border}` },
  td: { padding: "10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" },
};
