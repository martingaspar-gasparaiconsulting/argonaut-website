import { kiFetch } from '@/lib/ki'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt } = await req.json()

    const response = await kiFetch("chat", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1000,
        system: systemPrompt || 'Du bist der ARGONAUT KI-Assistent. Antworte auf Deutsch, freundlich und pr\u00e4gnant.',
        messages,
      }),
    })

    const data = await response.json()
    const reply = data.content?.[0]?.text || 'Entschuldigung, bitte versuchen Sie es erneut.'
    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ reply: 'Verbindungsfehler. Bitte versuchen Sie es erneut.' }, { status: 500 })
  }
}
