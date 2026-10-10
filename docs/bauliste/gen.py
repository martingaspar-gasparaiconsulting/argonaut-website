import html
exec(open('rows.py').read())
exec(open('kosten.py').read())
esc=html.escape
WER={"G":("gemeinsam","g"),"C":("Claude","c"),"M":("Martin","m")}
def st_cls(s):
    return {"live":"ok","läuft":"run","nächster":"next"}.get(s,"wait" if "wartet" in s else "open")
tot_bis_test=0; tot_s3=0; tot_kfz=0; tot_mob=0; tot_alle=0; tot_ext=0; done=0
for sid,_,_,rows in S:
    for r in rows:
        p=int(r[5])
        if r[6]=="live": done+=p; continue
        if sid in("s0","s1","s2"): tot_bis_test+=p
        elif sid in ("s3","s5"): tot_s3+=p
        elif sid=="kfz": tot_kfz+=p
        elif sid=="mob": tot_mob+=p
        elif sid=="alle": tot_alle+=p
        else: tot_ext+=p
gesamt=tot_bis_test+tot_s3+tot_kfz+tot_mob+tot_alle+tot_ext
alle=gesamt+done
proz=round(done*100/alle)
secs=[]
for sid,t,u,rows in S:
    tr=[]
    for nr,pak,heute,loes,wer,push,stat in rows:
        wl,wc=WER[wer]
        tr.append(f'''<tr class="z-{st_cls(stat)}"><td class="nr" data-l="Nr">{esc(nr)}</td><td class="pak" data-l="Paket"><strong>{esc(pak)}</strong><span class="st st-{st_cls(stat)}">{'✓ erledigt' if stat=='live' else esc(stat)}</span></td><td class="heute" data-l="Heute: fehlt oder läuft falsch">{esc(heute)}</td><td class="loes" data-l="Lösung">{esc(loes)}</td><td class="wer" data-l="Wer"><span class="w w-{wc}">{wl}</span></td><td class="push" data-l="Pushes">{esc(push)}</td></tr>''')
    n=sum(int(r[5]) for r in rows if r[6]!="live")
    secs.append(f'''<section id="{sid}"><header class="sh"><h2>{esc(t)}</h2><p>{esc(u)} · <b>{n} offene Pushes</b></p></header><div class="tw"><table><thead><tr><th>Nr</th><th>Paket</th><th>Heute: fehlt oder läuft falsch</th><th>Lösung</th><th>Wer</th><th>Pushes</th></tr></thead><tbody>{"".join(tr)}</tbody></table></div></section>''')
body=f'''<title>ARGONAUT Bauliste</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=DM+Mono:wght@400;500&display=swap">
<style>
/* Layout: Kopf mit Summen, dann je Stufe eine Tabelle Problem -> Loesung; unter 760px werden Zeilen zu Karten */
:root{{--bg:#f6f7f9;--fl:#ffffff;--ink:#0a1628;--mut:#556173;--line:#dfe3ea;--gold:#9a7a26;--goldbg:#f5eedb;--navy:#0a1628;
--ok:#1f7a4d;--okbg:#e3f3ea;--run:#1d5fa8;--runbg:#e2edf9;--nx:#8a5a00;--nxbg:#fbeccd;--wt:#6b5a8e;--wtbg:#ece7f5;--op:#556173;--opbg:#eceff3;
--g:#8a5a00;--gbg:#fbeccd;--c:#1d5fa8;--cbg:#e2edf9;--m:#6b5a8e;--mbg:#ece7f5;
--f:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"DM Mono",ui-monospace,Consolas,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#0b1220;--fl:#121b2c;--ink:#e8ecf3;--mut:#9aa6b8;--line:#243047;--gold:#d7b75e;--goldbg:#2a2413;
--ok:#5fd29a;--okbg:#12301f;--run:#7cb6f5;--runbg:#132a44;--nx:#f0c060;--nxbg:#3a2c0e;--wt:#bfaee6;--wtbg:#2a2340;--op:#9aa6b8;--opbg:#1c2638;
--g:#f0c060;--gbg:#3a2c0e;--c:#7cb6f5;--cbg:#132a44;--m:#bfaee6;--mbg:#2a2340;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#0b1220;--fl:#121b2c;--ink:#e8ecf3;--mut:#9aa6b8;--line:#243047;--gold:#d7b75e;--goldbg:#2a2413;
--ok:#5fd29a;--okbg:#12301f;--run:#7cb6f5;--runbg:#132a44;--nx:#f0c060;--nxbg:#3a2c0e;--wt:#bfaee6;--wtbg:#2a2340;--op:#9aa6b8;--opbg:#1c2638;
--g:#f0c060;--gbg:#3a2c0e;--c:#7cb6f5;--cbg:#132a44;--m:#bfaee6;--mbg:#2a2340;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font:15px/1.5 var(--f)}}
.wrap{{max-width:1240px;margin:0 auto;padding-inline:20px;padding-block:28px 60px;display:grid;gap:36px}}
.kopf{{display:grid;gap:14px}}
.eyebrow{{font:500 12px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}}
h1{{font-size:clamp(26px,4vw,38px);line-height:1.1;margin:0;text-wrap:balance}}
.lead{{margin:0;color:var(--mut);max-width:70ch}}
.zahlen{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}}
.zahl{{background:var(--fl);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:grid;gap:2px}}
.zahl b{{font:500 28px var(--mono);font-variant-numeric:tabular-nums}}
.zahl span{{color:var(--mut);font-size:13px}}
.zahl.gold{{background:var(--goldbg);border-color:transparent}}
.leg{{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:13px;color:var(--mut);align-items:center}}
nav.sprung{{display:flex;flex-wrap:wrap;gap:8px}}
nav.sprung a{{font-size:13px;color:var(--ink);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 12px;background:var(--fl)}}
nav.sprung a:focus-visible,nav.sprung a:hover{{border-color:var(--gold);outline:none}}
section{{display:grid;gap:12px;scroll-margin-top:16px}}
.sh h2{{margin:0;font-size:20px}}
.sh p{{margin:2px 0 0;color:var(--mut);font-size:14px}}
.tw{{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--fl)}}
table{{width:100%;border-collapse:collapse;min-width:900px}}
th{{text-align:left;font:500 11px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--mut);padding:10px 12px;border-bottom:1px solid var(--line);background:var(--bg)}}
td{{padding:12px;vertical-align:top;border-bottom:1px solid var(--line)}}
tr:last-child td{{border-bottom:0}}
td.nr{{font:500 13px var(--mono);color:var(--gold);white-space:nowrap;width:56px}}
td.pak{{width:190px}} td.pak strong{{display:block;margin-bottom:6px;line-height:1.3}}
td.heute{{width:36%;}} td.loes{{width:30%}}
td.push{{font:500 15px var(--mono);text-align:center;width:64px;font-variant-numeric:tabular-nums}}
td.wer{{width:96px}}
tr.z-ok td{{background:var(--goldbg)}}
tr.z-ok td:first-child{{box-shadow:inset 4px 0 0 var(--gold)}}
tr.z-ok{{outline:2px solid var(--gold);outline-offset:-2px;box-shadow:0 0 14px color-mix(in srgb,var(--gold) 45%,transparent)}}
.st-ok{{color:var(--bg);background:var(--gold)}}
.fort{{display:grid;gap:6px}} .balken{{height:12px;border-radius:999px;background:var(--line);overflow:hidden}}
.balken i{{display:block;height:100%;background:linear-gradient(90deg,var(--gold),color-mix(in srgb,var(--gold) 70%,#fff));box-shadow:0 0 10px var(--gold)}}
.fort span{{font:500 13px var(--mono);color:var(--mut)}}
.st,.w{{display:inline-block;font:500 11px var(--mono);letter-spacing:.04em;border-radius:999px;padding:2px 9px;white-space:nowrap}}
.st-run{{color:var(--run);background:var(--runbg)}} .st-next{{color:var(--nx);background:var(--nxbg)}}
.st-wait{{color:var(--wt);background:var(--wtbg)}} .st-open{{color:var(--op);background:var(--opbg)}}
.w-g{{color:var(--g);background:var(--gbg)}} .w-c{{color:var(--c);background:var(--cbg)}} .w-m{{color:var(--m);background:var(--mbg)}}
.zwei{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}
.box{{background:var(--fl);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:grid;gap:8px;min-width:0}}
.box h3{{margin:0;font-size:16px}}
.box ul{{margin:0;padding-left:18px;display:grid;gap:4px}}
.box p{{margin:0;color:var(--mut);font-size:14px}}
.ablauf{{display:grid;gap:8px;counter-reset:a;margin:0;padding:0;list-style:none}}
.ablauf li{{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:start}}
.ablauf li::before{{counter-increment:a;content:counter(a);font:500 12px var(--mono);color:var(--gold);border:1px solid var(--gold);border-radius:50%;width:22px;height:22px;display:grid;place-items:center}}
.fuss{{color:var(--mut);font-size:13px}}
@media (max-width:760px){{
 table{{min-width:0}} thead{{display:none}} .tw{{border:0;background:transparent;overflow:visible}}
 table,tbody,tr,td{{display:block;width:auto!important}}
 tr{{background:var(--fl);border:1px solid var(--line);border-radius:10px;margin-bottom:12px;padding:6px 0}}
 td{{border:0;padding:6px 14px}}
 td.heute::before,td.loes::before,td.wer::before,td.push::before{{content:attr(data-l);display:block;font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:2px}}
 td.push{{text-align:left}}
}}
.kt{{min-width:980px}} td.num{{font:500 14px var(--mono);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;width:92px}} td.mid{{color:var(--gold)}}
tr.summe td{{background:var(--goldbg)}} .zw{{margin:6px 0 0;font-size:16px}} .fuss a{{color:var(--gold)}}
@media (max-width:760px){{ td.num{{text-align:left;width:auto}} td.num::before{{content:attr(data-l);display:inline-block;min-width:70px;font:500 11px var(--mono);text-transform:uppercase;color:var(--mut)}} .kt{{min-width:0}} }}
@media (prefers-reduced-motion:reduce){{*{{scroll-behavior:auto}}}}
</style>
<div class="wrap">
<div class="kopf">
<div class="eyebrow">ARGONAUT OS · Stand 10.10.2026 · _p300 unterwegs · Zeitreise für jede Branche</div>
<h1>Bauliste: was fehlt, was falsch läuft, wie es gelöst wird</h1>
<p class="lead">Jede Zeile ist ein Paket. Links steht, was heute fehlt oder schiefläuft, rechts die Lösung. Pushes und Zeiten sind Schätzungen; gerechnet sind etwa 2 Pushes je 2-Stunden-Block.</p>
<div class="zahlen">
<div class="zahl gold"><b>{tot_bis_test}</b><span>Pushes Stufe 0–2 (Rest wartet)</span></div>
<div class="zahl"><b>{tot_s3}</b><span>Pushes Stufe 3 + Dossiers</span></div>
<div class="zahl"><b>{tot_kfz}</b><span>Pushes Kfz-Pilot</span></div><div class="zahl"><b>{tot_alle}</b><span>Pushes für alle Branchen</span></div><div class="zahl"><b>{tot_mob}</b><span>Pushes Mobilität</span></div><div class="zahl"><b>{tot_ext}</b><span>Pushes externe Partner</span></div>
<div class="zahl"><b>{gesamt}</b><span>Pushes gesamt offen</span></div>
<div class="zahl"><b>≈ {round(gesamt/2)}</b><span>Blöcke à 2 Std. + 1 Testtag</span></div>
</div>
<div class="fort"><span>{done} von {alle} Pushes erledigt · {proz} %</span><div class="balken" role="progressbar" aria-valuenow="{proz}" aria-valuemin="0" aria-valuemax="100"><i style="width:{proz}%"></i></div></div>
<div class="leg">Wer: <span class="w w-g">gemeinsam</span><span class="w w-c">Claude</span><span class="w w-m">Martin</span> · Status: <span class="st st-ok">✓ erledigt</span><span class="st st-run">läuft</span><span class="st st-next">nächster</span><span class="st st-open">offen</span><span class="st st-wait">wartet</span></div>
<nav class="sprung" aria-label="Abschnitte"><a href="#s0">Stufe 0</a><a href="#s1">Stufe 1</a><a href="#s2">Stufe 2</a><a href="#s3">Stufe 3</a><a href="#kfz">Kfz-Pilot jetzt</a><a href="#alle">Für alle</a><a href="#mob">Mobilität</a><a href="#s4">Externe Partner</a><a href="#s5">Nach dem Anwalt</a><a href="#test">Testtag</a><a href="#kosten">Kosten</a><a href="#selbst">Martin selbst</a></nav>
</div>
{secs[0]}{secs[1]}{secs[2]}
{"".join(secs[3:])}
<section id="test"><header class="sh"><h2>Testtag · ganz zum Schluss</h2><p>Nach Stufe 3, externen Partnern und Dossiers – mit Schrift-Querschnitt</p></header>
<div class="zwei">
<div class="box"><h3>Entscheidungsrunden · erledigt</h3><p>Block 1 und Block 2 (47 Entscheidungen) sind entschieden und gebaut: Pakete 190–203. Offene Rechtsfragen liegen in der Anwaltsvorlage Oktober 2026.</p></div>
<div class="box"><h3>Testtag · 1 ganzer Tag</h3><p>Martin, seine Freundin und Claude. Jeder Fund wird sofort dokumentiert und von Claude bearbeitet.</p>
<ol class="ablauf"><li>Musterbetrieb XXL anlegen (Paket 179)</li><li>Klickliste aus den drei Testtag-Sammlungen abarbeiten</li><li>Funde live erfassen: Seite, Schritt, erwartet, passiert</li><li>Claude baut Korrekturen, am Abend gebündelt als Pushes</li><li>Nacharbeit ≈ 2–3 Blöcke, danach Schrift-Querschnitt</li></ol></div>
</div></section>

{KOSTEN}
<section id="selbst"><header class="sh"><h2>Martin selbst</h2><p>Kein Push, aber Voraussetzung für mehrere Pakete</p></header>
<div class="zwei">
<div class="box"><h3>Vor dem Testtag</h3><ul><li>Resend Pro buchen, MAIL_TAGESBUDGET setzen, CRON_SECRET prüfen</li><li>Zwei-Faktor für das eigene Vercel-Konto</li><li>TOTP in Supabase prüfen, eigenen Faktor einrichten, Notfall-Codes sicher ablegen</li><li>„Sicheres Passwort ändern“ in Supabase einschalten</li></ul></div>
<div class="box"><h3>Verträge und Partner</h3><ul><li>Anwalt Anfang Oktober: AVVs, Datenschutzerklärung, beide Checklisten</li><li>Stimme bei ElevenLabs klonen, Schlüssel in Vercel</li><li>Telefon-Partner wählen (Retell oder Vapi)</li><li>BANKSapi-Test (32 Tage) starten, danach Starter 36 Monate, TSE-Konto, DATEVconnect-Zugang</li><li>Entwickler-Apps bei Meta, Google, LinkedIn, TikTok</li><li>Probestapel an den Steuerberater</li></ul></div>
</div></section>
<p class="fuss">Quelle: Rechts- und Sicherheitsprüfung vom 29.09.2026 (273 API-Routen, 180 SQL-Dateien, Mail-Wege, KI-Aufrufe, Uploads, Admin-Wege) und die Liste der offenen Punkte. Das Doc „ARGONAUT Rundumschlag“ enthält die Fundstellen im Code.</p>
</div>'''
open('bauliste.html','w').write(body)
print(tot_bis_test,tot_s3,tot_kfz,tot_ext,gesamt,done)
