# LoveLab B2B Quote Calculator

AI-powered B2B quote calculator for LoveLab Antwerp — built for trade fairs (Munich 2026).

## Features

- **Chat interface** — type natural language orders ("30 CUTY 0.10 in Black, Red")
- **Visual builder** — tap ☰ to select collections, carats, colors visually
- **Smart budget splitting** — "€2000 split between CUTY and SHAPY" auto-optimizes carats
- **Live quotes** — inline mini-quotes + full printable quote modal
- **All 11 collections** with complete B2B pricing, cord colors, and minimum rules

## Quick Start

```bash
# 1. Clone
git clone <your-repo-url>
cd lovelab-b2b

# 2. Install
npm install

# 3. Add your API key
cp .env.example .env
# Edit .env and add your Anthropic API key

# 4. Run
npm run dev
```

Open http://localhost:3000

## Project Structure

```
src/
├── App.jsx                  # Main app shell
├── main.jsx                 # React entry
├── components/
│   ├── BuilderLine.jsx      # Single collection row in builder
│   ├── BuilderPanel.jsx     # Bottom-sheet visual builder
│   ├── LoadingDots.jsx      # Typing indicator
│   ├── MiniQuote.jsx        # Inline quote in chat
│   └── QuoteModal.jsx       # Full printable quote
└── lib/
    ├── api.js               # Anthropic API calls via proxy
    ├── catalog.js           # Product data, prices, colors
    ├── prompt.js            # AI system prompt
    ├── styles.js            # Shared style constants
    └── utils.js             # Formatters & helpers
```

## How It Works

1. **Dev server** runs a Vite middleware proxy at `/api/chat` → forwards to Anthropic API
2. Your API key stays server-side (never exposed to the browser)
3. AI responds with structured JSON containing quote calculations
4. Frontend renders chat + inline quotes + full printable modals

## B2B Rules

- Minimum order: **€1600** or **100 pieces**
- **10% discount** when subtotal ≥ €1600
- Min pieces per color: CUTY/CUBIX = 3, all others = 2
- Delivery: 4–6 weeks
- 18KT gold plating available on request

## Configuration

Edit `src/lib/catalog.js` to update prices, collections, or colors.
Edit `src/lib/prompt.js` to adjust AI behavior.

## Production Deployment

The Vite dev proxy only works locally. For production, you'll need a server-side endpoint.
Options:
- **Vercel**: Add `api/chat.js` serverless function
- **Netlify**: Add `netlify/functions/chat.js`
- **Express**: Mount the proxy middleware on your Node server

## Tech Stack

- React 18 + Vite
- Claude Haiku 4.5 (fast, cheap, perfect for structured tasks)
- Zero CSS frameworks — inline styles for portability
