// app/api/datei-text/route.ts
// ============================================================
// ARGONAUT OS · Universeller Datei-Leser (Etappe 2, Baustein 2c-1)
// Nimmt EINE hochgeladene Datei (PDF / Word .docx / Excel .xlsx / CSV / TXT)
// und gibt den reinen Text zurück:  { text, dateiname, typ, gekuerzt }
// Weiß NICHTS von Preisen - reine Text-Extraktion. Damit später in jedem
// Reiter wiederverwendbar. Der ausgelesene Text geht danach in den
// bestehenden KI-Aufräum-Motor (/api/preis-import).
// Gleiches Muster wie andere Routen: nodejs runtime, Auth-Check.
// ============================================================
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB - sicher unter dem Serverless-Limit
const MAX_ZEICHEN = 20000; // passt zum Limit des KI-Aufräum-Motors

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const form = await req.formData();
    const datei = form.get("datei");
    if (!(datei instanceof File)) {
      return NextResponse.json({ error: "Keine Datei übergeben." }, { status: 400 });
    }
    if (datei.size === 0) {
      return NextResponse.json({ error: "Die Datei ist leer." }, { status: 400 });
    }
    if (datei.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Datei zu groß (max. 4 MB). Bitte in kleineren Teilen einlesen." },
        { status: 400 }
      );
    }

    const name = datei.name || "datei";
    const endung = name.toLowerCase().split(".").pop() || "";
    const buf = Buffer.from(await datei.arrayBuffer());

    let text = "";
    let typ = "";

    if (endung === "pdf") {
      typ = "PDF";
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const r = await extractText(pdf, { mergePages: true });
      text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
    } else if (endung === "docx") {
      typ = "Word";
      const r = await mammoth.extractRawText({ buffer: buf });
      text = r.value;
    } else if (endung === "xlsx" || endung === "xlsm") {
      typ = "Excel";
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const zeilen: string[] = [];
      wb.eachSheet((ws) => {
        ws.eachRow({ includeEmpty: false }, (row) => {
          const werte: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            werte.push(cell.value == null ? "" : String(cell.value));
          });
          zeilen.push(werte.join(" | "));
        });
      });
      text = zeilen.join("\n");
    } else if (endung === "csv" || endung === "txt") {
      typ = endung === "csv" ? "CSV" : "Text";
      text = buf.toString("utf-8");
    } else if (endung === "doc") {
      return NextResponse.json(
        { error: "Das alte .doc-Format wird nicht unterstützt. Bitte in Word als .docx speichern." },
        { status: 415 }
      );
    } else if (endung === "xls") {
      return NextResponse.json(
        { error: "Das alte .xls-Format wird nicht unterstützt. Bitte in Excel als .xlsx speichern." },
        { status: 415 }
      );
    } else {
      return NextResponse.json(
        {
          error: `Dateiformat „.${endung}" wird nicht unterstützt. Erlaubt sind: PDF, Word (.docx), Excel (.xlsx), CSV.`,
        },
        { status: 415 }
      );
    }

    text = (text || "").trim();
    if (!text) {
      return NextResponse.json(
        {
          error:
            "Aus der Datei ließ sich kein Text lesen. Falls es ein eingescanntes Bild ist, bitte den Text abtippen oder eine Datei mit echtem Text verwenden.",
        },
        { status: 422 }
      );
    }

    let gekuerzt = false;
    if (text.length > MAX_ZEICHEN) {
      text = text.slice(0, MAX_ZEICHEN);
      gekuerzt = true;
    }

    return NextResponse.json({ text, dateiname: name, typ, gekuerzt });
  } catch (err: any) {
    console.error("Datei-Text Fehler:", err);
    return NextResponse.json(
      { error: "Die Datei konnte nicht gelesen werden. Bitte Format prüfen oder eine andere Datei versuchen." },
      { status: 500 }
    );
  }
}
