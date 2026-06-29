// ============================================================
// ARGONAUT OS · HR/Personal — Arbeitsvertrag-Generator (gestaltet)
// Lädt den Mitarbeiter serverseitig (Owner-Check), baut einen
// professionell formatierten Muster-Arbeitsvertrag (Serif/klassisch,
// Firmen-Briefkopf, Navy-Überschriften, Blocksatz, Unterschriftsblock),
// erzeugt PDF ODER DOCX, archiviert ihn und gibt eine signierte
// Download-URL zurück. Fehlende Angaben → [BITTE ERGÄNZEN].
// docx wird direkt verwendet (buildDocx bleibt unangetastet, additiv).
// Pfad: app/api/hr/arbeitsvertrag/route.ts
// ============================================================
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { docxToPdf, saveToStorage } from '@/lib/document-engine';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
  Table, TableRow, TableCell, WidthType,
} from 'docx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'erstellte-dokumente';
const PLATZ = '[BITTE ERGÄNZEN]';

// Marken-/Dokumentfarben (HEX ohne #)
const NAVY = '0A1628';
const GOLD = 'C9A84C';
const GREY = '5A6B82';
const SERIF = 'Times New Roman'; // rendert über LibreOffice/Gotenberg zuverlässig als Serifenschrift

type Profil = {
  firma_name?: string | null;
  firma_strasse?: string | null;
  firma_plz?: string | null;
  firma_ort?: string | null;
  firma_geschaeftsfuehrer?: string | null;
  firma_rechtsform?: string | null;
};

function v(s: string | null | undefined): string {
  return s != null && String(s).trim() !== '' ? String(s).trim() : PLATZ;
}
function dDE(d: string | null | undefined): string {
  if (!d) return PLATZ;
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return PLATZ; }
}

// ---- Bausteine -------------------------------------------------
// Paragraph-Bausteine, alle Serif. Werte: size in Halbpunkten (22 = 11pt).
function leer(after = 0): Paragraph {
  return new Paragraph({ spacing: { after }, children: [new TextRun({ text: '', font: SERIF })] });
}
function body(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 140, line: 300, lineRule: 'auto' },
    children: [new TextRun({ text, font: SERIF, size: 22, color: '1A1A1A' })],
  });
}
function paragraf(text: string, opts?: { italic?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean }): Paragraph {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: { after: 100, line: 300, lineRule: 'auto' },
    children: [new TextRun({ text, font: SERIF, size: opts?.size ?? 22, italics: opts?.italic ?? false, bold: opts?.bold ?? false, color: opts?.color ?? '1A1A1A' })],
  });
}
function paragraph(nr: string, titel: string): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 80, line: 300, lineRule: 'auto' },
    keepNext: true,
    children: [new TextRun({ text: `${nr}  ${titel}`, font: SERIF, size: 24, bold: true, color: NAVY })],
  });
}

export async function POST(req: Request) {
  try {
    const reqBody = await req.json().catch(() => null);
    const id: string = reqBody?.mitarbeiter_id;
    const format: 'pdf' | 'docx' = reqBody?.format === 'docx' ? 'docx' : 'pdf';
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Keine Mitarbeiter-ID übergeben.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
    }

    // Mitarbeiter laden + Besitz prüfen
    const { data: ma, error: maErr } = await supabase
      .from('mitarbeiter')
      .select('id, owner_user_id, vorname, nachname, adresse, geburtsdatum, eintrittsdatum, position, urlaubsanspruch_tage')
      .eq('id', id)
      .single();
    if (maErr || !ma) {
      return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 });
    }
    if (ma.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Mitarbeiter.' }, { status: 403 });
    }

    // Firmenprofil laden (Arbeitgeber-Daten)
    const admin = createAdminClient();
    const { data: profilRow } = await admin
      .from('profiles')
      .select('firma_name, firma_strasse, firma_plz, firma_ort, firma_geschaeftsfuehrer, firma_rechtsform')
      .eq('id', user.id)
      .single();
    const p = (profilRow ?? {}) as Profil;

    // --- Daten aufbereiten ---
    const agName = v(p.firma_name);
    const agStrasse = v(p.firma_strasse);
    const agOrtZeile = `${v(p.firma_plz)} ${v(p.firma_ort)}`.trim();
    const agVertreter = v(p.firma_geschaeftsfuehrer);
    const anName = `${v(ma.vorname)} ${v(ma.nachname)}`.trim();
    const anAdresse = v(ma.adresse);
    const anGeb = dDE(ma.geburtsdatum);
    const beginn = dDE(ma.eintrittsdatum);
    const taetigkeit = v(ma.position);
    const urlaub = ma.urlaubsanspruch_tage != null ? String(ma.urlaubsanspruch_tage) : PLATZ;
    const firmenOrt = p.firma_ort && String(p.firma_ort).trim() !== '' ? String(p.firma_ort).trim() : PLATZ;

    // --- Unterschriftsblock (Tabelle, nur obere Kante = Linie) ---
    const sigCell = (label: string) => new TableCell({
      width: { size: 45, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      margins: { top: 80, bottom: 0, left: 0, right: 0 },
      children: [new Paragraph({ children: [new TextRun({ text: label, font: SERIF, size: 18, color: GREY })] })],
    });
    const spacerCell = new TableCell({
      width: { size: 10, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      children: [new Paragraph({ children: [new TextRun({ text: '', font: SERIF })] })],
    });
    const sigTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [new TableRow({ children: [sigCell('Ort, Datum · Arbeitgeber'), spacerCell, sigCell('Ort, Datum · Arbeitnehmer')] })],
    });

    // --- Dokument zusammensetzen ---
    const children: (Paragraph | Table)[] = [
      // Briefkopf
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        children: [new TextRun({ text: agName, font: SERIF, size: 22, bold: true, color: NAVY })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 320 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD, space: 6 } },
        children: [new TextRun({ text: `${agStrasse} · ${agOrtZeile}`, font: SERIF, size: 16, color: GREY })],
      }),
      // Titel
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: 'ARBEITSVERTRAG', font: SERIF, size: 40, bold: true, color: NAVY, characterSpacing: 60 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 320 },
        children: [new TextRun({ text: anName, font: SERIF, size: 22, color: GOLD })],
      }),
      // Vertragsparteien
      body(`zwischen ${agName}, ${agStrasse}, ${agOrtZeile}, vertreten durch ${agVertreter}`),
      paragraf('— nachfolgend „Arbeitgeber" —', { italic: true, color: GREY, size: 20 }),
      leer(60),
      body(`und ${anName}, wohnhaft ${anAdresse}, geboren am ${anGeb}`),
      paragraf('— nachfolgend „Arbeitnehmer" —', { italic: true, color: GREY, size: 20 }),
      leer(120),
      paragraf('wird der folgende Arbeitsvertrag geschlossen:', { bold: true }),

      paragraph('§ 1', 'Beginn des Arbeitsverhältnisses'),
      body(`Das Arbeitsverhältnis beginnt am ${beginn}. Es wird auf unbestimmte Zeit geschlossen.`),

      paragraph('§ 2', 'Tätigkeit'),
      body(`Der Arbeitnehmer wird als ${taetigkeit} eingestellt. Der Arbeitgeber ist berechtigt, dem Arbeitnehmer auch andere zumutbare Tätigkeiten zu übertragen, die seiner Vorbildung und seinen Fähigkeiten entsprechen.`),

      paragraph('§ 3', 'Probezeit'),
      body('Die ersten sechs Monate des Arbeitsverhältnisses gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis beiderseits mit einer Frist von zwei Wochen gekündigt werden.'),

      paragraph('§ 4', 'Arbeitszeit'),
      body(`Die regelmäßige wöchentliche Arbeitszeit beträgt ${PLATZ} Stunden. Beginn und Ende der täglichen Arbeitszeit sowie die Lage der Pausen richten sich nach den betrieblichen Erfordernissen.`),

      paragraph('§ 5', 'Vergütung'),
      body(`Der Arbeitnehmer erhält eine monatliche Bruttovergütung in Höhe von ${PLATZ} EUR. Die Vergütung ist jeweils zum Ende eines Kalendermonats fällig und wird bargeldlos auf ein vom Arbeitnehmer zu benennendes Konto gezahlt.`),

      paragraph('§ 6', 'Urlaub'),
      body(`Der Arbeitnehmer hat Anspruch auf ${urlaub} Arbeitstage bezahlten Erholungsurlaub je Kalenderjahr. Der gesetzliche Mindesturlaubsanspruch bleibt hiervon unberührt.`),

      paragraph('§ 7', 'Arbeitsverhinderung und Krankheit'),
      body('Der Arbeitnehmer ist verpflichtet, jede Arbeitsverhinderung sowie deren voraussichtliche Dauer unverzüglich anzuzeigen. Bei einer Arbeitsunfähigkeit infolge Krankheit ist spätestens am dritten Kalendertag eine ärztliche Bescheinigung vorzulegen.'),

      paragraph('§ 8', 'Kündigung'),
      body('Nach Ablauf der Probezeit gelten die gesetzlichen Kündigungsfristen. Jede Kündigung bedarf zu ihrer Wirksamkeit der Schriftform.'),

      paragraph('§ 9', 'Verschwiegenheit'),
      body('Der Arbeitnehmer verpflichtet sich, über alle ihm im Rahmen seiner Tätigkeit bekannt gewordenen betrieblichen Angelegenheiten sowohl während als auch nach Beendigung des Arbeitsverhältnisses Stillschweigen zu bewahren.'),

      paragraph('§ 10', 'Nebenabreden und Schriftform'),
      body('Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform. Mündliche Nebenabreden bestehen nicht. Dies gilt auch für die Aufhebung des Schriftformerfordernisses selbst.'),

      paragraph('§ 11', 'Salvatorische Klausel'),
      body('Sollte eine Bestimmung dieses Vertrages unwirksam sein oder werden, so wird die Wirksamkeit der übrigen Bestimmungen hiervon nicht berührt. Die unwirksame Bestimmung ist durch eine wirksame zu ersetzen, die dem wirtschaftlichen Zweck am nächsten kommt.'),

      // Unterschriftsblock
      leer(80),
      paragraf(`${firmenOrt}, den ${PLATZ}`),
      leer(420),
      sigTable,

      // Fußhinweis
      leer(360),
      new Paragraph({
        spacing: { before: 120, line: 260, lineRule: 'auto' },
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 8 } },
        children: [new TextRun({
          text: 'Hinweis: Dieses Dokument ist ein unverbindliches Muster und stellt keine Rechtsberatung dar. Vor der Verwendung ist der Vertrag an die konkrete Situation anzupassen und sollte arbeitsrechtlich geprüft werden. Alle mit [BITTE ERGÄNZEN] markierten Felder sind vor der Unterzeichnung auszufüllen.',
          font: SERIF, size: 16, italics: true, color: GREY,
        })],
      }),
    ];

    const doc = new Document({
      creator: 'ARGONAUT OS',
      styles: { default: { document: { run: { font: SERIF, size: 22 } } } },
      sections: [{
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1304, right: 1304 } } },
        children,
      }],
    });

    const docxBuffer = await Packer.toBuffer(doc);

    let fileBuffer: Buffer;
    let typ: 'pdf' | 'docx';
    let contentType: string;
    const titel = `Arbeitsvertrag – ${anName}`;
    if (format === 'docx') {
      fileBuffer = docxBuffer;
      typ = 'docx';
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      fileBuffer = await docxToPdf(docxBuffer, `${titel}.docx`);
      typ = 'pdf';
      contentType = 'application/pdf';
    }

    const saved = await saveToStorage(fileBuffer, {
      userId: user.id,
      name: titel,
      typ,
      contentType,
      status: 'entwurf',
      herkunft: 'HR · Arbeitsvertrag',
      agent: 'Vertrags-Generator',
    });

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(saved.storage_path, 600);

    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null, name: saved.name, typ });
  } catch (err) {
    console.error('Arbeitsvertrag Fehler:', err);
    return NextResponse.json({ error: 'Arbeitsvertrag konnte nicht erzeugt werden.' }, { status: 500 });
  }
}
