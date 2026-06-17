// app/api/erstellte-dokumente/download/route.ts
// ARGONAUT OS — Download eines erstellten Dokuments via Signed URL.
// GET ?id=<dokument-id>
//   1) User-Client prueft per RLS, ob das Dokument dem eingeloggten User gehoert
//   2) Admin-Client erzeugt die Signed URL (umgeht Storage-RLS, da Bucket privat)
//   -> { ok:true, url } | { ok:false, error }
// -----------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "erstellte-dokumente";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Keine ID uebergeben." }, { status: 400 });
    }

    // 1) Eingeloggten User ermitteln + Ownership via RLS pruefen
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Nicht eingeloggt." }, { status: 401 });
    }

    // RLS sorgt dafuer, dass nur EIGENE Dokumente sichtbar sind
    const { data: doc, error } = await supabase
      .from("erstellte_dokumente")
      .select("storage_path, name")
      .eq("id", id)
      .single();

    if (error || !doc) {
      return NextResponse.json({ ok: false, error: "Dokument nicht gefunden." }, { status: 404 });
    }

    // 2) Signed URL mit Admin-Client erzeugen (Bucket ist privat, Storage-RLS umgehen)
    const admin = createAdminClient();
    // Den vollständigen Dateinamen aus storage_path extrahieren (enthält die Endung)
    const downloadFileName = doc.storage_path.split('/').pop() || doc.name;
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60, { download: downloadFileName });

    if (signErr || !signed) {
      console.error("DOWNLOAD: createSignedUrl fehlgeschlagen", { signErr, storage_path: doc.storage_path });
      return NextResponse.json({ ok: false, error: "Link konnte nicht erstellt werden." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: signed.signedUrl });
  } catch (err: any) {
    console.error("DOWNLOAD: Interner Fehler", err);
    return NextResponse.json({ ok: false, error: "Interner Fehler." }, { status: 500 });
  }
}
