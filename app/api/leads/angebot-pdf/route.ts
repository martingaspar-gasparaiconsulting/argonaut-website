import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { buildAngebotPdf } from '@/lib/angebot-pdf';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const id: string = body?.id;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Keine Lead-ID uebergeben.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
    }

    // Lead laden + Besitz pruefen
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, owner_user_id, name, email, telefon, angebot_entwurf, angebot_status')
      .eq('id', id)
      .single();
    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead nicht gefunden.' }, { status: 404 });
    }
    if (lead.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Lead.' }, { status: 403 });
    }

    // Vorbedingungen: Text vorhanden + freigegeben
    if (!lead.angebot_entwurf || lead.angebot_entwurf.trim() === '') {
      return NextResponse.json({ error: 'Kein Angebotstext vorhanden. Bitte zuerst einen Entwurf erzeugen.' }, { status: 400 });
    }
    if (lead.angebot_status !== 'Freigegeben') {
      return NextResponse.json({ error: 'Bitte das Angebot zuerst freigeben, bevor ein PDF erzeugt wird.' }, { status: 400 });
    }

    // Firmenprofil laden (eigene Zeile)
    const admin = createAdminClient();
    const { data: profil } = await admin
      .from('profiles')
      .select('firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_rechtsform, firma_registergericht, firma_hrb, firma_geschaeftsfuehrer, firma_ust_id, firma_steuernummer, firma_iban, firma_bank, firma_bic, firma_akzentfarbe')
      .eq('id', user.id)
      .single();

    const dokument = await buildAngebotPdf(profil ?? {}, lead, lead.angebot_entwurf, user.id);

    return NextResponse.json({ ok: true, dokument });
  } catch (err) {
    console.error('Angebot-PDF Fehler:', err);
    return NextResponse.json({ error: 'PDF konnte nicht erzeugt werden.' }, { status: 500 });
  }
}
