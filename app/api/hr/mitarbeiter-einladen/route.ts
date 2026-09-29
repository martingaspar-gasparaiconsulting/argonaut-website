// app/api/hr/mitarbeiter-einladen/route.ts
// ARGONAUT OS - HR Self-Service: Mitarbeiter-Zugang erstellen (Weg B, ohne Mail)
// -----------------------------------------------------------------------------
// POST { mitarbeiter_id } ->
//   1) prueft, dass der eingeloggte Nutzer (Chef) Besitzer des Mitarbeiters ist
//   2) legt per Supabase-Admin (Service-Role) ein bestaetigtes Login-Konto an
//      (ein bestehendes Konto wird seit Paket 169 NIE uebernommen -> 409)
//   3) verknuepft die auth_user_id mit der mitarbeiter-Zeile
//   4) gibt E-Mail + Einmal-Passwort + Login-Link zurueck, damit der Chef den
//      Zugang direkt an den Mitarbeiter weitergeben kann (kein Mailversand noetig)
//
// Sicherheits-Prinzip: Auth-Konten nur serverseitig mit Service-Role-Key
// (process.env). Das Einmal-Passwort wird nur einmal zurueckgegeben.
// -----------------------------------------------------------------------------
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { KONTO_KENNZEICHEN } from "@/lib/kontoSchutz";

export const runtime = "nodejs";

// Lesbares, ausreichend komplexes Einmal-Passwort
function tempPasswort(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < 14; i++) s += chars[arr[i] % chars.length];
  return s + "!7";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const mitarbeiterId: string = body?.mitarbeiter_id;
    if (!mitarbeiterId || typeof mitarbeiterId !== "string") {
      return NextResponse.json({ error: "Keine Mitarbeiter-ID uebergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const { data: ma, error: maErr } = await supabase
      .from("mitarbeiter")
      .select("id, owner_user_id, vorname, nachname, email, auth_user_id")
      .eq("id", mitarbeiterId)
      .single();

    if (maErr || !ma) {
      return NextResponse.json({ error: "Mitarbeiter nicht gefunden." }, { status: 404 });
    }
    if (ma.owner_user_id !== user.id) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Mitarbeiter." }, { status: 403 });
    }
    if (!ma.email || ma.email.trim() === "") {
      return NextResponse.json({ error: "Fuer diesen Mitarbeiter ist keine E-Mail hinterlegt. Bitte zuerst eine E-Mail-Adresse in den Stammdaten eintragen und speichern." }, { status: 400 });
    }
    if (ma.auth_user_id) {
      return NextResponse.json({ error: "Dieser Mitarbeiter hat bereits einen Zugang. Nutzen Sie spaeter 'Zugang zuruecksetzen', um ein neues Passwort zu erzeugen." }, { status: 409 });
    }

    const email = ma.email.trim().toLowerCase();

    // SCHUTZSPERRE: Eine Adresse, die bereits ein Chef-/Kunden-Konto ist, darf
    // NICHT als Mitarbeiter-Zugang angelegt werden (sonst wuerde das vorhandene
    // Passwort ueberschrieben -> Selbst-Aussperrung). Wir pruefen die customers-
    // Tabelle mit dem Admin-Client, damit RLS hier nicht im Weg steht.
    const adminUrl0 = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey0 = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!adminUrl0 || !serviceKey0) {
      return NextResponse.json({ error: "Server ist nicht korrekt konfiguriert (fehlende Umgebungsvariablen)." }, { status: 500 });
    }
    const adminCheck = createAdminClient(adminUrl0, serviceKey0, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: kundeMitMail } = await adminCheck
      .from("customers")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (kundeMitMail) {
      return NextResponse.json({ error: "Diese E-Mail gehoert bereits zu einem Chef-/Kunden-Konto und kann nicht als Mitarbeiter-Zugang verwendet werden. Bitte eine andere E-Mail fuer den Mitarbeiter eintragen." }, { status: 409 });
    }

    const admin = adminCheck;

    const tempPw = tempPasswort();
    let authUserId: string | null = null;

    // Konto anlegen (bestaetigt -> sofort login-faehig, keine Mail noetig)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPw,
      email_confirm: true,
      // Paket 169: Kennzeichen, zu welchem Betrieb das Konto gehoert (nur Server kann es setzen)
      app_metadata: { [KONTO_KENNZEICHEN]: user.id },
    });

    if (createErr) {
      const existiert = /already|registered|exist|duplicate/i.test(createErr.message || "");
      if (existiert) {
        // ▄▄▄ Paket 169 (K1, 29.09.2026) — kein stilles Uebernehmen mehr ▄▄▄
        // Hier wurde bis heute ein bestehendes Konto allein ueber die E-Mail
        // gesucht, sein Passwort ueberschrieben und dem Chef im Klartext
        // zurueckgegeben = Kontouebernahme (fremde Mitarbeiter, Demo-, Betreiber-
        // Konten). Gleiche Regel wie in zugang-reset seit 15.09.: nie uebernehmen.
        return NextResponse.json({
          error:
            "Zu dieser E-Mail-Adresse gibt es bereits einen Zugang. " +
            "Aus Sicherheitsgruenden wird ein bestehendes Konto hier nicht uebernommen. " +
            "Gehoert der Zugang zu dieser Person, kann sie sich ueber 'Passwort vergessen' " +
            "selbst ein neues Passwort setzen. Ist die Adresse versehentlich doppelt " +
            "vergeben, bitte den Support kontaktieren.",
        }, { status: 409 });
      } else {
        console.error("Konto-Erstellung fehlgeschlagen:", createErr);
        return NextResponse.json({ error: "Zugang konnte nicht erstellt werden: " + createErr.message }, { status: 500 });
      }
    } else {
      authUserId = created?.user?.id ?? null;
    }

    if (!authUserId) {
      return NextResponse.json({ error: "Konto angelegt, aber keine Benutzer-ID ermittelt." }, { status: 500 });
    }

    // Verknuepfung schreiben — Paket 169: per Service-Schluessel, weil die
    // Datenbank auth_user_id fuer angemeldete Nutzer sperrt (SQL p169).
    // Nur die eigene Zeile, nur wenn noch leer.
    const { error: updErr } = await admin
      .from("mitarbeiter")
      .update({ auth_user_id: authUserId })
      .eq("id", mitarbeiterId)
      .eq("owner_user_id", user.id)
      .is("auth_user_id", null);

    if (updErr) {
      console.error("Verknuepfung fehlgeschlagen:", updErr);
      return NextResponse.json({ error: "Zugang erstellt, aber Verknuepfung fehlgeschlagen. Bitte erneut versuchen." }, { status: 500 });
    }

    // Neuen Mitarbeiter automatisch in die Team-Kanaele des Chefs aufnehmen.
    // Sonst ist er Mitglied in KEINEM Kanal -> die per RLS auf die eigene
    // Mitgliedschaft gefilterte Kanal-Liste kommt leer zurueck und er sieht
    // gar keinen Team-Chat. Wir schreiben mit dem Admin-Client (Service-Role),
    // damit RLS hier nicht im Weg steht, und nur in Kanaele, die der Chef
    // (der eingeloggte Aufrufer) selbst erstellt hat. Best effort: schlaegt
    // das fehl, bleibt der Zugang trotzdem gueltig.
    try {
      const anzeige = `${ma.vorname ?? ""} ${ma.nachname ?? ""}`.trim() || null;
      const { data: chefKanaele } = await admin
        .from("chat_kanaele")
        .select("id")
        .eq("erstellt_von", user.id);
      const mitgliedschaften = (chefKanaele ?? []).map((k: { id: string }) => ({
        kanal_id: k.id,
        user_id: authUserId,
        anzeigename: anzeige,
      }));
      if (mitgliedschaften.length > 0) {
        await admin
          .from("chat_mitglieder")
          .upsert(mitgliedschaften, { onConflict: "kanal_id,user_id", ignoreDuplicates: true });
      }
    } catch (chatErr) {
      console.error("Team-Chat Auto-Beitritt fehlgeschlagen (unkritisch):", chatErr);
    }

    const loginUrl = new URL(req.url).origin + "/auth/login";

    return NextResponse.json({
      ok: true,
      email,
      temp_passwort: tempPw,
      login_url: loginUrl,
      message: "Zugang erstellt.",
    });
  } catch (err) {
    console.error("Mitarbeiter-einladen Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
