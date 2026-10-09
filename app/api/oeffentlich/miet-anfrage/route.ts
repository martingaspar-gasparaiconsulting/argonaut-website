import { NextResponse } from 'next/server';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { anfragePruefen, frei, vorschau, euroText, mietPfad } from '@/lib/mietOnline';
import { wannText } from '@/lib/fahrzeugMieteV2';
import { mietDb, firmaZu, basisAdresse, betriebZuMietKennung, oeffentlicheFlotte, belegteZeiten, istKleinunternehmer } from '@/lib/mietOnlineLaden';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/miet-anfrage — Paket 294 · V2b Online-Anfrage
// ÖFFENTLICH. Formular „Unverbindlich anfragen" auf /mieten/<kennung>.
//  POST { k, fahrzeugId, von, bis, name, email, telefon, nachricht, datenschutz, firma_hp }
//    -> prüft, ob das Fahrzeug im Wunschzeitraum frei ist (nur ja/nein nach außen),
//       legt eine Anfrage an (miet_anfrage, Stand „neu"), Mail an den Betrieb,
//       Eingangsbestätigung an den Interessenten: UNVERBINDLICH — kein Vertrag,
//       keine Zahlung, keine Werbung. Erst der Betrieb reserviert.
// Betrieb NUR über die Kennung (Chef schaltet ein), Fahrzeug muss aktiv sein.
// Mengen-Deckel lib/drossel.ts, Spam-Falle firma_hp. Service-Rolle schreibt nur
// in miet_anfrage dieses Betriebs; die Nummer vergibt die Datenbank.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    const b = body as Record<string, unknown>;
    // Spam-Falle: verstecktes Feld gefüllt -> stumm „ok", nichts speichern.
    if (typeof b.firma_hp === 'string' && b.firma_hp.trim() !== '') return NextResponse.json({ ok: true });

    const k = typeof b.k === 'string' ? b.k.trim() : '';
    const pruef = anfragePruefen(b, Date.now());
    if (!pruef.ok) return NextResponse.json({ error: pruef.fehler }, { status: 400 });
    const d = pruef.daten;

    const db = mietDb();
    const ziel = d.email ?? d.telefon;
    const zuViel = await drossel(db, 'oeffentlich/miet-anfrage', { ip: drosselIp(req.headers), ziel: ziel ? `${k}|${ziel.toLowerCase()}` : null });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429 });

    const bt = await betriebZuMietKennung(db, k);
    if (!bt) return NextResponse.json({ error: 'Hier werden gerade keine Anfragen angenommen.' }, { status: 404 });
    const flotte = await oeffentlicheFlotte(db, bt.betrieb);
    const fz = flotte.find((f) => f.id === d.fahrzeug_id);
    if (!fz) return NextResponse.json({ error: 'Dieses Fahrzeug ist nicht mehr buchbar.' }, { status: 404 });

    const belegt = await belegteZeiten(db, bt.betrieb, fz.id);
    if (!frei(belegt, fz.id, d.von, d.bis)) {
      return NextResponse.json({ error: 'Im Wunschzeitraum ist das Fahrzeug leider schon vergeben. Bitte wählen Sie einen anderen Zeitraum oder ein anderes Fahrzeug.' }, { status: 409 });
    }
    const ku = await istKleinunternehmer(db, bt.betrieb);
    const v = vorschau(fz, d.von, d.bis, ku);

    const { data: neu, error } = await db.from('miet_anfrage').insert({
      owner_user_id: bt.betrieb, fahrzeug_id: fz.id, von: d.von, bis: d.bis, name: d.name, email: d.email, telefon: d.telefon,
      nachricht: d.nachricht, vorschau_cent: v?.endpreis_cent ?? null, datenschutz_am: new Date().toISOString(),
    }).select('nr').single();
    if (error || !neu) {
      console.error('miet-anfrage Speichern fehlgeschlagen:', error?.message);
      return NextResponse.json({ error: 'Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.' }, { status: 500 });
    }
    const nr = String((neu as { nr: string | null }).nr ?? '');

    const firma = await firmaZu(db, bt.betrieb);
    const zeitraum = `${wannText(d.von)} bis ${wannText(d.bis)}`;
    const preis = v ? `${euroText(v.endpreis_cent)} für ${v.tage} Miettag${v.tage === 1 ? '' : 'e'} (Vorschau, ohne Mehr-km, Tank und Zusatzfahrer)` : '';

    // 1) Benachrichtigung an den Betrieb (best effort — die Anfrage liegt schon sicher).
    if (firma.email) {
      const zeilen: [string, unknown][] = [
        ['Nummer', nr], ['Fahrzeug', fz.bezeichnung], ['Zeitraum', zeitraum], ['Preis', preis],
        ['Name', d.name], ['E-Mail', d.email], ['Telefon', d.telefon], ['Nachricht', d.nachricht],
      ];
      const tab = zeilen.filter(([, x]) => x).map(([k2, x]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7688;vertical-align:top;white-space:nowrap;">${escapeHtml(k2)}</td><td style="padding:4px 0;color:#1a2332;font-weight:600;">${escapeHtml(String(x)).replace(/\n/g, '<br>')}</td></tr>`).join('');
      const html = mailLayout('Neue Mietanfrage',
        `<p style="margin:0 0 14px;">Über Ihre Seite „Fahrzeuge mieten" ist eine unverbindliche Anfrage eingegangen. Sie liegt unter Fahrzeugvermietung → „📨 Anfragen". Das Fahrzeug war bei Eingang frei — reserviert ist es erst, wenn Sie die Anfrage übernehmen.</p>
         <table style="border-collapse:collapse;font-size:14px;">${tab}</table>
         <p style="margin:16px 0 0;color:#6b7688;font-size:13px;">Auf diese E-Mail antworten geht direkt an den Interessenten.</p>`);
      const r = await sendeMail({ an: firma.email, betreff: `Mietanfrage ${nr}: ${fz.bezeichnung}`, html, betriebId: bt.betrieb, ...(d.email ? { antwortAn: d.email } : {}) });
      if (!r.ok) console.error('miet-anfrage Betriebs-Mail fehlgeschlagen:', r.fehler);
    }

    // 2) Eingangsbestätigung an den Interessenten (best effort, keine Werbung, kein Vertrag).
    if (d.email) {
      const vorname = d.name.split(' ')[0];
      const link = basisAdresse() + mietPfad(k);
      const html = mailLayout('Ihre Mietanfrage ist eingegangen',
        `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>
         <p style="margin:0 0 14px;">vielen Dank für Ihre Anfrage zum Fahrzeug ${escapeHtml(fz.bezeichnung)} für ${escapeHtml(zeitraum)}${firma.name ? ' bei ' + escapeHtml(firma.name) : ''}.</p>
         <p style="margin:0 0 14px;"><b>Bitte beachten Sie: Ihre Anfrage ist unverbindlich und noch keine Buchung.</b> Wir prüfen sie und melden uns bei Ihnen. Erst mit unserer Bestätigung und dem Mietvertrag ist das Fahrzeug für Sie reserviert.</p>
         <p style="margin:0 0 14px;"><a href="${escapeHtml(link)}" style="color:#1a2332;">Zu unseren Mietfahrzeugen</a></p>
         <p style="margin:16px 0 0;">Beste Grüße${firma.name ? '<br>' + escapeHtml(firma.name) : ''}</p>`);
      try {
        const r = await sendeMail({ an: d.email, betreff: `Ihre Mietanfrage: ${fz.bezeichnung}`, html, betriebId: bt.betrieb, ...(firma.name ? { absenderName: firma.name } : {}), ...(firma.email ? { antwortAn: firma.email } : {}) });
        if (!r.ok) console.error('miet-anfrage Bestätigung fehlgeschlagen:', r.fehler);
      } catch (e) { console.error('miet-anfrage Bestätigung Fehler:', e instanceof Error ? e.message : 'unbekannt'); }
    }

    return NextResponse.json({ ok: true, nr });
  } catch (e) {
    console.error('miet-anfrage Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
