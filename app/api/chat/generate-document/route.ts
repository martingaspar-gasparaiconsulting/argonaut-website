// app/api/chat/generate-document/route.ts
// ARGONAUT OS — Schritt 2b: Chat triggert Dokumenterzeugung
// POST { templateId, data, status?, herkunft?, agent? }
//   -> renderDocument -> buildDocx/docxToPdf/buildXlsx -> saveToStorage
//   -> { ok:true, dokument: SavedDocument }
// GET -> { ok:true, templates: [...] }   (Liste der verfuegbaren Templates)
// -----------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { buildDocx, docxToPdf, buildXlsx, saveToStorage } from "@/lib/document-engine";
import { renderDocument, type RenderErgebnis } from "@/lib/document-render";
import { getTemplate, templateListe } from "@/lib/document-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liste der verfuegbaren Templates (zum Testen / fuer den Chat in Schritt 3)
export async function GET() {
  return NextResponse.json({ ok: true, templates: templateListe() });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Nicht eingeloggt" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}) as any);
    const templateId: string = body?.templateId;
    const data: Record<string, any> = body?.data ?? {};

    if (!templateId) {
      return NextResponse.json({ ok: false, error: "templateId fehlt" }, { status: 400 });
    }

    const tpl = getTemplate(templateId);
    if (!tpl) {
      return NextResponse.json({ ok: false, error: "Unbekanntes Template: " + templateId }, { status: 400 });
    }

    // Render (wirft bei fehlenden Pflichtfeldern)
    let render: RenderErgebnis;
    try {
      render = renderDocument(templateId, data);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }

    // Datei erzeugen
    let fileBuffer: Buffer;
    if (render.kind === "tabelle") {
      fileBuffer = await buildXlsx(render.sheetName, render.columns, render.rows);
    } else {
      const docxBuffer = await buildDocx(render.title, render.paragraphs);
      fileBuffer =
        render.typ === "pdf"
          ? await docxToPdf(docxBuffer, render.filename.replace(/\.pdf$/, ".docx"))
          : docxBuffer;
    }

    // Speichern + Tabellenzeile
    const saved = await saveToStorage(fileBuffer, {
      userId: user.id,
      name: render.name,
      typ: render.typ,
      contentType: render.contentType,
      status: body?.status ?? "entwurf",
      herkunft: body?.herkunft ?? "Chat",
      agent: body?.agent ?? tpl.agent,
    });

    return NextResponse.json({ ok: true, dokument: saved });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}