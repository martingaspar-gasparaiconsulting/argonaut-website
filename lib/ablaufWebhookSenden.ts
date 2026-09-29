// ============================================================================
// ARGONAUT OS · lib/ablaufWebhookSenden.ts — Webhook wirklich senden (Paket 167)
//
// NUR SERVER. Sendet eine Meldung per https POST — mit drei Sperren:
//   1. Die geschriebene Adresse ist vorher geprüft (lib/ablaufWebhookPruefung).
//   2. Die AUFGELÖSTE Adresse wird beim Verbinden noch einmal geprüft
//      (eigene lookup-Funktion): Ein Name, der im DNS auf 127.0.0.1 oder den
//      Metadaten-Dienst zeigt („DNS-Rebinding"), wird nicht verbunden.
//   3. Keine Weiterleitungen (https.request folgt nie), 10 Sekunden Zeitlimit,
//      Antwort wird nur bis 2 KB gelesen und nie gespeichert.
// ============================================================================

import https from 'node:https';
import dns from 'node:dns';
import type { LookupFunction } from 'node:net';
import { pruefeAufgeloesteIp } from './adressPruefung';

export type WebhookErgebnis = { ok: boolean; status: number | null; meldung: string };

/** DNS-Auflösung mit Prüfung jeder gelieferten Adresse. */
export const gepruefterLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, adressen) => {
    if (err) { (callback as (e: NodeJS.ErrnoException | null, a: string, f: number) => void)(err, '', 4); return; }
    const liste = (Array.isArray(adressen) ? adressen : []) as dns.LookupAddress[];
    const schlecht = liste.find((a) => !pruefeAufgeloesteIp(a.address).erlaubt);
    if (liste.length === 0 || schlecht) {
      const e = new Error(schlecht ? `Adresse zeigt ins interne Netz (${schlecht.address}) — nicht verbunden.` : 'Adresse nicht auflösbar.') as NodeJS.ErrnoException;
      e.code = 'EGESPERRT';
      (callback as (e: NodeJS.ErrnoException | null, a: string, f: number) => void)(e, '', 4);
      return;
    }
    const opts = options as dns.LookupOptions;
    if (opts && opts.all) (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, liste);
    else (callback as (e: null, a: string, f: number) => void)(null, liste[0].address, liste[0].family);
  });
};

export function sendeWebhook(url: string, koepfe: Record<string, string>, inhalt: string, zeitlimitMs = 10000): Promise<WebhookErgebnis> {
  return new Promise((resolve) => {
    let fertig = false;
    const ende = (e: WebhookErgebnis) => { if (!fertig) { fertig = true; resolve(e); } };
    let u: URL;
    try { u = new URL(url); } catch { ende({ ok: false, status: null, meldung: 'Adresse unlesbar' }); return; }
    if (u.protocol !== 'https:') { ende({ ok: false, status: null, meldung: 'Nur https' }); return; }
    const req = https.request(u, {
      method: 'POST',
      headers: { ...koepfe, 'content-length': String(Buffer.byteLength(inhalt)) },
      lookup: gepruefterLookup,
      timeout: zeitlimitMs,
    }, (res) => {
      let gelesen = 0;
      res.on('data', (stueck: Buffer) => { gelesen += stueck.length; if (gelesen > 2048) res.destroy(); });
      res.on('end', () => {
        const st = res.statusCode ?? 0;
        ende({ ok: st >= 200 && st < 300, status: st, meldung: st >= 200 && st < 300 ? `Antwort ${st}` : `Empfänger antwortet ${st}${st >= 300 && st < 400 ? ' (Weiterleitungen werden nicht verfolgt)' : ''}` });
      });
      res.on('close', () => { const st = res.statusCode ?? 0; ende({ ok: st >= 200 && st < 300, status: st, meldung: `Antwort ${st}` }); });
    });
    req.on('timeout', () => { req.destroy(new Error('Zeitlimit überschritten')); });
    req.on('error', (e) => ende({ ok: false, status: null, meldung: e.message.slice(0, 200) }));
    req.end(inhalt);
  });
}
