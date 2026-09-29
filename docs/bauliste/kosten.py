# (partner, listenpreis, annahme, lo, mid, hi, zahlt)
K=[
("Vercel (Hosting)","Pro 20 $/Monat inkl. 20 $ Guthaben, danach nach Verbrauch; 1 TB Datenverkehr inklusive","≈ 700 Nutzer, stündliche und minütliche Crons, PDF-Aufrufe",40,90,250,"ARGONAUT"),
("Supabase (Datenbank, Speicher)","Pro 25 $ + Rechenleistung (Medium 60 $, Large 110 $, 10 $ Guthaben); Speicher 0,021 $/GB; Wiederherstellung auf Zeitpunkt 100 $","Medium bis Large, 30–40 GB Datenbank, ≈ 200 GB Dateien; Wiederherstellung empfohlen",70,220,330,"ARGONAUT"),
("Resend (E-Mails)","Pro 20–35 $ (50–100 Tsd. Mails, 10 Domains), Scale ab 90 $ (100 Tsd., bis 1.000 Domains)","≈ 2.500 Mails je Betrieb = 100 Tsd./Monat; eigene Absender-Domains brauchen Scale",30,120,300,"ARGONAUT"),
("Hostinger-Server (PDF-Dienst)","Kleiner VPS","Gotenberg für alle PDFs",10,15,25,"ARGONAUT"),
("Anthropic (KI)","Haiku 1/5 $, Sonnet 3/15 $ je Mio. Token; Zwischenspeicher −90 %, Stapel −50 %","700–4.000 KI-Aufrufe je Betrieb und Monat, 70 % Haiku / 30 % Sonnet, ≈ 1 Cent je Aufruf",250,550,1450,"ARGONAUT"),
("Voyage (Firmen-Wissen)","0,02–0,12 $ je Mio. Token, erste 200 Mio. Token frei","Dokumente auslesen",0,5,10,"ARGONAUT"),
("Ersatz-KI (z. B. Mistral)","nach Verbrauch","nur bei Ausfall",0,10,20,"ARGONAUT"),
("ElevenLabs (deine Stimme)","Pro 99 $ (600 Tsd. Credits), Scale 299 $ (1,8 Mio.); Multilingual 0,10 $ / Flash 0,05 $ je 1.000 Zeichen","≈ 50 Tsd. Zeichen je Betrieb, mit Zwischenspeicher; Browser-Stimme bleibt kostenlos",90,150,270,"ARGONAUT"),
("finAPI (Bankumsätze)","Zugangslizenz ab 60 €/Monat bis 200 Nutzer; eigene PSD2-Lizenz (Lizenz-Modell) ab 300 €/Monat","≈ 80 Bankzugänge; Preis für Geschäftskonten auf Anfrage",60,150,400,"ARGONAUT"),
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
Q=[("Vercel Pro Plan","https://vercel.com/docs/plans/pro-plan"),("Supabase Preise (MakerKit)","https://makerkit.dev/blog/saas/supabase-pricing"),("Resend Preise","https://resend.com/docs/knowledge-base/what-is-resend-pricing"),("Anthropic API-Preise (Finout)","https://www.finout.io/blog/anthropic-api-pricing"),("Voyage AI Preise","https://www.usagepricing.com/blueprint/voyage-ai"),("ElevenLabs Preise (Flexprice)","https://flexprice.io/blog/elevenlabs-pricing-breakdown"),("finAPI Preise","https://www.finapi.io/en/prices/"),("Retell AI Preise (CloudTalk)","https://www.cloudtalk.io/retell-ai-pricing/"),("Vapi Preise (CloudTalk)","https://www.cloudtalk.io/blog/vapi-ai-pricing/"),("Twilio Voice Deutschland","https://www.twilio.com/en-us/voice/pricing/de"),("TSE-Kosten (kassensystemevergleich.de)","https://www.kassensystemevergleich.de/tse-kosten/"),("WhatsApp-Preise Deutschland","https://whautomate.com/whatsapp-business-api-pricing-germany")]
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
