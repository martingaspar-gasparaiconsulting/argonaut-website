# ARGONAUT OS – TOMs, Abschnitt „Verfügbarkeit und Belastbarkeit“ (Entwurf, Paket 350, 13.10.2026)

> **Entwurf für die Anwalt-Prüfung (R55).** Gilt erst ab dem Tag, an dem der zweite Speicherort eingerichtet und die erste Probe-Wiederherstellung bestanden ist. Bis dahin darf in den TOMs nur der Datenbank-Teil (1) stehen. Datum der Einrichtung und der ersten Probe hier eintragen: ______

Art. 32 Abs. 1 lit. b und c DSGVO: Fähigkeit, die Verfügbarkeit und Belastbarkeit der Systeme auf Dauer sicherzustellen und die Verfügbarkeit personenbezogener Daten bei einem Zwischenfall rasch wiederherzustellen.

## 1. Datenbank

- Die Datenbank (Supabase, Region laut Projekt-Einstellung eintragen: ______) wird vom Anbieter täglich automatisch gesichert. *(Aufbewahrungsdauer und Möglichkeit der Wiederherstellung auf einen Zeitpunkt laut gebuchtem Supabase-Tarif eintragen: ______)*
- Kunden können ihre Daten jederzeit selbst als Excel-Datei herunterladen (Seite „Datensicherung“). Zugangsdaten und Geheimnisse sind darin bewusst nicht enthalten.

## 2. Dateien (Belege, Rechnungs-PDFs, Fotos, Dokumente)

- **Zweiter Speicherort:** Alle Dateien im Supabase-Speicher werden stündlich auf einen zweiten, getrennten Speicher bei *(Anbieter, z. B. Hetzner Online GmbH, Rechenzentrum ______, Deutschland)* kopiert. Neue und geänderte Dateien werden beim nächsten stündlichen Lauf erfasst.
- **Verschlüsselung vor dem Verlassen:** Jede Datei wird vor der Übertragung mit AES-256-GCM verschlüsselt. Der Schlüssel liegt ausschließlich in der Server-Umgebung von ARGONAUT und offline beim Betreiber; der Anbieter des zweiten Speichers kann die Inhalte nicht lesen. Die Übertragung erfolgt zusätzlich über TLS (HTTPS).
- **Unverfälschbarkeit:** Jede verschlüsselte Datei ist an ihren Speicherort gebunden (Bucket und Name als Zusatzdaten der Verschlüsselung) und trägt einen Prüf-Tag. Für jede Datei wird die SHA-256-Prüfsumme des Originals festgehalten.
- **Gelöschte Dateien:** Wird eine Datei in ARGONAUT gelöscht, bleibt ihre verschlüsselte Kopie noch 30 Tage im zweiten Speicher (Schutz vor versehentlichem Löschen) und wird danach dort ebenfalls gelöscht. *(Falls beim Anbieter Versionierung eingeschaltet ist: Aufbewahrung alter Versionen ______ Tage.)*
- **Überwachung:** Jeder Lauf wird protokolliert. Schlägt eine Datei fünfmal fehl, gibt es 26 Stunden lang keinen fehlerfreien Lauf oder ist die letzte erfolgreiche Probe-Wiederherstellung älter als 90 Tage, wird der Betreiber automatisch benachrichtigt.
- **Wiederherstellung geprobt:** Mindestens alle 90 Tage wird die Wiederherstellung echt geprobt: Zufällig ausgewählte Dateien werden aus dem zweiten Speicher geladen, entschlüsselt und mit der Prüfsumme verglichen; drei davon werden tatsächlich in den Speicher zurückgespielt, erneut geladen, verglichen und wieder entfernt. Das Ergebnis wird mit Datum protokolliert.
- **Notfall-Wiederherstellung:** Ganze Bereiche (Buckets) können aus dem zweiten Speicher zurückgeholt werden. Vorhandene Dateien werden dabei nie überschrieben. Die Funktion steht nur dem Betreiber mit bestätigter Zwei-Faktor-Anmeldung zur Verfügung.

## 3. Zugriff auf die Sicherung

- Zugang zum zweiten Speicher nur mit eigenem, auf diesen einen Speicherbereich beschränkten Zugangsschlüssel; der Speicherbereich ist nicht öffentlich.
- Steuerung und Einsicht nur im Command Center durch den Betreiber (Rolle, hinterlegte Kennung und bestätigte Zwei-Faktor-Anmeldung).
- Die Protokolltabellen sind für Kunden und Besucher nicht lesbar.

## Offene Punkte für die Prüfung

- Anbieter des zweiten Speichers als **weiteren Unterauftragsverarbeiter** in den AV-Vertrag und die Datenschutzerklärung aufnehmen (erst, wenn er eingerichtet ist).
- AV-Vertrag mit dem Anbieter abschließen und ablegen.
- Ist die 30-Tage-Frist für gelöschte Dateien mit den Löschpflichten vereinbar (z. B. Art. 17 DSGVO – Löschung im Backup erst nach Ablauf)? Hinweis in den TOMs/AV-Vertrag nötig?
- Aufbewahrungspflichtige Unterlagen (GoBD) bleiben ohnehin unveränderbar in ARGONAUT abgelegt; die Kopie ersetzt diese Ablage nicht.
