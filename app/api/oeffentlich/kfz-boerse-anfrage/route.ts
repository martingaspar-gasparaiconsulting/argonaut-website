import { NextResponse } from 'next/server';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { berlinTag } from '@/lib/aktivitaeten';
import { naechsteNr, startFaellig } from '@/lib/kfzAnfrage';
import { anfrageEingabePruefen, fahrzeugName, idGueltig, kennungGueltig, preisText, boersePfad } from '@/lib/kfzBoerse';
import { basisAdresse, betriebZuKennung, boerseDb, firmaZu, sichtbaresFahrzeug } from '@/lib/kfzBoerseLaden';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/kfz-boerse-anfrage — Paket 272 · K11a Fahrzeugbörse
// ÖFFENTLICH. Anfrage-Formular auf der Detailseite eines Fahrzeugs der
// eigenen Fahrzeugbörse eines Kfz-Betriebs.
//  POST { k, id, name, email, telefon, wunsch, nachricht, datenschutz }
//    -> legt eine Anfrage (Quelle „Webseite", Stand „Neu", nächster Kontakt
//       heute) am Fahrzeug an; Mail an den Betrieb, Eingangsbestätigung an
//       den Interessenten (keine Werbung, keine Serie — eigene Tabelle kfz_anfrage).
// Betrieb NUR über die Kennung (Chef schaltet die Börse ein), Fahrzeug muss
// dort sichtbar sein. Mengen-Deckel lib/drossel.ts, Spam-Falle firma_hp.
// Service-Role umgeht RLS; geschrieben wird nur in kfz_anfrage dieses Betriebs.
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
    const id = typeof b.id === 'string' ? b.id.trim() : '';
    if (!kennungGueltig(k) || !idGueltig(id)) return NextResponse.json({ error: 'Fahrzeug nicht gefunden.' }, { status: 404 });

    const pruef = anfrageEingabePruefen(b);
    if (!pruef.ok) return NextResponse.json({ error: pruef.fehler }, { status: 400 });
    const d = pruef.daten;

    const db = boerseDb();
    const ziel = d.email ?? d.tel;
    const zuViel = await drossel(db, 'oeffentlich/kfz-boerse-anfrage', { ip: drosselIp(req.headers), ziel: ziel ? `${k}|${id}|${ziel.toLowerCase()}` : null });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429 });

    const bt = await betriebZuKennung(db, k);
    if (!bt) return NextResponse.json({ error: 'Diese Fahrzeugbörse nimmt gerade keine Anfragen an.' }, { status: 404 });
    const fz = await sichtbaresFahrzeug(db, bt.betrieb, id);
    if (!fz) return NextResponse.json({ error: 'Dieses Fahrzeug ist nicht mehr verfügbar.' }, { status: 404 });

    const heute = berlinTag(new Date().toISOString());
    let nr = '';
    let gespeichert = false;
    for (let versuch = 0; versuch < 2 && !gespeichert; versuch++) {
      const { data: nrs } = await db.from('kfz_anfrage').select('nr').eq('owner_user_id', bt.betrieb);
      nr = naechsteNr('A', (((nrs as unknown) as { nr: string | null }[]) ?? []).map((x) => x.nr));
      const { error } = await db.from('kfz_anfrage').insert({
        owner_user_id: bt.betrieb, bestand_id: id, nr, quelle: 'website', status: 'neu',
        name: d.name, tel: d.tel, email: d.email, nachricht: d.nachricht,
        faellig_am: startFaellig('website', heute), erstellt_von: null,
      });
      if (!error) gespeichert = true;
      else if (versuch === 1) {
        console.error('kfz-boerse-anfrage Speichern fehlgeschlagen:', error.message);
        return NextResponse.json({ error: 'Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.' }, { status: 500 });
      }
    }

    const firma = await firmaZu(db, bt.betrieb);
    const fahrzeug = fahrzeugName(fz.f);
    const link = basisAdresse() + boersePfad(k, id);

    // 1) Benachrichtigung an den Betrieb (best effort — die Anfrage liegt schon sicher).
    if (firma.email) {
      const zeilen: [string, unknown][] = [
        ['Nummer', nr], ['Fahrzeug', fahrzeug + (fz.f.interne_nr ? ` (${fz.f.interne_nr})` : '')], ['Preis', preisText(fz.f.vk_brutto)],
        ['Name', d.name], ['E-Mail', d.email], ['Telefon', d.tel], ['Nachricht', d.nachricht],
      ];
      const tab = zeilen.filter(([, v]) => v).map(([k2, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7688;vertical-align:top;white-space:nowrap;">${escapeHtml(k2)}</td><td style="padding:4px 0;color:#1a2332;font-weight:600;">${escapeHtml(String(v)).replace(/\n/g, '<br>')}</td></tr>`).join('');
      const html = mailLayout('Neue Anfrage aus Ihrer Fahrzeugbörse',
        `<p style="margin:0 0 14px;">Über Ihre Fahrzeugbörse hat jemand zu einem Fahrzeug angefragt. Die Anfrage liegt unter „Anfragen und Suchaufträge" mit dem Stand „Neu", nächster Kontakt heute.</p>
         <table style="border-collapse:collapse;font-size:14px;">${tab}</table>
         <p style="margin:16px 0 0;color:#6b7688;font-size:13px;">Auf diese E-Mail antworten geht direkt an den Interessenten.</p>`);
      const r = await sendeMail({ an: firma.email, betreff: `Fahrzeug-Anfrage ${nr}: ${fahrzeug}`, html, betriebId: bt.betrieb, ...(d.email ? { antwortAn: d.email } : {}) });
      if (!r.ok) console.error('kfz-boerse-anfrage Betriebs-Mail fehlgeschlagen:', r.fehler);
    }

    // 2) Eingangsbestätigung an den Interessenten (best effort, keine Werbung).
    if (d.email) {
      const vorname = d.name.split(' ')[0];
      const html = mailLayout('Ihre Anfrage ist eingegangen',
        `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>
         <p style="margin:0 0 14px;">vielen Dank für Ihre Anfrage zum Fahrzeug ${escapeHtml(fahrzeug)}${firma.name ? ' bei ' + escapeHtml(firma.name) : ''}. Wir melden uns so schnell wie möglich bei Ihnen.</p>
         <p style="margin:0 0 14px;"><a href="${escapeHtml(link)}" style="color:#1a2332;">Zum Fahrzeug</a></p>
         <p style="margin:16px 0 0;">Beste Grüße${firma.name ? '<br>' + escapeHtml(firma.name) : ''}</p>`);
      try {
        const r = await sendeMail({ an: d.email, betreff: `Ihre Anfrage: ${fahrzeug}`, html, betriebId: bt.betrieb, ...(firma.name ? { absenderName: firma.name } : {}), ...(firma.email ? { antwortAn: firma.email } : {}) });
        if (!r.ok) console.error('kfz-boerse-anfrage Bestätigung fehlgeschlagen:', r.fehler);
      } catch (e) { console.error('kfz-boerse-anfrage Bestätigung Fehler:', e instanceof Error ? e.message : 'unbekannt'); }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('kfz-boerse-anfrage Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
