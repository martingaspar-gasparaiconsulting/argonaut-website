import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { frage } = await req.json();
    if (!frage || typeof frage !== 'string') {
      return NextResponse.json({ error: 'Keine Frage uebergeben.' }, { status: 400 });
    }

    // 1. Eingeloggten User ermitteln
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
    }

    // 2. Frage -> Voyage Embedding (voyage-4-lite, 1024-dim)
    const voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.VOYAGE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [frage],
        model: 'voyage-4-lite',
        input_type: 'query',
      }),
    });
    if (!voyageRes.ok) {
      const t = await voyageRes.text();
      console.error('Voyage Fehler:', t);
      return NextResponse.json({ error: 'Embedding fehlgeschlagen.' }, { status: 500 });
    }
    const voyageData = await voyageRes.json();
    const queryEmbedding = voyageData.data[0].embedding;

    // 3. pgvector Similarity Search (nur Dokumente dieses Kunden)
    const { data: chunks, error: rpcError } = await supabase.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_user_id: user.id,
      match_count: 5,
      match_threshold: 0.15,
    });
    if (rpcError) {
      console.error('RPC Fehler:', rpcError);
      return NextResponse.json({ error: 'Suche fehlgeschlagen.' }, { status: 500 });
    }

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({
        antwort: 'Zu Ihrer Frage habe ich in Ihren Dokumenten leider keine passenden Informationen gefunden.',
        quellen: [],
      });
    }

    // 4. Dokumenttitel fuer Quellenangabe laden
    const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
    const { data: docs } = await supabase
      .from('documents')
      .select('id, file_name')
      .in('id', docIds);
    const docMap = new Map((docs || []).map((d: any) => [d.id, d.file_name]));

    // 5. Kontext fuer Claude bauen
    const kontext = chunks
      .map((c: any, i: number) => {
        const titel = docMap.get(c.document_id) || 'Unbekanntes Dokument';
        return '[Quelle ' + (i + 1) + ': ' + titel + ']\n' + c.content;
      })
      .join('\n\n---\n\n');

    // 6. Claude antworten lassen
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'Du bist der kompetente Mitarbeiter-Assistent von ARGONAUT OS. Du hilfst dem Mitarbeiter, Informationen aus den Firmendokumenten zu finden, zu verstehen und aufzubereiten. Regeln: Bei Faktenfragen antwortest du nur auf Basis der bereitgestellten Dokument-Auszuege und erfindest nichts. Wenn eine Information nicht in den Auszuegen steht, sage es kurz und biete an, wonach du stattdessen suchen kannst. Wenn der Mitarbeiter um eine Zusammenfassung, eine strukturierte Liste, eine Tabelle oder eine Aufbereitung bittet, erstelle diese direkt und uebersichtlich aus den vorhandenen Inhalten - das ist deine Kernaufgabe. Wenn jemand nach dem Erstellen einer herunterladbaren Datei (Word, Excel, PDF) fragt, erklaere freundlich, dass du den Inhalt hier im Chat fertig aufbereitest und der direkte Datei-Download in Kuerze als Funktion kommt - liefere dann trotzdem den fertigen, kopierbaren Inhalt. Sei loesungsorientiert und souveraen, niemals hilflos. Antworte praezise auf Deutsch und strukturiere laengere Antworten mit Ueberschriften und Aufzaehlungen. Nenne am Ende keine Quellen-Nummern, das uebernimmt die Oberflaeche.',
        messages: [
          {
            role: 'user',
            content: 'Dokument-Auszuege:\n\n' + kontext + '\n\n---\n\nFrage des Mitarbeiters: ' + frage,
          },
        ],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error('Claude Fehler:', t);
      return NextResponse.json({ error: 'Antwort fehlgeschlagen.' }, { status: 500 });
    }
    const claudeData = await claudeRes.json();
    const antwort = claudeData.content.map((b: any) => b.text || '').join('');

    // 7. Quellen (eindeutige Dokumentnamen) zurueckgeben
    const quellen = [...new Set(chunks.map((c: any) => docMap.get(c.document_id) || 'Unbekannt'))];

    return NextResponse.json({ antwort, quellen });
  } catch (err: any) {
    console.error('Mitarbeiter-Chat Fehler:', err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
