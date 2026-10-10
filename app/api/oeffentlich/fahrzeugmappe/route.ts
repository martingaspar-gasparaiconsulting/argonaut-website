import { NextResponse } from 'next/server';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { kennungGueltig } from '@/lib/kfzAnkauf';
import {
  MAPPE_BUCKET, angabenBereinigen, anzahlJeFach, dateiPruefen, istUuid, mappePfad, platzFrei, pruefungSauber, tokenGueltig,
} from '@/lib/fahrzeugMappe';
import {
  ansichtLinks, betriebZuKennung, dateienDerMappe, mappeDb, mappeZuToken, objekteLoeschen, objektGroesse, tokenHash,
} from '@/lib/fahrzeugMappeServer';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/fahrzeugmappe — Paket 305 · FM1 Fahrzeugmappe
//
// ÖFFENTLICH, aber nur mit dem persönlichen Link-Schlüssel des Verkäufers
// (Body: k = Kennung des Autohauses, token = Schlüssel). Aktionen:
//   laden      Stand der Mappe: Angaben, Dateien mit kurz gültigen Ansichts-Links
//   speichern  Angaben zwischenspeichern (nur Entwurf)
//   ziel       Platz für eine Datei reservieren -> signierter Upload-Link.
//              Die Datei geht direkt vom Handy in den privaten Ordner — so
//              passen auch Videos bis 50 MB (über den Server gingen nur 4,5 MB).
//              Fächer mit einem Platz (z. B. „Tacho") werden beim Melden ersetzt.
//   fertig     Upload melden: der Server sieht nach, ob die Datei wirklich
//              daliegt und wie groß sie ist; erst dann zählt sie
//   loeschen   Datei entfernen (nur Entwurf) — Ordner und Eintrag
// Der Betrieb kommt nur aus der Kennung, die Mappe nur über Betrieb + Prüfwert.
// Deckel je Absender und je Mappe (lib/drossel.ts).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });
const JA = (daten: Record<string, unknown>) => NextResponse.json(daten, { headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return KEIN(400, 'Ungültige Anfrage.');
    const k = typeof b.k === 'string' ? b.k.trim() : '';
    const token = b.token;
    if (!kennungGueltig(k) || !tokenGueltig(token)) return KEIN(404, 'Diese Mappe gibt es nicht.');
    const db = mappeDb();
    const zuViel = await drossel(db, 'oeffentlich/fahrzeugmappe', { ip: drosselIp(req.headers), ziel: tokenHash(token) });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
    const betrieb = await betriebZuKennung(db, k);
    if (!betrieb) return KEIN(404, 'Das Autohaus nimmt gerade keine Fahrzeugmappen an.');
    const mappe = await mappeZuToken(db, betrieb, token);
    if (!mappe) return KEIN(404, 'Diese Mappe gibt es nicht (mehr).');
    const entwurf = mappe.status === 'entwurf';
    const aktion = String(b.aktion ?? '');

    if (aktion === 'laden') {
      const dateien = (await dateienDerMappe(db, mappe.id, betrieb)).filter((d) => d.status === 'fertig');
      const links = entwurf ? await ansichtLinks(db, dateien.map((d) => d.pfad), 1800) : {};
      return JA({
        status: mappe.status, wunsch: mappe.wunsch, eingereicht_am: mappe.eingereicht_am,
        angaben: entwurf ? angabenBereinigen(mappe.angaben) : {},
        dateien: dateien.map((d) => ({
          id: d.id, fach: d.fach, art: d.art, mime: d.mime, bytes: d.bytes, beschreibung: d.beschreibung,
          pruefung: pruefungSauber(d.pruefung), url: links[d.pfad] ?? null,
        })),
      });
    }

    if (!entwurf) return KEIN(409, 'Diese Mappe ist schon beim Autohaus. Änderungen gehen nicht mehr.');

    if (aktion === 'speichern') {
      const angaben = angabenBereinigen(b.angaben);
      const wunsch = angaben.wunsch === 'inzahlungnahme' ? 'inzahlungnahme' : 'verkauf';
      const { error } = await db.from('kfz_mappe').update({ angaben, wunsch }).eq('id', mappe.id).eq('owner_user_id', betrieb).eq('status', 'entwurf');
      if (error) return KEIN(500, 'Zwischenspeichern hat nicht geklappt.');
      return JA({ ok: true });
    }

    if (aktion === 'ziel') {
      const p = dateiPruefen({ fach: b.fach, mime: b.mime, bytes: b.bytes });
      if (!p.ok) return KEIN(400, p.fehler);
      const alle = await dateienDerMappe(db, mappe.id, betrieb);
      // Liegengebliebene Reservierungen (Upload abgebrochen, Link nach 2 Stunden ungültig) wegräumen
      const grenze = Date.now() - 2 * 3600 * 1000;
      const abgelaufen = alle.filter((d) => d.status === 'reserviert' && Date.parse(d.erstellt_am) < grenze);
      if (abgelaufen.length) {
        await objekteLoeschen(db, abgelaufen.map((d) => d.pfad));
        await db.from('kfz_mappe_datei').delete().in('id', abgelaufen.map((d) => d.id)).eq('mappe_id', mappe.id);
      }
      const aktiv = alle.filter((d) => !abgelaufen.includes(d));
      // Laufende Uploads zählen mit — sonst ließe sich ein Fach durch gleichzeitiges Hochladen überfüllen.
      const platz = platzFrei(p.fach, anzahlJeFach(aktiv.map((d) => ({ fach: d.fach })))[p.fach.key] ?? 0, aktiv.length);
      if (!platz.ok) return KEIN(409, platz.fehler);
      const id = crypto.randomUUID();
      const pfad = mappePfad(betrieb, mappe.id, id, p.endung);
      if (!pfad) return KEIN(500, 'Interner Fehler.');
      const beschreibung = typeof b.beschreibung === 'string' ? b.beschreibung.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) || null : null;
      const dateiname = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001f\u007f/\\]/g, ' ').trim().slice(0, 120) || null : null;
      const { error } = await db.from('kfz_mappe_datei').insert({
        id, owner_user_id: betrieb, mappe_id: mappe.id, fach: p.fach.key, art: p.fach.art, pfad, mime: p.mime,
        bytes: p.bytes, dateiname, beschreibung, pruefung: pruefungSauber(b.pruefung), status: 'reserviert',
      });
      if (error) {
        console.error('fahrzeugmappe ziel:', error.message);
        return KEIN(409, /70/.test(error.message) ? 'Die Mappe ist voll.' : 'Die Datei kann gerade nicht angenommen werden.');
      }
      const { data: up, error: upErr } = await db.storage.from(MAPPE_BUCKET).createSignedUploadUrl(pfad);
      if (upErr || !up?.signedUrl) {
        await db.from('kfz_mappe_datei').delete().eq('id', id);
        return KEIN(500, 'Hochladen ist gerade nicht möglich. Bitte versuchen Sie es gleich noch einmal.');
      }
      return JA({ id, url: up.signedUrl, mime: p.mime });
    }

    if (aktion === 'fertig') {
      if (!istUuid(b.id)) return KEIN(400, 'Ungültige Datei.');
      const { data } = await db.from('kfz_mappe_datei').select('id, pfad, mime, status, fach')
        .eq('id', b.id).eq('mappe_id', mappe.id).eq('owner_user_id', betrieb).maybeSingle();
      const d = data as { id: string; pfad: string; mime: string; status: string; fach: string } | null;
      if (!d) return KEIN(404, 'Datei nicht gefunden.');
      const groesse = await objektGroesse(db, d.pfad);
      if (!groesse) return KEIN(409, 'Die Datei ist nicht angekommen. Bitte noch einmal versuchen.');
      const p = dateiPruefen({ fach: d.fach, mime: d.mime, bytes: groesse });
      if (!p.ok) {
        await objekteLoeschen(db, [d.pfad]);
        await db.from('kfz_mappe_datei').delete().eq('id', d.id);
        return KEIN(413, p.fehler);
      }
      if (d.status !== 'fertig') {
        const { error } = await db.from('kfz_mappe_datei').update({ status: 'fertig', bytes: groesse }).eq('id', d.id);
        if (error) return KEIN(500, 'Die Datei konnte nicht übernommen werden.');
      }
      // Fächer mit einem Platz: das neue Foto ersetzt das alte — erst JETZT, wo das neue sicher da ist.
      if (p.fach.max === 1) {
        const vorher = (await dateienDerMappe(db, mappe.id, betrieb)).filter((x) => x.fach === d.fach && x.id !== d.id);
        if (vorher.length) {
          await objekteLoeschen(db, vorher.map((x) => x.pfad));
          await db.from('kfz_mappe_datei').delete().in('id', vorher.map((x) => x.id)).eq('mappe_id', mappe.id);
        }
      }
      const links = await ansichtLinks(db, [d.pfad], 1800);
      return JA({ ok: true, url: links[d.pfad] ?? null, bytes: groesse });
    }

    if (aktion === 'loeschen') {
      if (!istUuid(b.id)) return KEIN(400, 'Ungültige Datei.');
      const { data } = await db.from('kfz_mappe_datei').select('id, pfad')
        .eq('id', b.id).eq('mappe_id', mappe.id).eq('owner_user_id', betrieb).maybeSingle();
      const d = data as { id: string; pfad: string } | null;
      if (!d) return JA({ ok: true });
      await objekteLoeschen(db, [d.pfad]);
      const { error } = await db.from('kfz_mappe_datei').delete().eq('id', d.id);
      if (error) return KEIN(500, 'Löschen hat nicht geklappt.');
      return JA({ ok: true });
    }

    return KEIN(400, 'Unbekannte Aktion.');
  } catch (e) {
    console.error('fahrzeugmappe Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Interner Fehler.');
  }
}
