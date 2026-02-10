import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const body = await request.json()
    
    console.log('[Perplexity] Request model:', body.model)
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify(body),
    })
    
    const data = await response.json()
    
    // Log the full response for debugging
    const content = data.choices?.[0]?.message?.content || ''
    const citations = data.citations || []
    console.log('[Perplexity] Status:', response.status, '| Model:', body.model)
    console.log('[Perplexity] Content:', content.substring(0, 800))
    console.log('[Perplexity] Citations:', citations.length > 0 ? citations.join(', ') : 'NONE')
    
    if (!response.ok || data.error) {
      console.error('[Perplexity] Error:', JSON.stringify(data).substring(0, 500))
    }
    
    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    console.error('[Perplexity] Fetch error:', err.message)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
