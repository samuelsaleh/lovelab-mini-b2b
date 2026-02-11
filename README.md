# LoveLab B2B Quote Calculator

AI-powered B2B quote calculator for LoveLab Antwerp -- built for trade fairs (Munich 2026).

## Features

- **Visual Builder** -- select collections, carats, colors, and build orders visually
- **AI Chat Advisor** -- describe client needs in natural language; AI builds the optimal quote
- **Smart Budget Splitting** -- "I have a budget of 2000" generates AI recommendations
- **Live Quotes** -- inline mini-quotes + full printable quote modal with Belgian VAT support
- **Order Form** -- professional order form with PDF generation
- **Document Management** -- save, preview, and manage quotes/orders by event
- **Client Management** -- search, save, and auto-fill client details with VAT validation (VIES)
- **Multi-language** -- English and French (language switcher in user menu)
- **All 11 collections** with complete B2B pricing, cord colors, and minimum rules

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Authentication**: Supabase Auth (Google OAuth)
- **Database**: Supabase (PostgreSQL with RLS)
- **AI**: Anthropic Claude + Perplexity (for company lookups)
- **PDF**: html2canvas + jspdf
- **Styling**: Inline styles with design system (`lib/styles.js`)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your API keys

# 3. Run database migrations
# Run supabase-setup.sql, supabase-phase3.sql, and supabase-phase4-fixes.sql
# in your Supabase SQL Editor (in that order)

# 4. Start dev server
npm run dev
```

Open http://localhost:3000

## Project Structure

```
app/
  ├── page.jsx              # Main page (renders App)
  ├── App.jsx               # Main app shell (builder, AI, orders)
  ├── layout.jsx            # Root layout (auth + i18n providers)
  ├── error.jsx             # Error boundary page
  ├── loading.jsx           # Loading skeleton
  ├── not-found.jsx         # 404 page
  ├── login/page.jsx        # Google OAuth login
  ├── dashboard/page.jsx    # Full-page document management
  ├── auth/callback/route.js # OAuth callback handler
  ├── api/
  │   ├── anthropic/        # Claude AI proxy (authenticated)
  │   ├── perplexity/       # Perplexity proxy (authenticated)
  │   ├── vat/              # EU VIES VAT validation
  │   ├── clients/          # Client CRUD
  │   ├── documents/        # Document management + upload + preview
  │   └── events/           # Event/fair management
  └── components/
      ├── AuthProvider.jsx  # Auth context
      ├── BuilderPage.jsx   # Visual order builder
      ├── ClientGate.jsx    # Client selection/entry
      ├── CollectionConfig.jsx # Collection configuration
      ├── ConfirmDialog.jsx # Styled confirm/alert dialog
      ├── DocumentsPanel.jsx # Documents sidebar panel
      ├── ErrorBoundary.jsx # React error boundary
      ├── MiniQuote.jsx     # Compact inline quote
      ├── OptionPicker.jsx  # AI suggestion picker
      ├── OrderForm.jsx     # Printable order form
      ├── QuoteModal.jsx    # Full quote preview modal
      ├── SaveDocumentModal.jsx # Save document flow
      ├── TopNav.jsx        # Navigation tabs
      └── UserMenu.jsx      # User menu + language switcher
lib/
  ├── api.js                # AI API calls (Claude, Perplexity)
  ├── catalog.js            # Product data, prices, colors, quote calculation
  ├── countries.js          # Country list
  ├── i18n/                 # Internationalization (EN/FR)
  ├── pdf.js                # PDF generation utilities
  ├── prompt.js             # AI system prompt
  ├── rateLimit.js          # In-memory rate limiter
  ├── styles.js             # Design system (colors, typography, presets)
  ├── supabase/             # Supabase client (browser, server, middleware)
  ├── useIsMobile.js        # Responsive hooks
  ├── utils.js              # Formatters (currency, dates, colors)
  └── vat.js                # VAT validation (VIES API)
```

## B2B Rules

- Minimum order: **EUR 800**
- **10% discount** when subtotal >= EUR 1,600
- Min pieces per color: CUTY/CUBIX = 3, all others = 2
- Delivery: 4-6 weeks
- 18KT gold plating available on request

## Configuration

- **Prices & Products**: Edit `lib/catalog.js`
- **AI Behavior**: Edit `lib/prompt.js`
- **Translations**: Edit `lib/i18n/translations.js`
- **Design System**: Edit `lib/styles.js`

## Database Migrations

Run these SQL files in order in the Supabase SQL Editor:

1. `supabase-setup.sql` -- Profiles, allowed emails, events, RLS policies
2. `supabase-phase3.sql` -- Documents table, storage policies
3. `supabase-phase4-fixes.sql` -- Indexes, updated_at columns, FK fixes, clients table

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `PERPLEXITY_API_KEY` | Yes | Perplexity API key for company lookups |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `ALLOWED_EMAILS` | Optional | Comma-separated email allowlist (fallback) |
| `ALLOWED_HOSTS` | Optional | Comma-separated allowed redirect hosts |
