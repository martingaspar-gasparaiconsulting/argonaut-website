import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { angebotZuAuftrag } from '../out/angebotZuAuftrag.js';
import { auftragAusAngebot } from '../out/auftragAusAngebotServer.js';

// ===========================================================================
// HW-10 (15.10.2026) — Auftrag aus Angebot (Knopf und bei Annahme)
// ===========================================================================

test('Positionen mit Rabatt, Steuersatz 0 bleibt 0, Summen je Satz', () => {
  const { posten, summen } = angebotZuAuftrag([
    { bezeichnung: 'Fliesen', menge: 10, einheit: 'm²', einzelpreis: 50, mwst_satz: 19, rabatt_prozent: 10 },
    { bezeichnung: 'PV-Modul', menge: 2, einzelpreis: 300, mwst_satz: 0 },
  ]);
  assert.equal(posten[0].gesamt_netto, 450);
  assert.equal(posten[0].einzelpreis, 45);
  assert.equal(posten[0].einheit, 'm²');
  assert.equal(posten[1].mwst_satz, 0);
  assert.equal(summen.netto, 1050);
  assert.equal(summen.mwst, 85.5);
  assert.equal(summen.brutto, 1135.5);
});

// Kleiner Supabase-Ersatz im Speicher
function fakeDb(tabellen) {
  const log = [];
  function q(name) {
    let rows = tabellen[name] || (tabellen[name] = []);
    const filter = [];
    let op = 'select', daten = null;
    const api = {
      select() { return api; }, order() { return api; },
      eq(k, v) { filter.push([k, v]); return api; },
      insert(d) { op = 'insert'; daten = d; return api; },
      update(d) { op = 'update'; daten = d; return api; },
      delete() { op = 'delete'; return api; },
      maybeSingle() { return api.then((r) => ({ data: (r.data || [])[0] || null, error: r.error })); },
      single() { return api.then((r) => ({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error })); },
      then(res, rej) {
        const passt = (r) => filter.every(([k, v]) => r[k] === v);
        let out;
        if (op === 'insert') {
          if (tabellen.__fehler === name) out = { data: null, error: { message: 'kaputt' } };
          else { const arr = (Array.isArray(daten) ? daten : [daten]).map((d, i) => ({ id: d.id || `${name}-${rows.length + i + 1}`, ...d })); rows.push(...arr); out = { data: arr, error: null }; }
        } else if (op === 'update') { rows.filter(passt).forEach((r) => Object.assign(r, daten)); out = { data: null, error: null }; }
        else if (op === 'delete') { tabellen[name] = rows = rows.filter((r) => !passt(r)); out = { data: null, error: null }; }
        else out = { data: rows.filter(passt), error: null };
        log.push([op, name]);
        return Promise.resolve(out).then(res, rej);
      },
    };
    return api;
  }
  return { from: q, log };
}

const B = 'betrieb-1';
function basis(status = 'angenommen') {
  return {
    angebote: [{ id: 'a1', owner_user_id: B, titel: 'Bad', kunde_name: 'Frau M.', kontakt_id: 'k1', status, auftrag_id: null, standort_id: null, angenommen_am: '2026-10-15T10:00:00Z' }],
    angebot_positionen: [{ angebot_id: 'a1', bezeichnung: 'Fliesen', menge: 10, einheit: 'm²', einzelpreis: 50, mwst_satz: 19, rabatt_prozent: 0 }],
    auftraege: [], auftrag_positionen: [],
  };
}

test('Angenommenes Angebot -> Auftrag mit Positionen, Rueckverweis gesetzt', async () => {
  const t = basis(); const db = fakeDb(t);
  const r = await auftragAusAngebot(db, 'a1', { betrieb: B });
  assert.equal(r.ok, true);
  assert.equal(t.auftraege.length, 1);
  assert.equal(t.auftraege[0].status, 'beauftragt');
  assert.equal(t.auftraege[0].kontakt_id, 'k1');
  assert.equal(t.auftraege[0].angebot_id, 'a1');
  assert.equal(t.auftraege[0].brutto_summe, 595);
  assert.equal(t.auftrag_positionen.length, 1);
  assert.equal(t.angebote[0].auftrag_id, r.auftragId);
});

test('Zweiter Aufruf liefert denselben Auftrag (Doppel-Schutz)', async () => {
  const t = basis(); const db = fakeDb(t);
  const r1 = await auftragAusAngebot(db, 'a1', { betrieb: B });
  const r2 = await auftragAusAngebot(db, 'a1', { betrieb: B });
  assert.equal(r2.ok && r2.bereitsVorhanden, true);
  assert.equal(r2.auftragId, r1.auftragId);
  assert.equal(t.auftraege.length, 1);
});

test('Nicht angenommen -> kein Auftrag', async () => {
  const t = basis('gesendet'); const r = await auftragAusAngebot(fakeDb(t), 'a1', { betrieb: B });
  assert.equal(r.ok, false); assert.equal(t.auftraege.length, 0);
});

test('Fremder Betrieb sieht das Angebot nicht', async () => {
  const t = basis(); const r = await auftragAusAngebot(fakeDb(t), 'a1', { betrieb: 'anderer' });
  assert.equal(r.ok, false); assert.equal(r.code, 404);
});

test('Positionen scheitern -> Auftrag wird wieder entfernt', async () => {
  const t = basis(); t.__fehler = 'auftrag_positionen';
  const r = await auftragAusAngebot(fakeDb(t), 'a1', { betrieb: B });
  assert.equal(r.ok, false);
  assert.equal(t.auftraege.length, 0);
  assert.equal(t.angebote[0].auftrag_id, null);
});

test('Waechter: Annahme per Link legt den Auftrag an; Angebotsseite hat den Knopf', () => {
  const oeff = fs.readFileSync('app/api/oeffentlich/angebot/route.ts', 'utf8');
  assert.match(oeff, /auftragAusAngebot\(db, String\(a\.id\), \{ betrieb: String\(a\.owner_user_id\) \}\)/);
  const seite = fs.readFileSync('app/dashboard/angebote/page.tsx', 'utf8');
  assert.match(seite, /\/api\/auftrag-aus-angebot/);
  const re = fs.readFileSync('app/api/rechnung-aus-angebot/route.ts', 'utf8');
  assert.match(re, /auftrag_id: auftragId/);
});
