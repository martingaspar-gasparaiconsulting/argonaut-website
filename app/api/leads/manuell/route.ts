import { createClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Benutzer aus Session holen
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  // Formulardaten validieren
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ungueltige Anfragedaten." }, { status: 400 });
  }

  const { name, email, telefon, dienstleistung, nachricht, ist_bestand, werbung_einwilligung } = body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "Name ist ein Pflichtfeld." }, { status: 400 });
  }
  if (email && typeof email !== "string") {
    return NextResponse.json({ error: "Ungueltige E-Mail." }, { status: 400 });
  }
  if (telefon && typeof telefon !== "string") {
    return NextResponse.json({ error: "Ungueltige Telefonnummer." }, { status: 400 });
  }
  if (dienstleistung && typeof dienstleistung !== "string") {
    return NextResponse.json({ error: "Ungueltige Dienstleistung." }, { status: 400 });
  }
  if (nachricht && typeof nachricht !== "string") {
    return NextResponse.json({ error: "Ungueltige Nachricht." }, { status: 400 });
  }

  const hatEinwilligung = werbung_einwilligung === true;

  // Lead einfuegen - owner_user_id sicher aus der Session
  const { data, error } = await supabase
    .from("leads")
    .insert({
      owner_user_id: user.id,
      name: name.trim(),
      email: email || null,
      telefon: telefon || null,
      dienstleistung: dienstleistung || null,
      nachricht: nachricht || null,
      ist_bestand: ist_bestand === true,
      werbung_einwilligung: hatEinwilligung,
      einwilligung_am: hatEinwilligung ? new Date().toISOString() : null,
      status: "neu",
      quelle: "Manuell",
    })
    .select()
    .single();

  if (error) {
    console.error("Fehler beim Anlegen:", error);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
