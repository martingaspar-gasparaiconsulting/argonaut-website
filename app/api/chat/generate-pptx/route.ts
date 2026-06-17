// app/api/chat/generate-pptx/route.ts
// ARGONAUT OS — Block 4: Chat triggert PowerPoint-Erzeugung
// POST { title, slides, status?, herkunft?, agent? }
//   -> buildPptx -> saveToStorage -> { ok:true, dokument: SavedDocument }
//
// slides: [{ title: string, subtitle?: string, bullets?: string[] }]
// Der Inhalt wird im Chat (Claude) frei generiert, KEIN festes Template.
// -----------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { buildPptx, saveToStorage, type PptxSlide, type PptxBranding } from "@/lib/document-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

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
    const title: string = (body?.title ?? "").trim();
    const slides: PptxSlide[] = Array.isArray(body?.slides) ? body.slides : [];
    const branding: PptxBranding | undefined = body?.branding && typeof body.branding === "object"
      ? {
          primary: body.branding.primary ? String(body.branding.primary) : undefined,
          accent: body.branding.accent ? String(body.branding.accent) : undefined,
          logoText: body.branding.logoText ? String(body.branding.logoText).slice(0, 60) : undefined,
        }
      : undefined;

    if (!title) {
      return NextResponse.json({ ok: false, error: "title fehlt" }, { status: 400 });
    }
    if (slides.length === 0) {
      return NextResponse.json({ ok: false, error: "slides fehlen (mindestens 1)" }, { status: 400 });
    }

    // Eingaben säubern: nur erlaubte Felder, defensive Defaults
    const cleanSlides: PptxSlide[] = slides.map((s) => ({
      title: String(s?.title ?? "").slice(0, 200),
      subtitle: s?.subtitle ? String(s.subtitle).slice(0, 300) : undefined,
      bullets: Array.isArray(s?.bullets)
        ? s.bullets.map((b) => String(b).slice(0, 500)).slice(0, 12)
        : undefined,
    }));

    // PPTX bauen
    const fileBuffer = await buildPptx(title, cleanSlides, branding);

    // Dateiname
    const safe = title.replace(/[^a-zA-Z0-9._-]/g, "_");
    const name = `${title}.pptx`;

    // Speichern + Tabellenzeile
    const saved = await saveToStorage(fileBuffer, {
      userId: user.id,
      name,
      typ: "pptx",
      contentType: PPTX_CONTENT_TYPE,
      status: body?.status ?? "entwurf",
      herkunft: body?.herkunft ?? "Chat",
      agent: body?.agent ?? "Der Schreiber",
    });

    return NextResponse.json({ ok: true, dokument: saved });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
