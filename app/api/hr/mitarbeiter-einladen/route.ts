// app/api/hr/mitarbeiter-einladen/route.ts
// ARGONAUT OS - HR Self-Service: Mitarbeiter-Zugang erstellen (Weg B, ohne Mail)
// -----------------------------------------------------------------------------
// POST { mitarbeiter_id } ->
//   1) prueft, dass der eingeloggte Nutzer (Chef) Besitzer des Mitarbeiters ist
//   2) legt per Supabase-Admin (Service-Role) ein bestaetigtes Login-Konto an
//      (bzw. setzt fuer ein bestehendes Konto ein neues Einmal-Passwort)
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
      return NextResponse.json({ error: "Dieser Mitarbeiter hat bereits einen Zugang. Nutze spaeter 'Zugang zuruecksetzen', um ein neues Passwort zu erzeugen." }, { status: 409 });
    }

    const email = ma.email.trim().toLowerCase();

    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!adminUrl || !serviceKey) {
      return NextResponse.json({ error: "Server ist nicht korrekt konfiguriert (fehlende Umgebungsvariablen)." }, { status: 500 });
    }
    const admin = createAdminClient(adminUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tempPw = tempPasswort();
    let authUserId: string | null = null;

    // Konto anlegen (bestaetigt -> sofort login-faehig, keine Mail noetig)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPw,
      email_confirm: true,
    });

    if (createErr) {
      // E-Mail existiert evtl. schon -> bestehendes Konto + neues Passwort
      const existiert = /already|registered|exist|duplicate/i.test(createErr.message || "");
      if (existiert) {
        const { data: liste } = await admin.auth.admin.listUsers();
        const treffer = liste?.users?.find((u) => (u.email || "").toLowerCase() === email);
        if (!treffer) {
          return NextResponse.json({ error: "Es existiert bereits ein Konto mit dieser E-Mail, konnte aber nicht zugeordnet werden." }, { status: 409 });
        }
        authUserId = treffer.id;
        const { error: pwErr } = await admin.auth.admin.updateUserById(authUserId, { password: tempPw });
        if (pwErr) throw pwErr;
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

    // Verknuepfung schreiben (Owner-Client, RLS-konform)
    const { error: updErr } = await supabase
      .from("mitarbeiter")
      .update({ auth_user_id: authUserId })
      .eq("id", mitarbeiterId);

    if (updErr) {
      console.error("Verknuepfung fehlgeschlagen:", updErr);
      return NextResponse.json({ error: "Zugang erstellt, aber Verknuepfung fehlgeschlagen. Bitte erneut versuchen." }, { status: 500 });
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
