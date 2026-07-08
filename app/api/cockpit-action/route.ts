// app/api/cockpit-action/route.ts
// ============================================================
// ARGONAUT OS · Chef-Cockpit · Etappe 3: Internes Handeln (Executor / "die Haende")
// Fuehrt EINMALIGE, vom Chef bereits bestaetigte Aktionen aus:
//   - aufgabe_anlegen  -> Tabelle "aufgaben" (Default-Projekt "Interne Aufgaben")
//        NEU: mehrere Aufgaben in einem Befehl; Empfaenger je Aufgabe = eine Person,
//        eine ganze Abteilung (-> pro Person eine Aufgabe) oder alle Mitarbeiter.
//   - team_nachricht   -> Tabelle "chat_nachrichten" (erscheint als der Chef, NICHT als KI)
//   - wiedervorlage    -> Tabelle "kontakte" (naechster_kontakt_am) + Aktivitaets-Log
//
// SICHERHEIT: Namen werden serverseitig aufgeloest. Bei Unklarheit wird die
// betroffene Aufgabe NICHT falsch zugewiesen, sondern als Hinweis gemeldet.
// Alles owner-gescoped. Keine Dauer-Regeln, nur Einmal-Aktionen.
//
// Body:    { aktion: { typ, ... } }
// Antwort: { ok: true,  meldung: string }
//     oder { ok: false, meldung?: string, rueckfrage?: string, optionen?: string[] }
// ============================================================
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PROJEKT_DEFAULT = "Interne Aufgaben";
const MAX_AUFGABEN = 100; // Sicherheitslimit gegen versehentliche Massen-Anlage
const INAKTIV_STATUS = ["inaktiv", "ausgeschieden", "archiviert", "gekuendigt"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const aktion = body?.aktion;
    if (!aktion || typeof aktion.typ !== "string") {
      return NextResponse.json({ ok: false, meldung: "Keine gueltige Aktion uebergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, meldung: "Nicht eingeloggt." }, { status: 401 });
    }

    switch (aktion.typ) {
      case "aufgabe_anlegen":
        return await aufgabeAnlegen(supabase, user.id, aktion);
      case "team_nachricht":
        return await teamNachricht(supabase, user.id, aktion);
      case "wiedervorlage":
        return await wiedervorlage(supabase, user.id, aktion);
      default:
        return NextResponse.json({ ok: false, meldung: "Unbekannte Aktion." }, { status: 400 });
    }
  } catch (err: any) {
    console.error("Cockpit-Action Fehler:", err);
    return NextResponse.json({ ok: false, meldung: "Interner Fehler bei der Ausfuehrung." }, { status: 500 });
  }
}

// ============================================================
// Aktion 1: Aufgabe(n) anlegen — einzeln, mehrere, an Person / Abteilung / alle
// ============================================================
async function aufgabeAnlegen(supabase: any, ownerId: string, a: any) {
  // Aufgabenliste ermitteln: neu = Array "aufgaben"; alt = flache Einzelfelder (rueckwaertskompatibel)
  let liste: any[] = Array.isArray(a?.aufgaben) ? a.aufgaben : [{
    titel: a?.titel, beschreibung: a?.beschreibung, prioritaet: a?.prioritaet,
    faellig_am: a?.faellig_am, mitarbeiter_name: a?.mitarbeiter_name,
    abteilung: a?.abteilung, an_alle: a?.an_alle,
  }];
  liste = liste.filter((t) => t && (t.titel || "").toString().trim());
  if (liste.length === 0) return NextResponse.json({ ok: false, meldung: "Der Aufgabe fehlt ein Titel." });

  const projektId = await ensureDefaultProjekt(supabase, ownerId);
  if (!projektId) return NextResponse.json({ ok: false, meldung: "Das Sammelprojekt konnte nicht angelegt werden." });

  const rows: any[] = [];
  const berichte: string[] = [];
  const hinweise: string[] = [];
  let limitHit = false;

  for (const t of liste) {
    if (limitHit) break;
    const titel = (t.titel || "").toString().trim();

    const basis: any = {
      owner_user_id: ownerId,
      projekt_id: projektId,
      titel,
      status: "todo",
      prioritaet: erlaubtePrio(t.prioritaet),
    };
    if (t.beschreibung) basis.beschreibung = t.beschreibung.toString().trim();
    if (t.faellig_am && /^\d{4}-\d{2}-\d{2}$/.test(t.faellig_am)) basis.faellig_am = t.faellig_am;
    const bis = basis.faellig_am ? ` (bis ${datumHuebsch(basis.faellig_am)})` : "";

    // Empfaenger bestimmen -> Liste von { id, name }
    let empfaenger: { id: string; name: string }[] = [];
    let zielText = "";

    if (t.an_alle === true) {
      empfaenger = await alleMitarbeiter(supabase, ownerId);
      zielText = `alle (${empfaenger.length})`;
      if (empfaenger.length === 0) hinweise.push(`"${titel}": keine Mitarbeiter gefunden — ohne Zuweisung angelegt.`);
    } else if ((t.abteilung || "").toString().trim()) {
      const abt = t.abteilung.toString().trim();
      empfaenger = await mitarbeiterDerAbteilung(supabase, ownerId, abt);
      zielText = `Abteilung ${abt} (${empfaenger.length})`;
      if (empfaenger.length === 0) hinweise.push(`"${titel}": in Abteilung "${abt}" wurde niemand gefunden — ohne Zuweisung angelegt.`);
    } else if ((t.mitarbeiter_name || "").toString().trim()) {
      const r = await findeMitarbeiter(supabase, ownerId, t.mitarbeiter_name);
      if (r.status === "einer") { empfaenger = [{ id: r.id!, name: r.name! }]; zielText = r.name!; }
      else if (r.status === "mehrere") hinweise.push(`"${titel}": mehrere Treffer fuer "${t.mitarbeiter_name}" (${(r.optionen || []).join(", ")}) — ohne Zuweisung angelegt.`);
      else hinweise.push(`"${titel}": Mitarbeiter "${t.mitarbeiter_name}" nicht gefunden — ohne Zuweisung angelegt.`);
    }

    if (empfaenger.length === 0) {
      // ohne Zuweisung: genau eine Aufgabe
      rows.push({ ...basis });
      berichte.push(`${titel}${zielText ? " (" + zielText + ")" : ""}${bis}`);
    } else {
      let angelegt = 0;
      for (const e of empfaenger) {
        if (rows.length >= MAX_AUFGABEN) { limitHit = true; break; }
        rows.push({ ...basis, mitarbeiter_id: e.id });
        angelegt++;
      }
      const wer = zielText || empfaenger.map((e) => e.name).join(", ");
      berichte.push(`${titel} -> ${wer}${bis}`);
      void angelegt;
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, meldung: "Es konnte keine Aufgabe angelegt werden. " + hinweise.join(" ") });
  }

  const { error } = await supabase.from("aufgaben").insert(rows);
  if (error) { console.error(error); return NextResponse.json({ ok: false, meldung: "Die Aufgabe(n) konnten nicht gespeichert werden." }); }

  let meldung = `${rows.length} Aufgabe${rows.length === 1 ? "" : "n"} angelegt: ${berichte.join("; ")}.`;
  if (limitHit) meldung += ` (Sicherheitslimit von ${MAX_AUFGABEN} erreicht — Rest nicht angelegt.)`;
  if (hinweise.length) meldung += " Hinweis: " + hinweise.join(" ");
  return NextResponse.json({ ok: true, meldung });
}

// ============================================================
// Aktion 2: Team-Nachricht (erscheint als der Chef, nicht als KI)
// ============================================================
async function teamNachricht(supabase: any, ownerId: string, a: any) {
  const text = (a?.text || "").toString().trim();
  if (!text) return NextResponse.json({ ok: false, meldung: "Der Nachricht fehlt ein Text." });

  const { data: kanaele } = await supabase
    .from("chat_kanaele")
    .select("id,name,firma_id")
    .eq("erstellt_von", ownerId)
    .order("created_at", { ascending: true });
  const liste = Array.isArray(kanaele) ? kanaele : [];
  if (liste.length === 0) {
    return NextResponse.json({ ok: false, rueckfrage: "Ich habe keinen Team-Kanal gefunden, in den ich schreiben kann. Bitte lege zuerst im Team-Chat einen Kanal an." });
  }

  let kanal = liste[0];
  const wunschKanal = (a?.kanal_name || "").toString().trim();
  if (wunschKanal) {
    const suche = wunschKanal.toLowerCase();
    const m = liste.filter((k: any) => (k.name || "").toLowerCase().includes(suche));
    if (m.length === 0) {
      return NextResponse.json({ ok: false, rueckfrage: `Ich habe keinen Kanal "${wunschKanal}" gefunden. Verfuegbare Kanaele:`, optionen: liste.map((k: any) => k.name) });
    }
    if (m.length > 1) {
      return NextResponse.json({ ok: false, rueckfrage: `Mehrere Kanaele passen zu "${wunschKanal}". Welchen meinst du?`, optionen: m.map((k: any) => k.name) });
    }
    kanal = m[0];
  }

  const absenderName = (a?.absender_name || "").toString().trim() || "Chef";
  const { error } = await supabase.from("chat_nachrichten").insert({
    kanal_id: kanal.id,
    absender_id: ownerId,
    absender_name: absenderName,
    ist_ki: false,
    text,
    firma_id: kanal.firma_id ?? null,
  });
  if (error) { console.error(error); return NextResponse.json({ ok: false, meldung: "Die Nachricht konnte nicht gesendet werden." }); }
  return NextResponse.json({ ok: true, meldung: `Nachricht im Kanal "${kanal.name}" gesendet.` });
}

// ============================================================
// Aktion 3: Wiedervorlage fuer Kontakt
// ============================================================
async function wiedervorlage(supabase: any, ownerId: string, a: any) {
  const wunschKontakt = (a?.kontakt_name || "").toString().trim();
  const datum = (a?.datum || "").toString().trim();
  if (!wunschKontakt) return NextResponse.json({ ok: false, meldung: "Es fehlt der Name des Kontakts." });
  if (!/^\d{4}-\d{2}-\d{2}/.test(datum)) return NextResponse.json({ ok: false, meldung: "Es fehlt ein gueltiges Datum fuer die Wiedervorlage." });

  const tokens = tokenize(wunschKontakt);
  if (tokens.length === 0) return NextResponse.json({ ok: false, meldung: "Es fehlt der Name des Kontakts." });

  const orParts = tokens.flatMap((t) => [`nachname.ilike.%${t}%`, `vorname.ilike.%${t}%`, `firma.ilike.%${t}%`]);
  const { data: kontakte } = await supabase
    .from("kontakte")
    .select("id,vorname,nachname,firma")
    .eq("owner_user_id", ownerId)
    .or(orParts.join(","))
    .limit(20);
  const liste = Array.isArray(kontakte) ? kontakte : [];
  const label = (k: any) => [`${k.vorname || ""} ${k.nachname || ""}`.trim(), k.firma ? `(${k.firma})` : ""].filter(Boolean).join(" ");
  const heu = (k: any) => `${(k.vorname || "").toLowerCase()} ${(k.nachname || "").toLowerCase()} ${(k.firma || "").toLowerCase()}`;
  const score = (k: any) => tokens.filter((t) => heu(k).includes(t)).length;

  if (liste.length === 0) return NextResponse.json({ ok: false, rueckfrage: `Ich habe keinen Kontakt "${wunschKontakt}" gefunden. Wen genau meinst du?` });

  let kandidaten = liste.filter((k: any) => score(k) === tokens.length);
  if (kandidaten.length === 0) kandidaten = liste;
  if (kandidaten.length > 1) {
    return NextResponse.json({ ok: false, rueckfrage: `Es passen mehrere Kontakte zu "${wunschKontakt}". Welchen meinst du?`, optionen: kandidaten.map(label) });
  }
  const kontakt = kandidaten[0];

  const datumIso = datum.length === 10 ? datum + "T09:00:00" : datum;
  const { error: upErr } = await supabase
    .from("kontakte")
    .update({ naechster_kontakt_am: datumIso, updated_at: new Date().toISOString() })
    .eq("id", kontakt.id).eq("owner_user_id", ownerId);
  if (upErr) { console.error(upErr); return NextResponse.json({ ok: false, meldung: "Die Wiedervorlage konnte nicht gesetzt werden." }); }

  try {
    const notiz = (a?.notiz || "").toString().trim();
    await supabase.from("kontakt_aktivitaeten").insert({
      owner_user_id: ownerId,
      kontakt_id: kontakt.id,
      typ: "notiz",
      inhalt: notiz ? `Wiedervorlage (${datumHuebsch(datum)}): ${notiz}` : `Wiedervorlage gesetzt auf ${datumHuebsch(datum)}.`,
      ki_generiert: true,
    });
  } catch (e) { console.error("Aktivitaets-Log fehlgeschlagen (unkritisch):", e); }

  return NextResponse.json({ ok: true, meldung: `Wiedervorlage fuer ${label(kontakt)} auf ${datumHuebsch(datum)} gesetzt.` });
}

// ============================================================
// Helfer
// ============================================================

async function ensureDefaultProjekt(supabase: any, ownerId: string): Promise<string | null> {
  const { data: proj } = await supabase
    .from("projekte").select("id")
    .eq("owner_user_id", ownerId).eq("name", PROJEKT_DEFAULT)
    .maybeSingle();
  if (proj?.id) return proj.id;
  const { data: neu, error } = await supabase
    .from("projekte")
    .insert({
      owner_user_id: ownerId,
      name: PROJEKT_DEFAULT,
      beschreibung: "Sammelprojekt fuer Aufgaben aus dem Chef-Cockpit.",
      farbe: "#00e5ff",
    })
    .select("id").single();
  if (error) { console.error(error); return null; }
  return neu.id;
}

function istAktiv(status: any): boolean {
  return !INAKTIV_STATUS.includes((status || "aktiv").toString().toLowerCase());
}

async function alleMitarbeiter(supabase: any, ownerId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from("mitarbeiter")
    .select("id,vorname,nachname,status")
    .eq("owner_user_id", ownerId);
  const liste = Array.isArray(data) ? data : [];
  return liste
    .filter((m: any) => istAktiv(m.status))
    .map((m: any) => ({ id: m.id, name: `${m.vorname || ""} ${m.nachname || ""}`.trim() }));
}

async function mitarbeiterDerAbteilung(supabase: any, ownerId: string, abteilung: string): Promise<{ id: string; name: string }[]> {
  const safe = abteilung.replace(/[,()%*]/g, " ").trim();
  const { data } = await supabase
    .from("mitarbeiter")
    .select("id,vorname,nachname,status,abteilung")
    .eq("owner_user_id", ownerId)
    .ilike("abteilung", `%${safe}%`);
  const liste = Array.isArray(data) ? data : [];
  return liste
    .filter((m: any) => istAktiv(m.status))
    .map((m: any) => ({ id: m.id, name: `${m.vorname || ""} ${m.nachname || ""}`.trim() }));
}

function tokenize(s: string): string[] {
  const stop = new Set(["herr", "herrn", "frau", "dem", "den", "der", "die", "das", "und", "fuer", "für", "von", "zum", "zur", "an"]);
  return (s || "")
    .toLowerCase()
    .replace(/[,()%*]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !stop.has(t));
}

async function findeMitarbeiter(
  supabase: any,
  ownerId: string,
  name: string
): Promise<{ status: "einer" | "mehrere" | "keiner"; id?: string; name?: string; optionen?: string[] }> {
  const tokens = tokenize(name);
  if (tokens.length === 0) return { status: "keiner" };

  const orParts = tokens.flatMap((t) => [`vorname.ilike.%${t}%`, `nachname.ilike.%${t}%`]);
  const { data } = await supabase
    .from("mitarbeiter")
    .select("id,vorname,nachname")
    .eq("owner_user_id", ownerId)
    .or(orParts.join(","))
    .limit(20);
  const liste = Array.isArray(data) ? data : [];
  const voll = (m: any) => `${m.vorname || ""} ${m.nachname || ""}`.trim();
  const heu = (m: any) => `${(m.vorname || "").toLowerCase()} ${(m.nachname || "").toLowerCase()}`;
  const score = (m: any) => tokens.filter((t) => heu(m).includes(t)).length;

  if (liste.length === 0) return { status: "keiner" };
  let kandidaten = liste.filter((m: any) => score(m) === tokens.length);
  if (kandidaten.length === 0) kandidaten = liste;
  if (kandidaten.length === 1) return { status: "einer", id: kandidaten[0].id, name: voll(kandidaten[0]) };
  return { status: "mehrere", optionen: kandidaten.map(voll) };
}

function erlaubtePrio(v: any): string {
  const s = (v || "").toString().toLowerCase();
  if (["hoch", "high", "dringend", "wichtig", "eilig"].some((k) => s.includes(k))) return "hoch";
  if (["niedrig", "low", "gering"].some((k) => s.includes(k))) return "niedrig";
  return "normal";
}

function datumHuebsch(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
