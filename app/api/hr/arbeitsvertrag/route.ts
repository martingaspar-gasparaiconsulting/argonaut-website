// ============================================================
// ARGONAUT OS · HR/Personal — Arbeitsvertrag-Generator
// Lädt den Mitarbeiter serverseitig (Owner-Check), baut einen
// neutralen Muster-Arbeitsvertrag aus den Stammdaten, erzeugt PDF
// ODER DOCX über die Document Engine, archiviert ihn und gibt eine
// signierte Download-URL zurück. Fehlende Angaben → [BITTE ERGÄNZEN].
// Pfad: app/api/hr/arbeitsvertrag/route.ts
// ============================================================
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { buildDocx, docxToPdf, saveToStorage, DocxParagraph } from '@/lib/document-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'erstellte-dokumente';
const PLATZ = '[BITTE ERGÄNZEN]';

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const id: string = body?.mitarbeiter_id;
    const format: 'pdf' | 'docx' = body?.format === 'docx' ? 'docx' : 'pdf';
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

    // --- Vertragstext als Absatz-Blöcke ---
    const para: DocxParagraph[] = [];
    const h = (text: string) => para.push({ text, heading: true });
    const t = (text: string) => para.push({ text });
    const leer = () => para.push({ text: '' });

    t(`zwischen ${agName}, ${agStrasse}, ${agOrtZeile}, vertreten durch ${agVertreter}`);
    t('— nachfolgend „Arbeitgeber" —');
    leer();
    t(`und ${anName}, wohnhaft ${anAdresse}, geboren am ${anGeb}`);
    t('— nachfolgend „Arbeitnehmer" —');
    leer();
    t('wird der folgende Arbeitsvertrag geschlossen:');

    h('§ 1 Beginn des Arbeitsverhältnisses');
    t(`Das Arbeitsverhältnis beginnt am ${beginn}. Es wird auf unbestimmte Zeit geschlossen.`);

    h('§ 2 Tätigkeit');
    t(`Der Arbeitnehmer wird als ${taetigkeit} eingestellt. Der Arbeitgeber ist berechtigt, dem Arbeitnehmer auch andere zumutbare Tätigkeiten zu übertragen, die seiner Vorbildung und seinen Fähigkeiten entsprechen.`);

    h('§ 3 Probezeit');
    t('Die ersten sechs Monate des Arbeitsverhältnisses gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis beiderseits mit einer Frist von zwei Wochen gekündigt werden.');

    h('§ 4 Arbeitszeit');
    t(`Die regelmäßige wöchentliche Arbeitszeit beträgt ${PLATZ} Stunden. Beginn und Ende der täglichen Arbeitszeit sowie die Lage der Pausen richten sich nach den betrieblichen Erfordernissen.`);

    h('§ 5 Vergütung');
    t(`Der Arbeitnehmer erhält eine monatliche Bruttovergütung in Höhe von ${PLATZ} EUR. Die Vergütung ist jeweils zum Ende eines Kalendermonats fällig und wird bargeldlos auf ein vom Arbeitnehmer zu benennendes Konto gezahlt.`);

    h('§ 6 Urlaub');
    t(`Der Arbeitnehmer hat Anspruch auf ${urlaub} Arbeitstage bezahlten Erholungsurlaub je Kalenderjahr. Der gesetzliche Mindesturlaubsanspruch bleibt hiervon unberührt.`);

    h('§ 7 Arbeitsverhinderung und Krankheit');
    t('Der Arbeitnehmer ist verpflichtet, jede Arbeitsverhinderung sowie deren voraussichtliche Dauer unverzüglich anzuzeigen. Bei einer Arbeitsunfähigkeit infolge Krankheit ist spätestens am dritten Kalendertag eine ärztliche Bescheinigung vorzulegen.');

    h('§ 8 Kündigung');
    t('Nach Ablauf der Probezeit gelten die gesetzlichen Kündigungsfristen. Jede Kündigung bedarf zu ihrer Wirksamkeit der Schriftform.');

    h('§ 9 Verschwiegenheit');
    t('Der Arbeitnehmer verpflichtet sich, über alle ihm im Rahmen seiner Tätigkeit bekannt gewordenen betrieblichen Angelegenheiten sowohl während als auch nach Beendigung des Arbeitsverhältnisses Stillschweigen zu bewahren.');

    h('§ 10 Nebenabreden und Schriftform');
    t('Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform. Mündliche Nebenabreden bestehen nicht. Dies gilt auch für die Aufhebung des Schriftformerfordernisses selbst.');

    h('§ 11 Salvatorische Klausel');
    t('Sollte eine Bestimmung dieses Vertrages unwirksam sein oder werden, so wird die Wirksamkeit der übrigen Bestimmungen hiervon nicht berührt. Die unwirksame Bestimmung ist durch eine wirksame zu ersetzen, die dem wirtschaftlichen Zweck am nächsten kommt.');

    leer();
    t(`${firmenOrt}, den ${PLATZ}`);
    leer();
    leer();
    t('_______________________________               _______________________________');
    t('Arbeitgeber                                                              Arbeitnehmer');
    leer();
    t('Hinweis: Dieses Dokument ist ein unverbindliches Muster und stellt keine Rechtsberatung dar. Vor der Verwendung ist der Vertrag an die konkrete Situation anzupassen und sollte arbeitsrechtlich geprüft werden. Alle mit [BITTE ERGÄNZEN] markierten Felder sind vor der Unterzeichnung auszufüllen.');

    const titel = `Arbeitsvertrag – ${anName}`;
    const docxBuffer = await buildDocx(titel, para);

    let fileBuffer: Buffer;
    let typ: 'pdf' | 'docx';
    let contentType: string;
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

    // Signierte URL für sofortigen Download (10 Min gültig)
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(saved.storage_path, 600);

    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null, name: saved.name, typ });
  } catch (err) {
    console.error('Arbeitsvertrag Fehler:', err);
    return NextResponse.json({ error: 'Arbeitsvertrag konnte nicht erzeugt werden.' }, { status: 500 });
  }
}
