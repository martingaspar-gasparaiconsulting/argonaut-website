import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NextRequest, NextResponse } from "next/server";

// Whitelist: nur diese Felder duerfen ueber diese Route geschrieben werden
const ERLAUBTE_FELDER = [
  "firma_name",
  "firma_strasse",
  "firma_plz",
  "firma_ort",
  "firma_telefon",
  "firma_email",
  "firma_website",
  "firma_rechtsform",
  "firma_registergericht",
  "firma_hrb",
  "firma_geschaeftsfuehrer",
  "firma_ust_id",
  "firma_steuernummer",
  "firma_iban",
  "firma_bank",
  "firma_bic",
  "firma_akzentfarbe",
] as const;

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();

  // Benutzer aus Session holen
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ungueltige Anfragedaten." }, { status: 400 });
  }

  // Nur erlaubte Felder uebernehmen, leere Strings als NULL speichern
  const update: Record<string, string | null> = {};
  for (const feld of ERLAUBTE_FELDER) {
    if (feld in body) {
      const wert = body[feld];
      if (wert !== null && typeof wert !== "string") {
        return NextResponse.json({ error: "Ungueltiger Wert fuer " + feld }, { status: 400 });
      }
      update[feld] = wert === null || wert.trim() === "" ? null : wert.trim();
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Keine Aenderungen uebergeben." }, { status: 400 });
  }

  // Admin-Client: schreibt gezielt nur die eigene Profil-Zeile (id = user.id)
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", user.id);

  if (error) {
    console.error("Profil-Update fehlgeschlagen:", error);
    return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
