// app/api/cockpit-action/route.ts
// ============================================================
// ARGONAUT OS · Chef-Cockpit · Etappe 3: Internes Handeln (Executor / "die Haende")
// Fuehrt EINMALIGE, vom Chef bereits bestaetigte Aktionen aus:
//   - aufgabe_anlegen  -> Tabelle "aufgaben"  (Default-Projekt "Interne Aufgaben")
//   - team_nachricht   -> Tabelle "chat_nachrichten" (erscheint als der Chef, NICHT als KI)
//   - wiedervorlage    -> Tabelle "kontakte" (naechster_kontakt_am) + Aktivitaets-Log
//
// SICHERHEIT: Alle Namen (Mitarbeiter, Kontakt, Kanal) werden SERVERSEITIG aufgeloest.
// Bei keinem oder mehreren Treffern wird NICHT geraten, sondern eine Rueckfrage
// zurueckgegeben. Alles ist owner-gescoped. Keine Dauer-Regeln, nur Einmal-Aktionen.
//
// Body:    { aktion: { typ: 'aufgabe_anlegen' | 'team_nachricht' | 'wiedervorlage', ... } }
// Antwort: { ok: true,  meldung: string }
//     oder { ok: false, meldung?: string, rueckfrage?: string, optionen?: string[] }
// ============================================================
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PROJEKT_DEFAULT = "Interne Aufgaben";

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
// Aktion 1: Aufgabe anlegen
// ============================================================
async function aufgabeAnlegen(supabase: any, ownerId: string, a: any) {
  const titel = (a?.titel || "").toString().trim();
  if (!titel) return NextResponse.json({ ok: false, meldung: "Der Aufgabe fehlt ein Titel." });

  // Default-Projekt "Interne Aufgaben" finden oder anlegen (pro Betrieb, additiver Andockpunkt)
  let projektId: string | null = null;
  const { data: proj } = await supabase
    .from("projekte").select("id")
    .eq("owner_user_id", ownerId).eq("name", PROJEKT_DEFAULT)
    .maybeSingle();
  if (proj?.id) {
    projektId = proj.id;
  } else {
    const { data: neu, error: projErr } = await supabase
      .from("projekte")
      .insert({
        owner_user_id: ownerId,
        name: PROJEKT_DEFAULT,
        beschreibung: "Sammelprojekt fuer Aufgaben aus dem Chef-Cockpit.",
        farbe: "#00e5ff",
      })
      .select("id").single();
    if (projErr) { console.error(projErr); return NextResponse.json({ ok: false, meldung: "Das Sammelprojekt konnte nicht angelegt werden." }); }
    projektId = neu.id;
  }

  // Optional: Mitarbeiter aufloesen
  let mitarbeiterId: string | null = null;
  let mitarbeiterName = "";
  const wunschName = (a?.mitarbeiter_name || "").toString().trim();
  if (wunschName) {
    const t = await findeMitarbeiter(supabase, ownerId, wunschName);
    if (t.status === "keiner") {
      return NextResponse.json({ ok: false, rueckfrage: `Ich habe keinen Mitarbeiter namens "${wunschName}" gefunden. Soll ich die Aufgabe ohne Zuweisung anlegen, oder meinst du jemand anderen?` });
    }
    if (t.status === "mehrere") {
      return NextResponse.json({ ok: false, rueckfrage: `Es passen mehrere Mitarbeiter zu "${wunschName}". Wen meinst du?`, optionen: t.optionen });
    }
    mitarbeiterId = t.id!;
    mitarbeiterName = t.name!;
  }

  const insert: any = {
    owner_user_id: ownerId,
    projekt_id: projektId,
    titel,
    status: "todo",
    prioritaet: erlaubtePrio(a?.prioritaet),
  };
  if (a?.beschreibung) insert.beschreibung = a.beschreibung.toString().trim();
  if (a?.faellig_am && /^\d{4}-\d{2}-\d{2}$/.test(a.faellig_am)) insert.faellig_am = a.faellig_am;
  if (mitarbeiterId) insert.mitarbeiter_id = mitarbeiterId;

  const { error } = await supabase.from("aufgaben").insert(insert);
  if (error) { console.error(error); return NextResponse.json({ ok: false, meldung: "Die Aufgabe konnte nicht gespeichert werden." }); }

  const zusatz = [
    mitarbeiterName ? `fuer ${mitarbeiterName}` : "",
    insert.faellig_am ? `bis ${datumHuebsch(insert.faellig_am)}` : "",
  ].filter(Boolean).join(", ");
  return NextResponse.json({ ok: true, meldung: `Aufgabe "${titel}"${zusatz ? " " + zusatz : ""} wurde angelegt.` });
}

// ============================================================
// Aktion 2: Team-Nachricht (erscheint als der Chef, nicht als KI)
// ============================================================
async function teamNachricht(supabase: any, ownerId: string, a: any) {
  const text = (a?.text || "").toString().trim();
  if (!text) return NextResponse.json({ ok: false, meldung: "Der Nachricht fehlt ein Text." });

  // Kanaele des Chefs laden
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
    ist_ki: false, // wichtig: Nachricht kommt vom Chef, die KI ist nur das Werkzeug
    text,
    firma_id: kanal.firma_id ?? null,
  });
  if (error) { console.error(error); return NextResponse.json({ ok: false, meldung: "Die Nachricht konnte nicht gesendet werden." }); }
  return NextResponse.json({ ok: true, meldung: `Nachricht im Kanal "${kanal.name}" gesendet.` });
}

// ============================================================
// Aktion 3: Wiedervorlage fuer Kontakt (naechster_kontakt_am + Aktivitaets-Log)
// ============================================================
async function wiedervorlage(supabase: any, ownerId: string, a: any) {
  const wunschKontakt = (a?.kontakt_name || "").toString().trim();
  const datum = (a?.datum || "").toString().trim();
  if (!wunschKontakt) return NextResponse.json({ ok: false, meldung: "Es fehlt der Name des Kontakts." });
  if (!/^\d{4}-\d{2}-\d{2}/.test(datum)) return NextResponse.json({ ok: false, meldung: "Es fehlt ein gueltiges Datum fuer die Wiedervorlage." });

  const safe = wunschKontakt.replace(/[,()%*]/g, " ").trim();
  const { data: kontakte } = await supabase
    .from("kontakte")
    .select("id,vorname,nachname,firma")
    .eq("owner_user_id", ownerId)
    .or(`nachname.ilike.%${safe}%,vorname.ilike.%${safe}%,firma.ilike.%${safe}%`)
    .limit(10);
  const liste = Array.isArray(kontakte) ? kontakte : [];
  const label = (k: any) => [`${k.vorname || ""} ${k.nachname || ""}`.trim(), k.firma ? `(${k.firma})` : ""].filter(Boolean).join(" ");

  if (liste.length === 0) return NextResponse.json({ ok: false, rueckfrage: `Ich habe keinen Kontakt "${wunschKontakt}" gefunden. Wen genau meinst du?` });
  let kontakt = liste[0];
  if (liste.length > 1) {
    const exakt = liste.filter((k: any) => (k.nachname || "").toLowerCase() === safe.toLowerCase() || (k.firma || "").toLowerCase() === safe.toLowerCase());
    if (exakt.length !== 1) {
      return NextResponse.json({ ok: false, rueckfrage: `Es passen mehrere Kontakte zu "${wunschKontakt}". Welchen meinst du?`, optionen: liste.map(label) });
    }
    kontakt = exakt[0];
  }

  const datumIso = datum.length === 10 ? datum + "T09:00:00" : datum; // 09:00 als Tages-Erinnerung
  const { error: upErr } = await supabase
    .from("kontakte")
    .update({ naechster_kontakt_am: datumIso, updated_at: new Date().toISOString() })
    .eq("id", kontakt.id).eq("owner_user_id", ownerId);
  if (upErr) { console.error(upErr); return NextResponse.json({ ok: false, meldung: "Die Wiedervorlage konnte nicht gesetzt werden." }); }

  // Als Aktivitaet protokollieren (nachvollziehbar) — best effort, darf die Aktion nicht kippen
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
async function findeMitarbeiter(
  supabase: any,
  ownerId: string,
  name: string
): Promise<{ status: "einer" | "mehrere" | "keiner"; id?: string; name?: string; optionen?: string[] }> {
  const safe = name.replace(/[,()%*]/g, " ").trim();
  const { data } = await supabase
    .from("mitarbeiter")
    .select("id,vorname,nachname")
    .eq("owner_user_id", ownerId)
    .or(`vorname.ilike.%${safe}%,nachname.ilike.%${safe}%`)
    .limit(10);
  const liste = Array.isArray(data) ? data : [];
  const voll = (m: any) => `${m.vorname || ""} ${m.nachname || ""}`.trim();

  if (liste.length === 0) return { status: "keiner" };
  if (liste.length === 1) return { status: "einer", id: liste[0].id, name: voll(liste[0]) };

  // bei mehreren: exakten Vornamen-Treffer bevorzugen
  const exakt = liste.filter((m: any) => (m.vorname || "").toLowerCase() === safe.toLowerCase());
  if (exakt.length === 1) return { status: "einer", id: exakt[0].id, name: voll(exakt[0]) };
  return { status: "mehrere", optionen: liste.map(voll) };
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
