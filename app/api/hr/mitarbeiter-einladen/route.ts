// app/api/hr/mitarbeiter-einladen/route.ts
// ARGONAUT OS - HR Self-Service: Mitarbeiter zum eigenen Login einladen
// -----------------------------------------------------------------------------
// POST { mitarbeiter_id } ->
//   1) prueft, dass der eingeloggte Nutzer (Chef) Besitzer des Mitarbeiters ist
//   2) legt per Supabase-Admin (Service-Role) ein Login-Konto fuer die E-Mail an
//      bzw. verschickt eine Einladungs-Mail
//   3) schreibt die auth_user_id in die mitarbeiter-Zeile
//      -> damit greifen automatisch die Self-Service-RLS-Policies
//
// Sicherheits-Prinzip: Auth-Konten werden NIE vom Browser angelegt, sondern nur
// hier serverseitig mit dem Service-Role-Key. Der Schluessel kommt aus process.env
// und wird nie im Code/Client sichtbar.
// Muster uebernommen aus /api/leads/angebot (Server-Client, Owner-Pruefung).
// -----------------------------------------------------------------------------
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const mitarbeiterId: string = body?.mitarbeiter_id;
    if (!mitarbeiterId || typeof mitarbeiterId !== "string") {
      return NextResponse.json({ error: "Keine Mitarbeiter-ID uebergeben." }, { status: 400 });
    }

    // 1) Eingeloggten Nutzer (Chef) ermitteln
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // Mitarbeiter laden + Besitz pruefen
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
      return NextResponse.json({ error: "Fuer diesen Mitarbeiter ist keine E-Mail hinterlegt. Bitte zuerst eine E-Mail-Adresse in den Stammdaten eintragen." }, { status: 400 });
    }
    if (ma.auth_user_id) {
      return NextResponse.json({ ok: true, bereits_eingeladen: true, message: "Dieser Mitarbeiter wurde bereits eingeladen." });
    }

    const email = ma.email.trim().toLowerCase();

    // 2) Admin-Client (Service-Role) - umgeht RLS, nur serverseitig
    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!adminUrl || !serviceKey) {
      return NextResponse.json({ error: "Server ist nicht korrekt konfiguriert (fehlende Umgebungsvariablen)." }, { status: 500 });
    }
    const admin = createAdminClient(adminUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Login-Konto per Einladungs-Mail anlegen
    let authUserId: string | null = null;
    const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);

    if (inviteErr) {
      // Haeufigster Fall: E-Mail existiert bereits als Konto -> bestehende ID finden
      const bereitsVorhanden = /already|registered|exist/i.test(inviteErr.message || "");
      if (bereitsVorhanden) {
        const { data: liste } = await admin.auth.admin.listUsers();
        const treffer = liste?.users?.find((u) => (u.email || "").toLowerCase() === email);
        if (treffer) {
          authUserId = treffer.id;
        } else {
          return NextResponse.json({ error: "Es existiert bereits ein Konto mit dieser E-Mail, konnte aber nicht zugeordnet werden." }, { status: 409 });
        }
      } else {
        console.error("Einladung fehlgeschlagen:", inviteErr);
        return NextResponse.json({ error: "Einladung konnte nicht versendet werden: " + inviteErr.message }, { status: 500 });
      }
    } else {
      authUserId = invite?.user?.id ?? null;
    }

    if (!authUserId) {
      return NextResponse.json({ error: "Konto wurde angelegt, aber es konnte keine Benutzer-ID ermittelt werden." }, { status: 500 });
    }

    // 3) auth_user_id in mitarbeiter-Zeile schreiben (Owner-Client, RLS-konform)
    const { error: updErr } = await supabase
      .from("mitarbeiter")
      .update({ auth_user_id: authUserId })
      .eq("id", mitarbeiterId);

    if (updErr) {
      console.error("Verknuepfung fehlgeschlagen:", updErr);
      return NextResponse.json({ error: "Einladung versendet, aber Verknuepfung fehlgeschlagen. Bitte erneut versuchen." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      auth_user_id: authUserId,
      message: "Einladung an " + email + " versendet. Der Mitarbeiter erhaelt eine E-Mail zum Festlegen seines Passworts.",
    });
  } catch (err) {
    console.error("Mitarbeiter-einladen Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
