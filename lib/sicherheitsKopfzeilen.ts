// ============================================================================
// ARGONAUT OS · lib/sicherheitsKopfzeilen.ts — was jede Antwort mitschickt
//
// Anlass (Prüfbefund 15.09.2026): next.config.ts hatte KEINE einzige
// Sicherheits-Kopfzeile. Die schwerste Folge davon ist unauffällig:
//
//   Magic-Link- und Passwort-Wiederherstellungs-Token stehen in der ADRESSE.
//   Ohne Referrer-Policy schickt der Browser die vollständige Adresse als
//   `Referer` an jede fremde Seite mit, die von dort aus geladen oder verlinkt
//   wird — Schriftarten, Karten, ein angeklickter Link. Der Token steht dann im
//   Zugriffsprotokoll eines fremden Servers.
//
// BEWUSST NICHT HIER DRIN — das ist der wichtige Teil:
//
//   · frame-ancestors / X-Frame-Options.  Sie würden verhindern, dass ARGONAUT
//     in eine fremde Seite eingebettet wird. Genau das TUT ARGONAUT aber
//     absichtlich: der öffentliche Berater läuft seit 09.09.2026 auf fremden
//     Kundenwebsites (web_seiten.chat_domains), und der Vorführ-/Kiosk-Modus
//     lebt davon. Diese Kopfzeile gehört mit einer Ausnahmeliste gebaut und im
//     Browser nachgeprüft — als eigener Schritt, nicht nebenbei.
//
//   · Permissions-Policy.  Eine zu enge Regel schaltet das Diktat (Mikrofon)
//     und die Beleg-Erkennung (Kamera) ab. Auch das gehört geprüft, nicht
//     geraten.
//
//   · Eine vollständige Content-Security-Policy.  Sie bricht bei diesem Aufbau
//     zuverlässig irgendeine Seite, solange niemand jede Einbindung kennt.
//
// Was hier steht, ist rückwärtskompatibel: es kann keine Seite abschalten und
// keinen Nutzer aussperren.
//
// Rein und node-testbar. next.config.ts liest die Liste, damit sie prüfbar ist.
// ============================================================================

export type Kopfzeile = { key: string; value: string };

/**
 * HSTS ohne `includeSubDomains` und ohne `preload` — mit Absicht.
 *
 * `preload` ist praktisch unumkehrbar: die Domain landet in einer Liste, die in
 * die Browser einkompiliert wird. `includeSubDomains` würde jede künftige
 * Subdomain zu HTTPS zwingen, auch eine, die es noch gar nicht gibt. Beides
 * bringt hier wenig, weil Vercel ohnehin nur über HTTPS ausliefert — und beides
 * wäre im Fehlerfall schwer zurückzunehmen. Zwei Jahre Gültigkeit genügen.
 */
const HSTS = 'max-age=63072000';

export const SICHERHEITS_KOPFZEILEN: Kopfzeile[] = [
  // Verhindert, dass die vollständige Adresse (mit Token) an fremde Server geht.
  // Bei eigenen Seiten bleibt der volle Pfad erhalten, die eigene Auswertung
  // funktioniert also weiter; nach draußen geht nur noch der nackte Ursprung.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Der Browser soll den vom Server genannten Inhaltstyp glauben und nicht
  // selbst raten. Ohne das kann eine hochgeladene Datei als Skript ausgeführt
  // werden, obwohl sie als Text ausgeliefert wurde.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Nur noch über HTTPS sprechen. Siehe Kommentar oben zu den Zusätzen.
  { key: 'Strict-Transport-Security', value: HSTS },
];

/** Die Kopfzeilen im Format, das next.config.ts in `headers()` erwartet. */
export function kopfzeilenRegel(): { source: string; headers: Kopfzeile[] } {
  return { source: '/:pfad*', headers: SICHERHEITS_KOPFZEILEN };
}

/** Steht diese Kopfzeile in der Liste? (für die Tests und fürs Nachsehen) */
export function kopfzeile(key: string): string | null {
  const t = String(key ?? '').toLowerCase();
  const treffer = SICHERHEITS_KOPFZEILEN.find((k) => k.key.toLowerCase() === t);
  return treffer ? treffer.value : null;
}
