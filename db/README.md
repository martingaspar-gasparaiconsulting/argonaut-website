# ARGONAUT OS · Datenbank-Sicherung

**Stand: 15.07.2026** · Supabase-Projekt `znrjnndfzzydnhbyntwa` (eu-north-1)

## Warum es diesen Ordner gibt

Bis zum 15.07.2026 existierte das gesamte Rechte- und Ablauf-Fundament von ARGONAUT
**ausschließlich in Supabase** — nicht im Repo, nicht in git, nirgendwo sonst.
Ein Unfall am Projekt hätte Monate Arbeit vernichtet, und niemand hätte den Stand
rekonstruieren können.

Seitdem liegt der Stand hier: versioniert wie Code, jede Änderung im git-Diff sichtbar,
im Notfall wiederherstellbar.

## Was drin ist

| Datei | Inhalt |
|---|---|
| `funktionen.sql` | 56 Funktionen — Rechte-Kern, Field Service, RAG, GoBD-Sperren |
| `trigger.sql` | 72 Trigger auf 59 Tabellen — die Zündung für die Funktionen |
| `policies.sql` | 372 RLS-Policies auf 119 Tabellen — wer darf was sehen |

## ⚠️ Reihenfolge bei komplettem Neuaufbau

Zwingend einhalten — die Teile bauen aufeinander auf:

```
1. Tabellen           (Struktur zuerst)
2. db/funktionen.sql  (Trigger + Policies verweisen darauf)
3. db/trigger.sql
4. db/policies.sql    (rufen mein_chef_id() u. a. auf)
```

Wird `policies.sql` vor `funktionen.sql` ausgeführt, greift **keine einzige Policy** —
sie rufen Funktionen auf, die dann noch nicht existieren.

## Alle drei Dateien sind idempotent

`create or replace` bzw. `drop … if exists` + `create` → mehrfaches Ausführen
ist gefahrlos, nichts wird versehentlich gelöscht.

**ABER:** Sie setzen die Datenbank auf **genau diesen Stand** zurück. Läuft eine der
Dateien auf einer Datenbank, die seither **neuere** Regeln bekommen hat, gehen diese
verloren. Vor dem Ausführen auf Produktion immer prüfen, ob die Datei aktuell ist.

Im Normalbetrieb wird hier **nichts ausgeführt**. Der Ordner ist Dokumentation
und Notfall-Reserve.

## Pflege — wichtig

Diese Dateien sind ein **Abbild**, keine Handarbeit. Nach jeder Änderung an Policies,
Funktionen oder Triggern in Supabase: Abfragen erneut laufen lassen, Dateien ersetzen,
committen. Sonst driftet git von der Wahrheit ab — und genau das war das Problem,
das dieser Ordner löst.

Die Abfragen stehen im Kopf der jeweiligen Datei beschrieben (alle read-only,
auf `pg_policies`, `pg_proc`, `pg_trigger`).

## Hinweis zu SECURITY DEFINER

38 der 56 Funktionen laufen als `SECURITY DEFINER` — also mit den Rechten des
Erstellers, nicht des Aufrufers. Das ist Absicht (z. B. `darf_ich_verteilen`),
bedeutet aber: **sie umgehen RLS**. Bei Änderungen an diesen Funktionen mit
besonderer Sorgfalt vorgehen.
