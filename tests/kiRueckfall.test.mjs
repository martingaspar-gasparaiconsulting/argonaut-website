import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rueckfallKonfig, istAusfall, rueckfallMoeglich,
  textAus, nachOpenAiBody, nachAnthropicAntwort,
} from '../out/kiRueckfall.js'

// --- Konfiguration: alles oder nichts ---------------------------------------
test('ohne Schluessel kein Rueckfall', () => {
  assert.equal(rueckfallKonfig({}), null)
  assert.equal(rueckfallKonfig({ KI_RUECKFALL_URL: 'https://x/y' }), null)
  assert.equal(rueckfallKonfig({ KI_RUECKFALL_URL: 'https://x/y', KI_RUECKFALL_SCHLUESSEL: 'k' }), null)
})

test('halb gesetzte Konfiguration zaehlt als nicht gesetzt', () => {
  assert.equal(rueckfallKonfig({ KI_RUECKFALL_URL: '  ', KI_RUECKFALL_SCHLUESSEL: 'k', KI_RUECKFALL_MODELL: 'm' }), null)
})

test('vollstaendige Konfiguration wird getrimmt zurueckgegeben', () => {
  const k = rueckfallKonfig({
    KI_RUECKFALL_URL: ' https://api.mistral.ai/v1/chat/completions ',
    KI_RUECKFALL_SCHLUESSEL: ' geheim ',
    KI_RUECKFALL_MODELL: ' mistral-large-latest ',
  })
  assert.deepEqual(k, {
    url: 'https://api.mistral.ai/v1/chat/completions',
    schluessel: 'geheim',
    modell: 'mistral-large-latest',
  })
})

// --- Ausfall oder eigener Fehler? -------------------------------------------
test('nur echte Ausfaelle schalten um', () => {
  for (const s of [429, 529, 500, 502, 503, 504, 599]) {
    assert.equal(istAusfall(s), true, `${s} sollte Ausfall sein`)
  }
})

test('eigene Fehler schalten NICHT um', () => {
  for (const s of [200, 201, 400, 401, 403, 404, 413, 422, 600, 0]) {
    assert.equal(istAusfall(s), false, `${s} darf kein Ausfall sein`)
  }
})

// --- Werkzeug-Aufrufe bleiben aussen vor ------------------------------------
test('Aufruf mit Werkzeugen wird nicht umgeleitet', () => {
  assert.equal(rueckfallMoeglich({ messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 'x' }] }), false)
})

test('Aufruf mit leerer Werkzeugliste ist umleitbar', () => {
  assert.equal(rueckfallMoeglich({ messages: [{ role: 'user', content: 'hi' }], tools: [] }), true)
})

test('ohne Nachrichten kein Rueckfall', () => {
  assert.equal(rueckfallMoeglich({ messages: [] }), false)
  assert.equal(rueckfallMoeglich(null), false)
  assert.equal(rueckfallMoeglich('kein Objekt'), false)
})

// --- Textextraktion, auch aus Cache-Bloecken --------------------------------
test('Text aus schlichtem String', () => {
  assert.equal(textAus('Guten Tag'), 'Guten Tag')
})

test('Text aus Bloecken — so wie das Prompt-Caching sie hinterlaesst', () => {
  const system = [{ type: 'text', text: 'Sie sind ein Baustein.', cache_control: { type: 'ephemeral' } }]
  assert.equal(textAus(system), 'Sie sind ein Baustein.')
})

test('mehrere Bloecke werden zeilenweise verbunden', () => {
  assert.equal(textAus([{ text: 'eins' }, { text: 'zwei' }]), 'eins\nzwei')
})

test('unbekannter Inhalt ergibt leeren Text, keinen Absturz', () => {
  assert.equal(textAus(undefined), '')
  assert.equal(textAus(42), '')
  assert.equal(textAus([null, { kein: 'text' }]), '')
})

// --- Hinuebersetzen ---------------------------------------------------------
test('System-Prompt wird zur ersten Nachricht', () => {
  const body = nachOpenAiBody(
    { system: 'Regeln', messages: [{ role: 'user', content: 'Frage' }], max_tokens: 500 },
    'mistral-large-latest',
  )
  assert.equal(body.model, 'mistral-large-latest')
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'Regeln' },
    { role: 'user', content: 'Frage' },
  ])
  assert.equal(body.max_tokens, 500)
})

test('Cache-Bloecke im System-Prompt kommen sauber an', () => {
  const body = nachOpenAiBody({
    system: [{ type: 'text', text: 'Grosser Systemtext', cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hallo' }] }],
  }, 'm')
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'Grosser Systemtext' },
    { role: 'user', content: 'Hallo' },
  ])
})

test('ohne System-Prompt keine leere System-Nachricht', () => {
  const body = nachOpenAiBody({ messages: [{ role: 'user', content: 'nur Frage' }] }, 'm')
  assert.deepEqual(body.messages, [{ role: 'user', content: 'nur Frage' }])
})

test('Assistenten-Rolle bleibt erhalten, alles andere wird user', () => {
  const body = nachOpenAiBody({
    messages: [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'komisch', content: 'c' },
    ],
  }, 'm')
  assert.deepEqual(body.messages.map((m) => m.role), ['user', 'assistant', 'user'])
})

test('leere Nachrichten fallen weg', () => {
  const body = nachOpenAiBody({ messages: [{ role: 'user', content: '   ' }, { role: 'user', content: 'echt' }] }, 'm')
  assert.deepEqual(body.messages, [{ role: 'user', content: 'echt' }])
})

test('max_tokens 0 wird nicht mitgeschickt', () => {
  const body = nachOpenAiBody({ messages: [{ role: 'user', content: 'x' }], max_tokens: 0 }, 'm')
  assert.equal('max_tokens' in body, false)
})

test('temperature 0 wird mitgeschickt', () => {
  const body = nachOpenAiBody({ messages: [{ role: 'user', content: 'x' }], temperature: 0 }, 'm')
  assert.equal(body.temperature, 0)
})

// --- Zurueckuebersetzen -----------------------------------------------------
test('Antwort kommt im Anthropic-Aufbau zurueck', () => {
  const a = nachAnthropicAntwort({
    id: 'cmpl-1',
    model: 'mistral-large-latest',
    choices: [{ message: { role: 'assistant', content: 'Die Antwort.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 30 },
  }, 'mistral-large-latest')

  assert.equal(a.type, 'message')
  assert.equal(a.role, 'assistant')
  assert.equal(a.content[0].type, 'text')
  assert.equal(a.content[0].text, 'Die Antwort.')
  assert.equal(a.stop_reason, 'end_turn')
  assert.equal(a.usage.input_tokens, 120)
  assert.equal(a.usage.output_tokens, 30)
})

test('abgeschnittene Antwort meldet max_tokens', () => {
  const a = nachAnthropicAntwort({ choices: [{ message: { content: 'halb' }, finish_reason: 'length' }] }, 'm')
  assert.equal(a.stop_reason, 'max_tokens')
})

test('Antwort ohne Nutzungszahlen ergibt Nullen, keinen Absturz', () => {
  const a = nachAnthropicAntwort({ choices: [{ message: { content: 'ok' } }] }, 'm')
  assert.equal(a.usage.input_tokens, 0)
  assert.equal(a.usage.output_tokens, 0)
})

test('voellig leere Antwort ergibt leeren Text statt Absturz', () => {
  const a = nachAnthropicAntwort({}, 'ersatzmodell')
  assert.equal(a.content[0].text, '')
  assert.equal(a.model, 'ersatzmodell')
  assert.equal(a.id, 'rueckfall')
})

test('content[0].text ist das, was alle rund 30 Routen lesen', () => {
  // Genau dieser Zugriff steht in den Routen. Er muss ohne Wenn und Aber gehen.
  const a = nachAnthropicAntwort({ choices: [{ message: { content: 'Text fuer die Route' } }] }, 'm')
  assert.equal(a.content[0].text, 'Text fuer die Route')
})
