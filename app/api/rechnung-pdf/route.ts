import { NextRequest, NextResponse } from 'next/server';
import { steuerGruppen, weichtAb, satzText, type SteuerPosten } from '../../dashboard/_components/steuerLogik';
import { girocodeVonDaten } from '../../../lib/girocode';
import { createClient } from '@/lib/supabase-server';
import { baueBezahllink } from '@/lib/bezahllink';
import type { IntegrationDatensatz } from '@/lib/konnektoren';
import { baueMarke, CI_SPALTEN, type CiRoh } from '@/lib/markeCi';
// PUNKT 54 (21.09.2026): die Geldlogik der Schlussrechnung kommt aus der
// getesteten Bibliothek; hier wird nur noch daraus HTML gemacht.
import { baueSchlussrechnung, type AbschlagPosten } from '@/lib/abschlagsrechnung';

export const runtime = 'nodejs';

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · R5 — Rechnungs-PDF (§14 UStG)
// Rechnungsdaten (vom Client) -> HTML -> Gotenberg -> PDF.
// Rechtssichere Pflichtangaben; §19-Kleinunternehmer-Fall berücksichtigt.
// Absenderdaten kommen als "aussteller"-Objekt vom Client (Nahtstelle zu
// den Firmen-Einstellungen; Platzhalter, solange Felder leer sind).
//
// R5.1 — Steuerausweis nach Steuersätzen (§14 Abs. 4 Nr. 7 + 8 UStG):
// Der Summenblock schlüsselt das Entgelt nach Steuersätzen auf. Die
// Steuer wird je Gruppe auf die Gruppensumme gerechnet (steuerLogik.ts).
// Weichen die gespeicherten Summen davon ab, wird das SICHTBAR gemacht —
// niemals stillschweigend überschrieben.
// ============================================================

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function geld(n: any, waehrung = 'EUR'): string {
  const wert = Number(n) || 0;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: waehrung || 'EUR' }).format(wert);
  } catch {
    return wert.toFixed(2) + ' ' + (waehrung || 'EUR');
  }
}

function zahl(n: any): string {
  const wert = Number(n) || 0;
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert);
}

function datumDe(d: any): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

// Platzhalter, wenn ein Pflicht-Absenderfeld noch nicht hinterlegt ist
function pflicht(wert: any, hinweis: string): string {
  const s = String(wert ?? '').trim();
  return s ? esc(s) : `<span class="warn">⚠ ${esc(hinweis)}</span>`;
}

// Wie pflicht(), aber wandelt Zeilenumbrüche in <br> (für mehrzeilige Anschrift)
function pflichtMehrzeilig(wert: any, hinweis: string): string {
  const s = String(wert ?? '').trim();
  if (!s) return `<span class="warn">⚠ ${esc(hinweis)}</span>`;
  return esc(s).replace(/\n/g, '<br>');
}

/** Nettobetrag einer Position — gespeicherter Wert schlägt die Rechnung. */
function positionNetto(p: any): number {
  if (p?.gesamt_netto != null) return Number(p.gesamt_netto) || 0;
  return (Number(p?.menge) || 0) * (Number(p?.einzelpreis) || 0);
}

function baueHtml(rechnung: any, positionen: any[], kontaktName: string, firmaName: string, aussteller: any, bezahllink: { url: string; anbieter: string } | null = null, ci: any = null, abschlaege: AbschlagPosten[] = []): string {
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const waehrung = rechnung?.waehrung || 'EUR';
  const klein = !!rechnung?.kleinunternehmer;

  // White-Label: Marke des Betriebs (Logo + Farben aus dem CI-Speicher web_ci).
  //
  // ▄▄▄ WARUM DAS SEIT 08.09.26 UEBER baueMarke LAEUFT ▄▄▄
  // Vorher landete hier ungeprueft, was im CI-Feld stand. Die Farben gehen in
  // einen <style>-Block und die Logo-Adresse in ein <img src="…"> — wer dort
  // etwas anderes als eine Hex-Farbe oder eine http-Adresse eintraegt, sieht
  // das auf der Rechnung. Beim Pruefen gefunden: ein Betrieb hatte seine
  // Strassenadresse im Logo-Feld stehen, was auf jeder seiner Rechnungen ein
  // kaputtes Bild-Symbol erzeugte.
  // Angebot, Mahnung und Auftragsbestaetigung nutzen baueMarke seit dem
  // 04.09. — ausgerechnet die Rechnung war die letzte ohne diesen Schutz.
  // Unbrauchbare Werte fallen jetzt still auf den Standard zurueck: das
  // Dokument sieht neutral aus statt kaputt.
  const marke = baueMarke(ci as CiRoh, aussteller?.name);
  const markePrimaer = marke.primaer;
  const markeAkzent = marke.akzent;
  const markeLogo = marke.logo;
  const markeName = marke.name;
  const theadText = marke.theadText;

  // Steuernummer ODER USt-IdNr genügt (§14) — wir zeigen, was vorhanden ist.
  const steuerZeile =
    (aussteller?.ust_idnr && String(aussteller.ust_idnr).trim())
      ? `USt-IdNr.: ${esc(aussteller.ust_idnr)}`
      : (aussteller?.steuernummer && String(aussteller.steuernummer).trim())
        ? `Steuernummer: ${esc(aussteller.steuernummer)}`
        : `<span class="warn">⚠ Steuernummer / USt-IdNr. ergänzen</span>`;

  const zeilenHtml = (positionen || []).map((p: any, i: number) => {
    const netto = positionNetto(p);
    return `
    <tr>
      <td class="nr">${i + 1}</td>
      <td>${esc(p.bezeichnung) || '&mdash;'}</td>
      <td class="r">${zahl(p.menge)}</td>
      <td class="c">${esc(p.einheit) || 'Stk'}</td>
      <td class="r">${geld(p.einzelpreis, waehrung)}</td>
      ${klein ? '' : `<td class="r">${zahl(p.mwst_satz)} %</td>`}
      <td class="r stark">${geld(netto, waehrung)}</td>
    </tr>`;
  }).join('');

  const spaltenZahl = klein ? 6 : 7;

  const empfaenger: string[] = [];
  if (firmaName) empfaenger.push(esc(firmaName));
  if (kontaktName) empfaenger.push(esc(kontaktName));
  if (aussteller?.empfaenger_anschrift) empfaenger.push(esc(aussteller.empfaenger_anschrift));
  const empfaengerHtml = empfaenger.length
    ? empfaenger.map((e) => `<div>${e}</div>`).join('')
    : '<div class="dim">— kein Empfänger zugeordnet —</div>';

  // ---------------------------------------------------------------
  // Summenblock
  // ---------------------------------------------------------------
  // § 19 Kleinunternehmer: kein Steuerausweis, ein einziger Betrag.
  // Sonst: Entgelt nach Steuersätzen aufgeschlüsselt (§ 14 Abs. 4 Nr. 7),
  // Steuerbetrag je Satz (Nr. 8).
  const posten: SteuerPosten[] = (positionen || []).map((p: any) => ({
    netto: positionNetto(p),
    satz: Number(p?.mwst_satz) || 0,
  }));
  const s = steuerGruppen(posten);
  const hatGruppen = !klein && s.gruppen.length > 0;

  let summenHtml: string;
  let abweichungHtml = '';

  if (klein) {
    summenHtml = `<div class="zeile brutto"><span>Rechnungsbetrag</span><span>${geld(rechnung?.brutto_summe ?? rechnung?.netto_summe, waehrung)}</span></div>`;
  } else if (!hatGruppen) {
    // Keine Positionen mitgeliefert — wir zeigen ehrlich die gespeicherten Werte.
    summenHtml = `
      <div class="zeile"><span class="label">Zwischensumme (netto)</span><span>${geld(rechnung?.netto_summe, waehrung)}</span></div>
      <div class="zeile"><span class="label">zzgl. Umsatzsteuer</span><span>${geld(rechnung?.mwst_summe, waehrung)}</span></div>
      <div class="zeile brutto"><span>Gesamtbetrag</span><span>${geld(rechnung?.brutto_summe, waehrung)}</span></div>`;
  } else if (s.gruppen.length === 1) {
    // Ein einziger Steuersatz — eine Zeile genügt, sie nennt Satz und Bemessungsgrundlage.
    const g = s.gruppen[0];
    summenHtml = `
      <div class="zeile"><span class="label">Zwischensumme (netto)</span><span>${geld(s.netto, waehrung)}</span></div>
      <div class="zeile"><span class="label">zzgl. ${satzText(g.satz)} % Umsatzsteuer auf ${geld(g.netto, waehrung)}</span><span>${geld(g.steuer, waehrung)}</span></div>
      <div class="zeile brutto"><span>Gesamtbetrag</span><span>${geld(s.brutto, waehrung)}</span></div>`;
  } else {
    // Mehrere Steuersätze — der Fall Brennholz (7 %) + Anfahrt (19 %).
    const gruppenZeilen = s.gruppen.map((g) => `
      <div class="zeile gruppe">
        <span class="label">${satzText(g.satz)} % auf ${geld(g.netto, waehrung)}</span>
        <span>${geld(g.steuer, waehrung)}</span>
      </div>`).join('');

    summenHtml = `
      <div class="zeile"><span class="label">Zwischensumme (netto)</span><span>${geld(s.netto, waehrung)}</span></div>
      <div class="steuerblock">
        <div class="steuerblock-titel">Umsatzsteuer nach Steuersätzen</div>
        ${gruppenZeilen}
      </div>
      <div class="zeile"><span class="label">Umsatzsteuer gesamt</span><span>${geld(s.steuer, waehrung)}</span></div>
      <div class="zeile brutto"><span>Gesamtbetrag</span><span>${geld(s.brutto, waehrung)}</span></div>`;
  }

  // ─────────────────────────────────────────────────────────────────
  // PUNKT 54 — § 13b, Abschlagsabsetzung, Einbehalt und Skonto
  // ALLES haengt an neuen Feldern. Sind sie leer, bleibt der Block leer
  // und der Summenblock oben steht unveraendert da wie bisher.
  // ─────────────────────────────────────────────────────────────────
  const reverseCharge = !klein && !!rechnung?.reverse_charge;
  const istSchluss = String(rechnung?.rechnungsart || '') === 'schluss';
  const istAbschlag = String(rechnung?.rechnungsart || '') === 'abschlag';

  if (reverseCharge) {
    // Ohne Steuerausweis, mit Pflichthinweis nach § 14a Abs. 5 UStG.
    summenHtml = `
      <div class="zeile"><span class="label">Zwischensumme (netto)</span><span>${geld(s.netto, waehrung)}</span></div>
      <div class="zeile"><span class="label">Umsatzsteuer</span><span>0,00 ${esc(waehrung)}</span></div>
      <div class="zeile brutto"><span>Gesamtbetrag</span><span>${geld(s.netto, waehrung)}</span></div>`;
  }

  let zusatzHtml = '';

  if (istSchluss) {
    const sr = baueSchlussrechnung({
      gesamt: s.gruppen.map((g) => ({ netto: g.netto, steuersatz: g.satz })),
      abschlaege,
      einbehalt: { prozent: rechnung?.einbehalt_prozent, basis: rechnung?.einbehalt_basis === 'netto' ? 'netto' : 'brutto' },
      skontoProzent: rechnung?.skonto_prozent,
      skontoTage: rechnung?.skonto_tage,
      skontoBasis: rechnung?.skonto_basis === 'gesamtleistung' ? 'gesamtleistung' : 'restbetrag',
      reverseCharge,
    });

    const absetzZeilen = sr.gruppen
      .filter((g) => g.abgesetztNetto !== 0 || g.abgesetztSteuer !== 0)
      .map((g) => `
        <div class="zeile gruppe">
          <span class="label">Entgelt ${geld(g.abgesetztNetto, waehrung)}${reverseCharge ? '' : ` zzgl. ${satzText(g.steuersatz)} % USt ${geld(g.abgesetztSteuer, waehrung)}`}</span>
          <span></span>
        </div>`).join('');

    zusatzHtml = `
      <div class="steuerblock">
        <div class="steuerblock-titel">Abzüglich bereits berechneter Abschlagszahlungen</div>
        ${absetzZeilen || '<div class="zeile gruppe"><span class="label">keine</span><span></span></div>'}
        <div class="zeile"><span class="label">Summe der Abschlagszahlungen</span><span>− ${geld(sr.abgesetztBrutto, waehrung)}</span></div>
      </div>
      <div class="zeile"><span class="label">Verbleibendes Entgelt (netto)</span><span>${geld(sr.restNetto, waehrung)}</span></div>
      ${reverseCharge ? '' : `<div class="zeile"><span class="label">zzgl. Umsatzsteuer</span><span>${geld(sr.restSteuer, waehrung)}</span></div>`}
      <div class="zeile brutto"><span>${sr.ueberzahlt ? 'Rückzahlung an Sie' : 'Verbleibender Rechnungsbetrag'}</span><span>${geld(Math.abs(sr.restBrutto), waehrung)}</span></div>
      ${sr.einbehalt > 0 ? `<div class="zeile"><span class="label">abzüglich Sicherheitseinbehalt${rechnung?.einbehalt_prozent ? ` (${satzText(Number(rechnung.einbehalt_prozent))} %)` : ''}</span><span>− ${geld(sr.einbehalt, waehrung)}</span></div>` : ''}
      ${sr.einbehalt > 0 ? `<div class="zeile brutto"><span>Jetzt zahlbar</span><span>${geld(sr.restBrutto - sr.einbehalt, waehrung)}</span></div>` : ''}`;
  } else if (Number(rechnung?.einbehalt_prozent) > 0) {
    // Auch eine normale oder Abschlagsrechnung kann einen Einbehalt tragen.
    const basisBetrag = rechnung?.einbehalt_basis === 'netto' ? s.netto : (reverseCharge ? s.netto : s.brutto);
    const einbehalt = Math.round(basisBetrag * (Number(rechnung.einbehalt_prozent) || 0)) / 100;
    zusatzHtml = `
      <div class="zeile"><span class="label">abzüglich Sicherheitseinbehalt (${satzText(Number(rechnung.einbehalt_prozent))} %)</span><span>− ${geld(einbehalt, waehrung)}</span></div>
      <div class="zeile brutto"><span>Jetzt zahlbar</span><span>${geld((reverseCharge ? s.netto : s.brutto) - einbehalt, waehrung)}</span></div>`;
  }

  // Gespeicherte Summe vs. ausgewiesene Summe — nie stillschweigend abweichen.
  if (hatGruppen) {
    const abw: string[] = [];
    if (weichtAb(rechnung?.netto_summe, s.netto)) abw.push(`Netto gespeichert ${geld(rechnung?.netto_summe, waehrung)}`);
    if (weichtAb(rechnung?.mwst_summe, s.steuer)) abw.push(`Umsatzsteuer gespeichert ${geld(rechnung?.mwst_summe, waehrung)}`);
    if (weichtAb(rechnung?.brutto_summe, s.brutto)) abw.push(`Brutto gespeichert ${geld(rechnung?.brutto_summe, waehrung)}`);
    if (abw.length) {
      abweichungHtml = `<div class="abweichung">
        <strong>⚠ Rundungsabweichung zu den gespeicherten Summen.</strong>
        Ausgewiesen ist der nach Steuersätzen berechnete Betrag (§ 14 UStG).
        ${esc(abw.join(' · '))}. Bitte die Rechnung einmal öffnen und speichern.
      </div>`;
    }
  }

  // PUNKT 54 — Pflichthinweise und Zahlungsbedingungen
  // Die Ueberschrift sagt, was das Dokument IST. Eine Abschlagsrechnung,
  // die schlicht "Rechnung" heisst, laedt zum Doppelzahlen ein.
  const dokumentTitel = istSchluss ? 'Schlussrechnung' : istAbschlag ? 'Abschlagsrechnung' : 'Rechnung';

  const rcHinweis = reverseCharge
    ? `<div class="hinweis"><strong>Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).</strong> Die Umsatzsteuer schulden Sie als Leistungsempfänger.</div>`
    : '';

  const skontoP = Number(rechnung?.skonto_prozent) || 0;
  const skontoT = Number(rechnung?.skonto_tage) || 0;
  const skontoHinweis = (skontoP > 0 && skontoT > 0)
    ? `<div class="hinweis">Bei Zahlung innerhalb von ${skontoT} Tagen gewähren wir ${satzText(skontoP)} % Skonto. Der Steuerbetrag bleibt hiervon zunächst unberührt (§ 17 Abs. 1 UStG).</div>`
    : '';

  const einbehaltHinweis = (Number(rechnung?.einbehalt_prozent) > 0 && rechnung?.einbehalt_bis)
    ? `<div class="hinweis">Der Sicherheitseinbehalt wird nach Ablauf der Gewährleistung bis zum ${datumDe(rechnung.einbehalt_bis)} zur Zahlung fällig.</div>`
    : '';

  const abschlagHinweis = istAbschlag
    ? `<div class="hinweis">Abschlagsrechnung für die bis heute erbrachten Leistungen (§ 632a BGB). Die Aufstellung der Leistungen entnehmen Sie den Positionen.</div>`
    : '';

  const kleinHinweis = klein
    ? `<div class="hinweis">Gemäß §19 UStG wird keine Umsatzsteuer berechnet.</div>`
    : '';

  // Zahlungsangaben — der zu zahlende Betrag ist der ausgewiesene.
  const zahlBetrag = klein
    ? (rechnung?.brutto_summe ?? rechnung?.netto_summe)
    : (hatGruppen ? s.brutto : rechnung?.brutto_summe);

  const bank = aussteller?.bank_iban
    ? `<div>Bitte überweisen Sie <strong>${geld(zahlBetrag, waehrung)}</strong> bis zum <strong>${datumDe(rechnung?.faelligkeitsdatum)}</strong> auf:</div>
       <div>IBAN: ${esc(aussteller.bank_iban)}${aussteller?.bank_bic ? ' &middot; BIC: ' + esc(aussteller.bank_bic) : ''}${aussteller?.bank_name ? ' (' + esc(aussteller.bank_name) + ')' : ''}</div>
       <div>Verwendungszweck: ${esc(rechnung?.rechnungsnummer) || ''}</div>`
    : `<div>Zahlbar bis <strong>${datumDe(rechnung?.faelligkeitsdatum)}</strong> ohne Abzug.</div>
       <div class="warn">⚠ Bankverbindung in den Einstellungen ergänzen</div>`;

  // GiroCode / EPC-QR: Kunde scannt mit Banking-App -> Überweisung vorausgefüllt.
  // Nur wenn IBAN + Betrag vorhanden UND die Rechnung noch nicht bezahlt ist.
  const bereitsBezahlt = !!rechnung?.bezahlt_am || rechnung?.zahlungsstatus === 'bezahlt';
  const giroSvg = bereitsBezahlt ? null : girocodeVonDaten({
    empfaenger: String(aussteller?.name || '').trim(),
    iban: String(aussteller?.bank_iban || ''),
    bic: aussteller?.bank_bic ? String(aussteller.bank_bic) : undefined,
    betrag: Number(zahlBetrag) || 0,
    verwendungszweck: String(rechnung?.rechnungsnummer || '').trim(),
  }, { groesse: 132 });

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0A1628; margin: 0; padding: 44px 52px; font-size: 12.5px; line-height: 1.55; }
  .warn { color: #b8860b; font-weight: bold; }

  .absender-mini { font-size: 10px; color: #5b6b80; border-bottom: 1px solid #e1e6ee; padding-bottom: 6px; margin-bottom: 20px; }

  .kopf { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .marke { color: ${markeAkzent}; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; }
  .logo { max-height: 52px; max-width: 210px; margin-bottom: 10px; display: block; }
  .aussteller { font-size: 11.5px; color: #0A1628; }
  .aussteller .name { font-weight: bold; font-size: 13px; }
  .aussteller .dim { color: #5b6b80; }
  h1 { font-size: 24px; margin: 4px 0 2px; color: ${markePrimaer}; }
  .nummer { color: #5b6b80; font-size: 13px; font-family: 'DejaVu Sans Mono', monospace; }

  .empf-zeile { display: flex; justify-content: space-between; gap: 24px; border-top: 3px solid ${markeAkzent}; padding-top: 20px; margin-top: 12px; margin-bottom: 24px; }
  .block { flex: 1; }
  .block .titel { font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; color: #8a99ad; font-weight: bold; margin-bottom: 6px; }
  .block .inhalt { border: 1px solid #e1e6ee; border-radius: 8px; padding: 12px 14px; min-height: 74px; }
  .block.rechts .inhalt { font-size: 12px; }
  .dim { color: #8a99ad; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead th { background: ${markePrimaer}; color: ${theadText}; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; padding: 9px 10px; text-align: left; }
  thead th.r { text-align: right; } thead th.c { text-align: center; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid #e8ecf3; vertical-align: top; }
  tbody td.r { text-align: right; } tbody td.c { text-align: center; } tbody td.nr { color: #8a99ad; width: 30px; }
  tbody td.stark { font-weight: bold; }

  .summen { margin-left: auto; width: 340px; margin-top: 14px; }
  .summen .zeile { display: flex; justify-content: space-between; padding: 6px 4px; font-size: 13px; }
  .summen .zeile.brutto { border-top: 2px solid ${markeAkzent}; margin-top: 4px; padding-top: 10px; font-size: 16px; font-weight: bold; color: #0A1628; }
  .summen .label { color: #5b6b80; }

  .steuerblock { background: #f4f6fa; border-radius: 6px; padding: 6px 8px; margin: 6px 0; }
  .steuerblock-titel { font-size: 9.5px; letter-spacing: 0.8px; text-transform: uppercase; color: #8a99ad; font-weight: bold; padding: 2px 4px 4px; }
  .summen .zeile.gruppe { padding: 3px 4px; font-size: 12px; }
  .summen .zeile.gruppe .label { color: #0A1628; }

  .abweichung { clear: both; margin-top: 14px; background: #fdf6e3; border-left: 4px solid #b8860b; padding: 10px 14px; border-radius: 6px; font-size: 11.5px; color: #6b5200; }

  .hinweis { clear: both; margin-top: 22px; background: #f4f6fa; border-left: 4px solid ${markeAkzent}; padding: 10px 14px; border-radius: 6px; font-size: 12px; }
  .zahlung { margin-top: 22px; background: #f4f6fa; border-left: 4px solid #00b3cc; padding: 12px 16px; border-radius: 6px; font-size: 12px; }
  .zahlung .titel { font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; color: #5b6b80; font-weight: bold; margin-bottom: 4px; }
  .zahlung .inhalt { display: flex; justify-content: space-between; align-items: center; gap: 18px; }
  .zahlung .ztext { flex: 1; }
  .giro { text-align: center; flex-shrink: 0; }
  .giro .qr { width: 132px; height: 132px; background: #fff; border: 1px solid #e1e6ee; border-radius: 8px; padding: 5px; }
  .giro .qr svg { display: block; width: 100%; height: 100%; }
  .giro .cap { font-size: 9.5px; color: #5b6b80; margin-top: 4px; line-height: 1.3; }
  .giro .cap b { color: #0A1628; }
  .zahlung .pay { margin-top: 12px; }
  .paybtn { display: inline-block; background: ${markePrimaer}; color: ${theadText}; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; font-size: 12.5px; }
  .notizen { margin-top: 18px; color: #5b6b80; font-size: 11.5px; }

  .fuss { margin-top: 40px; border-top: 1px solid #e1e6ee; padding-top: 12px; color: #8a99ad; font-size: 10.5px; text-align: center; }
</style></head><body>

  <div class="absender-mini">
    ${pflicht(aussteller?.name, 'Firmenname ergänzen')} &middot;
    ${pflicht(aussteller?.anschrift, 'Anschrift ergänzen')}
  </div>

  <div class="kopf">
    <div class="aussteller">
      ${markeLogo ? `<img src="${esc(markeLogo)}" alt="Logo" class="logo">` : ''}
      <div class="marke">${esc(dokumentTitel)}</div>
      <div class="name">${pflicht(aussteller?.name, 'Firmenname ergänzen')}</div>
      <div class="dim">${pflichtMehrzeilig(aussteller?.anschrift, 'Anschrift ergänzen')}</div>
      <div class="dim">${steuerZeile}</div>
      ${aussteller?.telefon || aussteller?.email ? `<div class="dim">${esc(aussteller?.telefon || '')}${aussteller?.telefon && aussteller?.email ? ' &middot; ' : ''}${esc(aussteller?.email || '')}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <h1>${esc(dokumentTitel)}</h1>
      <div class="nummer">${pflicht(rechnung?.rechnungsnummer, 'Nummer fehlt')}</div>
    </div>
  </div>

  <div class="empf-zeile">
    <div class="block">
      <div class="titel">Rechnungsempfänger</div>
      <div class="inhalt">${empfaengerHtml}</div>
    </div>
    <div class="block rechts">
      <div class="titel">Rechnungsdaten</div>
      <div class="inhalt">
        <div>Rechnungsdatum: <strong>${datumDe(rechnung?.rechnungsdatum)}</strong></div>
        <div>Leistungsdatum: ${datumDe(rechnung?.leistungsdatum)}</div>
        <div>Fällig bis: ${datumDe(rechnung?.faelligkeitsdatum)}</div>
        <div>Währung: ${esc(waehrung)}</div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>Bezeichnung</th>
        <th class="r">Menge</th>
        <th class="c">Einheit</th>
        <th class="r">Einzelpreis</th>
        ${klein ? '' : '<th class="r">MwSt</th>'}
        <th class="r">Netto</th>
      </tr>
    </thead>
    <tbody>
      ${zeilenHtml || `<tr><td colspan="${spaltenZahl}" class="dim" style="padding:16px;text-align:center;">Keine Positionen erfasst.</td></tr>`}
    </tbody>
  </table>

  <div class="summen">
    ${summenHtml}
    ${zusatzHtml}
  </div>

  ${abweichungHtml}
  ${rcHinweis}
  ${abschlagHinweis}
  ${skontoHinweis}
  ${einbehaltHinweis}

  ${kleinHinweis}

  <div class="zahlung">
    <div class="titel">Zahlungsangaben</div>
    <div class="inhalt">
      <div class="ztext">${bank}</div>
      ${giroSvg ? `<div class="giro"><div class="qr">${giroSvg}</div><div class="cap"><b>GiroCode</b><br>mit Banking-App scannen</div></div>` : ''}
    </div>
    ${bezahllink ? `<div class="pay"><a href="${esc(bezahllink.url)}" class="paybtn">💳 Jetzt online bezahlen${bezahllink.anbieter ? ` · ${esc(bezahllink.anbieter)}` : ''}</a></div>` : ''}
  </div>

  ${rechnung?.notizen ? `<div class="notizen">${esc(rechnung.notizen)}</div>` : ''}

  <div class="fuss">${markeName ? esc(markeName) + ' &middot; ' : ''}${heute}</div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rechnung = body?.rechnung;
    const positionen: any[] = Array.isArray(body?.positionen) ? body.positionen : [];
    const kontaktName: string = body?.kontaktName || '';
    const firmaName: string = body?.firmaName || '';
    const aussteller: any = body?.aussteller || {};
  const wantPdfa: boolean = body?.pdfa === true;

    if (!rechnung?.rechnungsnummer && !rechnung?.brutto_summe) {
      return NextResponse.json({ error: 'Rechnungsdaten fehlen.' }, { status: 400 });
    }

    // Online-Bezahllink (eigener Anbieter des Betriebs, serverseitig gelesen).
    let bezahllink: { url: string; anbieter: string } | null = null;
    try {
      if (!rechnung?.bezahlt_am && rechnung?.zahlungsstatus !== 'bezahlt') {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: zi } = await supabase.from('betrieb_integrationen')
            .select('typ, anbieter, config, aktiv').eq('owner_user_id', user.id).eq('typ', 'zahlung').maybeSingle();
          bezahllink = baueBezahllink(zi as IntegrationDatensatz | null, Number(rechnung?.brutto_summe) || 0);
        }
      }
    } catch { /* Bezahllink optional */ }

    // White-Label: CI des Betriebs (Logo + Farben) serverseitig laden (RLS-scoped).
    let ci: any = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('web_ci')
          .select(CI_SPALTEN)
          .limit(1);
        ci = (Array.isArray(data) && data[0]) || null;
      }
    } catch { /* CI optional — ohne CI neutrales Standardlayout */ }

    // PUNKT 54: die abgesetzten Abschlaege kommen SERVERSEITIG aus der
    // Datenbank, nicht aus dem Browser. Sie entscheiden ueber den Betrag,
    // den der Kunde ueberweist.
    let abschlaege: AbschlagPosten[] = [];
    if (String(rechnung?.rechnungsart || '') === 'schluss' && rechnung?.id) {
      try {
        const supabase = await createClient();
        const { data } = await supabase
          .from('rechnung_abschlaege')
          .select('nummer_kopie, datum_kopie, netto, steuersatz, steuer')
          .eq('schlussrechnung_id', rechnung.id);
        abschlaege = (Array.isArray(data) ? data : []).map((z: any) => ({
          nummer: z?.nummer_kopie || '',
          datum: z?.datum_kopie,
          netto: z?.netto,
          steuersatz: z?.steuersatz,
          steuer: z?.steuer,
        }));
      } catch {
        // Bewusst KEIN stiller Rueckfall auf "keine Abschlaege": ohne
        // Absetzung waere der ausgewiesene Betrag zu hoch. Stattdessen
        // bricht die PDF-Erstellung ab und sagt warum.
        return NextResponse.json(
          { error: 'Die abgesetzten Abschlagszahlungen konnten nicht geladen werden. Ohne sie waere der Rechnungsbetrag zu hoch - das PDF wurde deshalb nicht erstellt.' },
          { status: 503 },
        );
      }
    }

    const html = baueHtml(rechnung, positionen, kontaktName, firmaName, aussteller, bezahllink, ci, abschlaege);

    const gotenbergUrl = process.env.GOTENBERG_URL;
    const gUser = process.env.GOTENBERG_USER;
    const gPass = process.env.GOTENBERG_PASSWORD;
    if (!gotenbergUrl) return NextResponse.json({ error: 'PDF-Dienst nicht konfiguriert.' }, { status: 500 });

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop', '0.5');
    form.append('marginBottom', '0.5');
    form.append('printBackground', 'true'); // Marken-Hintergründe (Tabellenkopf, Farben) mitdrucken
  if (wantPdfa) form.append('pdfa', 'PDF/A-3b');

    const authHeader = (gUser && gPass) ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64') : '';
    const pdfResp = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`, {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : undefined,
      body: form,
    });
    if (!pdfResp.ok) {
      const t = await pdfResp.text();
      console.error('Rechnung Gotenberg Fehler:', pdfResp.status, t.slice(0, 200));
      return NextResponse.json({ error: 'PDF-Erstellung fehlgeschlagen.' }, { status: 502 });
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const basis = String(rechnung?.rechnungsnummer || 'Rechnung')
      .replace(/[^a-zA-Z0-9äöüÄÖÜ -]/g, '').replace(/\s+/g, '_').slice(0, 60);
    const art = String(rechnung?.rechnungsart || '');
    const vorsatz = art === 'schluss' ? 'Schlussrechnung' : art === 'abschlag' ? 'Abschlagsrechnung' : 'Rechnung';
    const dateiName = `${vorsatz}_${basis}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${dateiName}"`,
      },
    });
  } catch (e: any) {
    console.error('Rechnung-PDF Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
