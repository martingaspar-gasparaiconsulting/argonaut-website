// app/api/leads/angebot-senden/route.ts
// ARGONAUT OS — F1: Angebot als PDF per Mail an den Lead senden — DIREKT ueber
// Resend (lib/mail.ts), ohne den frueheren n8n-Umweg.
// POST { id: <lead-id> }
//   1) User-Client: eingeloggt? Lead gehoert dem User? (gleiche Sicherheit wie angebot-pdf)
//   2) Vorbedingungen: angebot_entwurf vorhanden + angebot_status === 'Freigegeben' + Lead hat E-Mail
//   3) Firmenprofil laden (Admin-Client)
//   4) buildAngebotPdf(...) -> frische PDF (SavedDocument mit storage_path)
//   5) PDF-Bytes aus dem privaten Bucket laden (Admin-Client)
//   6) sendeMail(...): PDF als Anhang, im Namen der Kundenfirma (Kunden-Layout,
//      Antwort geht an die Firmen-Mail des Kontos)
//   7) Bei Erfolg: leads.angebot_versendet_am = jetzt (Status bleibt 'Freigegeben'!)
//   -> { ok:true, versendet_am } | { ok:false, error }
//
// WICHTIG: angebot_status wird NICHT veraendert. Die Badge-Logik in LeadDetailClient
// zeigt 'Freigegeben' gruen; ein anderer Wert wuerde das Badge golden faerben und
// PDF-/Senden-Button (haengen an istFreigegeben) deaktivieren. Versand wird daher
// ausschliesslich ueber die Spalte angebot_versendet_am festgehalten.
//
// FRUEHER (bis F1): Schritt 5/6 erzeugten eine Signed-URL und POSTeten sie an einen
// n8n-Webhook auf Hostinger (N8N_ANGEBOT_SENDEN_URL), der die Mail verschickte. Der
// Umweg stammte aus der Zeit des fiktiven Betriebs „Holzernte Schaefer". Alle anderen
// System-Mails laufen laengst direkt ueber Resend — jetzt auch diese. Der Anhang geht
// als echtes PDF mit (kein 5-Minuten-Link mehr).
// -----------------------------------------------------------------------------
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { buildAngebotPdf } from '@/lib/angebot-pdf';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'erstellte-dokumente';

// Sauberen Dateinamen fuer den Mail-Anhang bauen (analog Download-Route).
function anhangName(name: string | null, storagePath: string): string {
  let basis = name && name.trim() !== '' ? name.trim() : (storagePath.split('/').pop() || 'Angebot');
  basis = basis.replace(/^\d{10,}_/, '');           // Zeitstempel-Praefix entfernen
  basis = basis.replace(/\.(pdf|docx|xlsx|pptx)$/i, ''); // vorhandene Endung abschneiden
  basis = basis.replace(/[\/\\:*?"<>|]/g, '_').trim();   // unzulaessige Zeichen ersetzen
  if (basis === '') basis = 'Angebot';
  return basis + '.pdf';
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const id: string = body?.id;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ ok: false, error: 'Keine Lead-ID uebergeben.' }, { status: 400 });
    }

    // 1) Eingeloggten User ermitteln
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
    }

    // Lead laden + Besitz pruefen (RLS + expliziter Owner-Check wie in angebot-pdf)
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, owner_user_id, name, email, telefon, angebot_entwurf, angebot_status')
      .eq('id', id)
      .single();
    if (leadErr || !lead) {
      return NextResponse.json({ ok: false, error: 'Lead nicht gefunden.' }, { status: 404 });
    }
    if (lead.owner_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'Kein Zugriff auf diesen Lead.' }, { status: 403 });
    }

    // 2) Vorbedingungen
    if (!lead.angebot_entwurf || lead.angebot_entwurf.trim() === '') {
      return NextResponse.json({ ok: false, error: 'Kein Angebotstext vorhanden. Bitte zuerst einen Entwurf erzeugen.' }, { status: 400 });
    }
    if (lead.angebot_status !== 'Freigegeben') {
      return NextResponse.json({ ok: false, error: 'Bitte das Angebot zuerst freigeben, bevor es versendet wird.' }, { status: 400 });
    }
    if (!lead.email || lead.email.trim() === '') {
      return NextResponse.json({ ok: false, error: 'Dieser Lead hat keine E-Mail-Adresse. Versand nicht moeglich.' }, { status: 400 });
    }

    // 3) Firmenprofil laden (Admin-Client)
    const admin = createAdminClient();
    const { data: profil } = await admin
      .from('profiles')
      .select('firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_rechtsform, firma_registergericht, firma_hrb, firma_geschaeftsfuehrer, firma_ust_id, firma_steuernummer, firma_iban, firma_bank, firma_bic, firma_akzentfarbe')
      .eq('id', user.id)
      .single();

    // 4) Frische PDF erzeugen (liefert SavedDocument mit storage_path)
    const dokument = await buildAngebotPdf(profil ?? {}, lead, lead.angebot_entwurf, user.id);
    const dateiname = anhangName(dokument.name, dokument.storage_path);

    // 5) PDF-Bytes aus dem privaten Bucket laden (Admin-Client -> Buffer fuer den Anhang)
    const { data: pdfBlob, error: dlErr } = await admin.storage.from(BUCKET).download(dokument.storage_path);
    if (dlErr || !pdfBlob) {
      console.error('ANGEBOT-SENDEN: PDF-Download fehlgeschlagen', { dlErr, storage_path: dokument.storage_path });
      return NextResponse.json({ ok: false, error: 'PDF konnte nicht geladen werden.' }, { status: 500 });
    }
    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

    // 6) Mail direkt ueber Resend — im Namen der Kundenfirma, PDF als Anhang.
    const firma = (profil?.firma_name || '').trim() || 'Ihr Dienstleister';
    const firmaEmail = (profil?.firma_email || '').trim() || undefined;
    const anrede = lead.name && lead.name.trim() !== ''
      ? `Guten Tag ${escapeHtml(lead.name.trim())},`
      : 'Guten Tag,';
    const inhalt = `
      <p style="margin:0 0 14px;">${anrede}</p>
      <p style="margin:0 0 14px;">vielen Dank fuer Ihr Interesse. Im Anhang finden Sie unser Angebot als PDF-Dokument.</p>
      <p style="margin:0 0 14px;">Bei Rueckfragen erreichen Sie uns jederzeit — antworten Sie einfach auf diese E-Mail.</p>
      <p style="margin:0;">Mit freundlichen Gruessen<br><b>${escapeHtml(firma)}</b></p>
    `;
    const html = kundenMailLayout(firma, profil?.firma_akzentfarbe, 'Ihr Angebot', inhalt);

    const mail = await sendeMail({
      an: lead.email,
      betreff: `Ihr Angebot von ${firma}`,
      html,
      text: `${lead.name ? 'Guten Tag ' + lead.name + ',' : 'Guten Tag,'}\n\nvielen Dank fuer Ihr Interesse. Im Anhang finden Sie unser Angebot als PDF.\n\nMit freundlichen Gruessen\n${firma}`,
      absenderName: firma,
      antwortAn: firmaEmail,
      anhaenge: [{ dateiname, inhalt: pdfBuffer, typ: 'application/pdf' }],
    });
    if (!mail.ok) {
      console.error('ANGEBOT-SENDEN: Resend-Versand fehlgeschlagen', mail.fehler);
      return NextResponse.json({ ok: false, error: 'Versand fehlgeschlagen (Mail-Dienst nicht erreichbar).' }, { status: 502 });
    }

    // 7) Versand-Zeitstempel setzen (Status bleibt unangetastet 'Freigegeben')
    const versendetAm = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('leads')
      .update({ angebot_versendet_am: versendetAm })
      .eq('id', lead.id);
    if (updErr) {
      // Mail ist raus, nur der Zeitstempel klemmt -> nicht als Fehler werten, aber loggen.
      console.error('ANGEBOT-SENDEN: Zeitstempel-Update fehlgeschlagen (Mail wurde gesendet)', updErr);
    }

    return NextResponse.json({ ok: true, versendet_am: versendetAm });
  } catch (err) {
    console.error('ANGEBOT-SENDEN: Interner Fehler', err);
    return NextResponse.json({ ok: false, error: 'Angebot konnte nicht versendet werden.' }, { status: 500 });
  }
}
