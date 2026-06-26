// app/api/leads/angebot-senden/route.ts
// ARGONAUT OS — V6: Angebot als PDF per Mail an den Lead senden.
// POST { id: <lead-id> }
//   1) User-Client: eingeloggt? Lead gehoert dem User? (gleiche Sicherheit wie angebot-pdf)
//   2) Vorbedingungen: angebot_entwurf vorhanden + angebot_status === 'Freigegeben' + Lead hat E-Mail
//   3) Firmenprofil laden (Admin-Client)
//   4) buildAngebotPdf(...) -> frische PDF (SavedDocument mit storage_path)
//   5) Admin-Client: createSignedUrl(storage_path, 300) -> 5 Minuten gueltig
//   6) POST an n8n-Webhook (N8N_ANGEBOT_SENDEN_URL): Empfaenger + PDF-Link + Dateiname
//   7) Bei Erfolg: leads.angebot_versendet_am = jetzt (Status bleibt 'Freigegeben'!)
//   -> { ok:true, versendet_am } | { ok:false, error }
//
// WICHTIG: angebot_status wird NICHT veraendert. Die Badge-Logik in LeadDetailClient
// zeigt 'Freigegeben' gruen; ein anderer Wert wuerde das Badge golden faerben und
// PDF-/Senden-Button (haengen an istFreigegeben) deaktivieren. Versand wird daher
// ausschliesslich ueber die Spalte angebot_versendet_am festgehalten.
// -----------------------------------------------------------------------------
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { buildAngebotPdf } from '@/lib/angebot-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'erstellte-dokumente';
// Wie lange die Signed-URL gueltig ist (Sekunden). 5 Minuten -> genug Zeit fuer n8n.
const SIGNED_URL_TTL = 300;

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

    // Webhook-URL pruefen (verhindert PDF-Erzeugung ins Leere, falls ENV fehlt)
    const webhookUrl = process.env.N8N_ANGEBOT_SENDEN_URL;
    if (!webhookUrl || webhookUrl.trim() === '' || webhookUrl.includes('PLATZHALTER')) {
      console.error('ANGEBOT-SENDEN: N8N_ANGEBOT_SENDEN_URL fehlt oder ist noch Platzhalter.');
      return NextResponse.json({ ok: false, error: 'Versand ist noch nicht konfiguriert (Webhook-URL fehlt).' }, { status: 503 });
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

    // 5) Signed-URL erzeugen (Bucket privat -> Admin-Client)
    const dateiname = anhangName(dokument.name, dokument.storage_path);
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(dokument.storage_path, SIGNED_URL_TTL, { download: dateiname });
    if (signErr || !signed) {
      console.error('ANGEBOT-SENDEN: createSignedUrl fehlgeschlagen', { signErr, storage_path: dokument.storage_path });
      return NextResponse.json({ ok: false, error: 'PDF-Link konnte nicht erstellt werden.' }, { status: 500 });
    }

    // 6) An n8n-Webhook schicken
    const n8nRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: lead.id,
        empfaenger_name: lead.name || 'Interessent',
        empfaenger_email: lead.email,
        firma_name: profil?.firma_name ?? '',
        pdf_url: signed.signedUrl,
        pdf_dateiname: dateiname,
      }),
    });
    if (!n8nRes.ok) {
      const txt = await n8nRes.text().catch(() => '');
      console.error('ANGEBOT-SENDEN: n8n-Webhook Fehler', n8nRes.status, txt);
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
