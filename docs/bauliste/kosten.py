# (partner, listenpreis, annahme, lo, mid, hi, zahlt)
K=[
("Vercel (Hosting)","Pro 20 $/Monat inkl. 20 $ Guthaben; Flat Rate CDN: enthalten 1 Mio. Anfragen + 1 TB, Stufen 20 $ (10 Mio./50 TB), 100 $ (50 Mio.), 300 $ (150 Mio.); Rechenzeit Frankfurt 0,184 $/CPU-Std.","≈ 700 Nutzer ≈ 6 Mio. Anfragen → 20-$-Stufe; Engpass sind Anfragen, nicht TB (1 TB reicht für ≈ 80–100 Betriebe). Downloads nie über Vercel, direkt aus dem Speicher",30,80,170,"ARGONAUT"),
("Supabase (Datenbank, Speicher)","Pro 25 $ + Rechenleistung (Medium 60 $, Large 110 $, XL 210 $, 2XL 410 $; 10 $ Guthaben); Dateien 100 GB inkl., dann 0,0213 $/GB (1 TB ≈ 21 $); Datenbank 0,125 $/GB über 8 GB; Download 0,09 $/GB über 250 GB; Wiederherstellung auf Zeitpunkt 100 $ (nur Datenbank, nicht die Dateien)","Large, 30–40 GB Datenbank; Dateien: niedrig 2 TB, mittel 6 TB (Ø 150 GB je Betrieb nach Archiv-Umzug), hoch 40 TB (jeder Betrieb 1 TB); 400 Betriebe ≈ 1.800–2.000 $/Monat (2XL, 60 TB)",220,360,1100,"ARGONAUT"),
("Resend (E-Mails)","Pro 20 $ (50 Tsd. Mails, 10 Domains), Scale 90 $ (100 Tsd. Mails, 1.000 Domains), darüber 0,90 $ je 1.000 Mails, +100 Domains 20 $/Monat, ab ≈ 1–2 Mio. Mails Enterprise verhandeln","≈ 2.500 Mails je Betrieb = 100 Tsd./Monat; eigene Absender-Domains brauchen Scale; hoch = Betriebe mit großen Newslettern (Kontingent je Betrieb fehlt noch); 400 Betriebe ≈ 900 $",90,90,250,"ARGONAUT"),
("Datei-Sicherung (zweite Kopie außerhalb Supabase)","Hetzner Object Storage (Deutschland) 6,49 € inkl. 1 TB, je weiteres TB ≈ 6,50 €; Cloudflare R2 0,015 $/GB (≈ 15 $/TB), Abruf kostenlos; Backblaze B2 ≈ 6 $/TB (EU-Rechenzentrum)","Pflicht aus Haftungsgründen: Supabase sichert Dateien nicht mit. Getrennt je Betrieb (eigener Ordner), versioniert, gesperrt gegen Löschen; niedrig 2 TB Hetzner, mittel 6 TB, hoch 40 TB R2",15,60,600,"ARGONAUT"),
("Hostinger-Server (PDF-Dienst)","Kleiner VPS","Gotenberg für alle PDFs",10,15,25,"ARGONAUT"),
("Anthropic (KI)","Haiku 4.5 1/5 $, Sonnet 5.5 2/10 $, Opus 5.5 4/20 $ je Mio. Token; Zwischenspeicher −90 %, Stapel −50 %","700–4.000 KI-Aufrufe je Betrieb und Monat; seit Paket 193 Premium-Zuordnung (schnell/professionell/premium), ≈ 1,5–2 Cent je Aufruf",400,960,2500,"ARGONAUT"),
("Voyage (Firmen-Wissen)","0,02–0,12 $ je Mio. Token, erste 200 Mio. Token frei","Dokumente auslesen",0,5,10,"ARGONAUT"),
("Ersatz-KI (z. B. Mistral)","nach Verbrauch","nur bei Ausfall",0,10,20,"ARGONAUT"),
("ElevenLabs (deine Stimme)","Pro 99 $ (600 Tsd. Credits), Scale 299 $ (1,8 Mio.); Multilingual 0,10 $ / Flash 0,05 $ je 1.000 Zeichen","≈ 50 Tsd. Zeichen je Betrieb, mit Zwischenspeicher; Browser-Stimme bleibt kostenlos",90,150,270,"ARGONAUT"),
("BANKSapi BANKS/Connect (Bankumsätze)","Starter ab ca. 200 €/Monat (Angabe Martin, 05.10.2026), Abrechnung je Nutzer, BaFin-Lizenz von BANKSapi inklusive; Laufzeit 12/24/36 Monate, längere Laufzeit günstiger; 32 Tage kostenlos testen","Starter mit 36 Monaten ≈ 33 % Rabatt ≈ 135–150 €; mehr Nutzer = höherer Preis (genaue Staffel im Angebot)",135,150,400,"ARGONAUT"),
]
T=[
("KI-Telefonassistent (Retell oder Vapi + Twilio)","Retell ≈ 0,125–0,19 $/Min. gesamt, Vapi 0,05 $/Min. Plattform + 0,07–0,19 $ Zusatz; deutsche Nummer 1,35 $/Monat, eingehend 0,01 $/Min.","100–400 Gesprächsminuten je Betrieb und Monat",430,1080,2700,"als Zusatzmodul je Minute an den Betrieb weitergeben"),
("Kassen-TSE (fiskaly u. a.)","Cloud-TSE 6,95–20 € je Kasse und Monat (bei manchen Kassen enthalten)","1–2 Kassen bei Betrieben mit Kasse",280,500,800,"durchreichen an den Betrieb"),
]
EIGEN=[("WhatsApp Business (Meta)","Deutschland je Nachricht: Werbung 0,113 €, Service/Hinweis 0,046 €; 1.000 Service-Nachrichten im Monat frei","eigenes Konto des Betriebs"),
("Meta, Google Ads, LinkedIn, TikTok","Schnittstellen selbst kostenlos; Werbebudget zahlt der Betrieb","eigenes Konto des Betriebs"),
("Stripe, Mollie, PayPal, SumUp, GoCardless","Gebühren je Zahlung beim Anbieter","eigenes Konto des Betriebs"),
("Shopware, Shopify, WooCommerce, DHL","Tarife der Anbieter","eigenes Konto des Betriebs"),
("DATEV / DATEVconnect, ELSTER","Export kostenlos; DATEVconnect-Zugang über den Steuerberater bzw. DATEV-Marktplatz (Preis auf Anfrage)","Betrieb bzw. Steuerberater"),
("openrouteservice, Unsplash, TED","kostenlose Stufen reichen","ARGONAUT, 0 €")]
Q=[("Vercel Pro Plan","https://vercel.com/docs/plans/pro-plan"),("Vercel Flat Rate CDN","https://vercel.com/docs/pricing/flat-rate-cdn"),("Supabase Preise","https://supabase.com/pricing"),("Resend Preise","https://resend.com/pricing"),("Hetzner Object Storage","https://www.hetzner.com/storage/object-storage/"),("Hetzner-Preise 2026 (bex.co)","https://bex.co/blog/2026/09/11/hetzner-object-storage-tenant-backup-backend"),("Anthropic Modelle und Preise","https://platform.claude.com/docs/en/models/overview"),("Voyage AI Preise","https://www.usagepricing.com/blueprint/voyage-ai"),("ElevenLabs Preise (Flexprice)","https://flexprice.io/blog/elevenlabs-pricing-breakdown"),("BANKSapi BANKS/Connect","https://banksapi.de/en/banks-connect-en/"),("BANKSapi Testphase 32 Tage","https://banksapi.de/en/free-trial/"),("Retell AI Preise (CloudTalk)","https://www.cloudtalk.io/retell-ai-pricing/"),("Vapi Preise (CloudTalk)","https://www.cloudtalk.io/blog/vapi-ai-pricing/"),("Twilio Voice Deutschland","https://www.twilio.com/en-us/voice/pricing/de"),("TSE-Kosten (kassensystemevergleich.de)","https://www.kassensystemevergleich.de/tse-kosten/"),("WhatsApp-Preise Deutschland","https://whautomate.com/whatsapp-business-api-pricing-germany")]
import html
e=html.escape
def eur(x): return f"{x:,}".replace(",",".")+" €"
lo=sum(k[3] for k in K); mi=sum(k[4] for k in K); hi=sum(k[5] for k in K)
rows="".join(f'<tr><td data-l="Partner"><strong>{e(p)}</strong></td><td class="heute" data-l="Preis laut Anbieter">{e(l)}</td><td class="loes" data-l="Annahme 40 Betriebe">{e(a)}</td><td class="num" data-l="niedrig">{eur(a1)}</td><td class="num mid" data-l="mittel">{eur(b1)}</td><td class="num" data-l="hoch">{eur(c1)}</td></tr>' for p,l,a,a1,b1,c1,_ in K)
rows+=f'<tr class="summe"><td data-l="Summe"><strong>Grundkosten ARGONAUT</strong></td><td class="heute"></td><td class="loes" data-l="je Betrieb (mittel)">≈ {round(mi/40)} € je Betrieb · ≈ {round(mi/700,1)} € je Mitarbeiter</td><td class="num" data-l="niedrig">{eur(lo)}</td><td class="num mid" data-l="mittel">{eur(mi)}</td><td class="num" data-l="hoch">{eur(hi)}</td></tr>'
trows="".join(f'<tr><td data-l="Partner"><strong>{e(p)}</strong></td><td class="heute" data-l="Preis laut Anbieter">{e(l)}</td><td class="loes" data-l="Annahme 40 Betriebe">{e(a)}<br><em>{e(z)}</em></td><td class="num" data-l="niedrig">{eur(a1)}</td><td class="num mid" data-l="mittel">{eur(b1)}</td><td class="num" data-l="hoch">{eur(c1)}</td></tr>' for p,l,a,a1,b1,c1,z in T)
erows="".join(f'<li><strong>{e(p)}:</strong> {e(l)} – <em>{e(z)}</em></li>' for p,l,z in EIGEN)
qs=" · ".join(f'<a href="{u}">{e(t)}</a>' for t,u in Q)
KOSTEN=f'''<section id="kosten"><header class="sh"><h2>Kosten der externen Partner</h2><p>Rechenbeispiel 40 Betriebe mit je 10–25 Mitarbeitern (≈ 700 Nutzer) · Euro je Monat, Schätzung</p></header>
<div class="zahlen">
<div class="zahl gold"><b>≈ {eur(mi)}</b><span>Grundkosten im Monat (mittel)</span></div>
<div class="zahl"><b>{eur(lo)} – {eur(hi)}</b><span>Spanne niedrig bis hoch</span></div>
<div class="zahl"><b>≈ {round(mi/40)} €</b><span>je Betrieb und Monat (mittel)</span></div>
<div class="zahl"><b>+ ≈ 1.080 €</b><span>Telefonassistent, wenn nicht je Minute weitergegeben</span></div>
</div>
<div class="tw"><table class="kt"><thead><tr><th>Partner</th><th>Preis laut Anbieter</th><th>Annahme für 40 Betriebe</th><th>niedrig</th><th>mittel</th><th>hoch</th></tr></thead><tbody>{rows}</tbody></table></div>
<h3 class="zw">Verbrauchsabhängig, besser je Nutzung an den Betrieb weitergeben</h3>
<div class="tw"><table class="kt"><thead><tr><th>Partner</th><th>Preis laut Anbieter</th><th>Annahme für 40 Betriebe</th><th>niedrig</th><th>mittel</th><th>hoch</th></tr></thead><tbody>{trows}</tbody></table></div>
<div class="zwei">
<div class="box"><h3>Zahlt der Betrieb selbst (eigenes Konto)</h3><ul>{erows}</ul></div>
<div class="box"><h3>Wie gerechnet</h3><ul><li>Dollarpreise grob 1 : 1 als Euro übernommen; beim aktuellen Kurs liegen sie etwas darunter.</li><li>Der größte Posten ist die KI. Zwischenspeicher, das günstige Modell für interne Auswertungen und Stapelverarbeitung halten ihn unten; Deckel je Betrieb gibt es schon.</li><li>Telefon und TSE wachsen mit jeder Minute bzw. Kasse. Deshalb als Zusatzmodul abrechnen statt pauschal einpreisen.</li><li>Nicht enthalten: Anwalt, Steuerberater, Versicherungen, Domains (≈ 5 €).</li></ul></div>
</div>
<p class="fuss">Quellen (abgerufen 29.09.2026): {qs}</p>
</section>'''
