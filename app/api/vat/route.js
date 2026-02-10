import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country')
    const number = searchParams.get('number')
    
    if (!country || !number) {
      return NextResponse.json(
        { error: 'Missing country or number parameter' },
        { status: 400 }
      )
    }
    
    const viesUrl = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${encodeURIComponent(country)}/vat/${encodeURIComponent(number)}`
    
    const response = await fetch(viesUrl)
    const data = await response.json()
    
    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
