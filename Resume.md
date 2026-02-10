# LoveLab Mini B2B - Project Resume

> **Last Updated:** February 10, 2026  
> **Current Phase:** Phases 1-4 Complete, Phase 5 (Google Drive Sync) Pending  
> **Status:** Development Server Running

---

## 1. Business Context

### Company Overview
**LoveLab** is a jewelry brand based in Antwerp, Belgium, specializing in diamond bracelets and accessories. The company operates B2B sales, primarily at trade fairs (e.g., Munich 2026), selling to boutiques and retailers across Europe.

### Business Problem
The sales team needs a modern, mobile-friendly tool to:
1. Quickly build quotes for B2B clients at trade fairs
2. Validate EU VAT numbers in real-time (VIES integration)
3. Generate professional PDF quotes and order forms
4. Store documents organized by event/client
5. Eventually sync with internal systems (Laravel) and Google Drive

### Target Users
- Internal sales team (max 10 members)
- Non-technical users who need a simple, intuitive interface
- Mobile-first usage at trade fairs

### Key Business Rules
- **Minimum order:** €800
- **B2B pricing tiers:** Based on quantity thresholds (3+, 10+, 25+, 50+ pieces)
- **VAT handling:** EU companies with valid VAT are exempt; others pay VAT
- **Payment terms:** 50% on order confirmation, 50% before delivery (14 working days)
- **Packaging options:** Black or Pink

---

## 2. Project Scope & Phases

### Phase 1: Vite → Next.js Migration ✅ COMPLETE
- Migrated from Vite SPA to Next.js 14 App Router
- Secured API keys (moved from client-side `VITE_*` to server-side only)
- Created API routes for Anthropic, Perplexity, and VAT validation
- Set up project structure for Vercel deployment

### Phase 2: Supabase + Google Authentication ✅ COMPLETE
- Set up Supabase project (hnmydfafjghtrsrzpbtm)
- Configured Google OAuth for team sign-in
- Implemented email allowlist (7 team members)
- Created login page with English/French localization
- Added Next.js middleware for route protection
- Created `profiles` and `allowed_emails` tables with RLS
- AuthProvider context for global auth state
- UserMenu component with sign out + dashboard navigation

### Phase 3: Document Storage ✅ COMPLETE
- Created Supabase Storage bucket "documents" with policies
- Created `events` and `documents` tables with RLS
- Added "Save Order" button on OrderForm (not Quote - per user feedback)
- Implemented client-side PDF generation (html2canvas + jsPDF)
- Server-side upload proxy at `/api/documents/upload`
- SaveDocumentModal with event selection and creation
- Order Form captures: contact name, full address, event/fair name, "order by" (LoveLab team member)
- Fixed multi-page print CSS

### Phase 4: Dashboard ✅ COMPLETE
- Built `/dashboard` page with event sidebar + document list
- Search by client name or company
- Document preview (signed URLs via server API)
- Document download and delete functionality
- Event creation from dashboard
- Navigation: UserMenu dropdown → Documents link
- Server-side API routes: `/api/documents/preview`, `/api/documents/[id]` (DELETE)

### Phase 5: Google Drive Sync (FUTURE)
- Connect Google Drive API
- Sync uploaded documents to a shared Drive folder
- Two-way sync or one-way push (TBD)

### Phase 6: External API (FUTURE)
- Create authenticated API endpoints
- API key management for internal Laravel system
- Endpoints for quotes, orders, clients data
- Webhook support for real-time updates

---

## 3. Technical Architecture

### Current Stack
| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 14 (App Router) | React framework with SSR/SSG |
| Styling | Inline CSS-in-JS | Component-scoped styles |
| State | React useState/useEffect | Local component state |
| Persistence | localStorage | Client-side session persistence |
| AI Chat | Anthropic Claude | Quote building assistant |
| Company Lookup | Perplexity API (sonar-pro) | Auto-fill company details |
| VAT Validation | VIES REST API | EU VAT number verification |
| Auth | Supabase Auth + Google OAuth | Team authentication |
| Database | Supabase PostgreSQL | Events, documents, profiles |
| Storage | Supabase Storage | PDF file storage |
| PDF Generation | html2canvas + jsPDF | Client-side PDF creation |
| Deployment | Vercel (planned) | Serverless hosting |

### Infrastructure Notes
- **DigitalOcean** is available but not currently used (Vercel preferred for Next.js)
- **Laravel system** exists internally - future API integration planned
- **Google Drive** integration planned for document sync

---

## 4. Project Structure

```
lovelab-mini-b2b/
├── app/                          # Next.js App Router
│   ├── layout.jsx                # Root layout (fonts, metadata, AuthProvider)
│   ├── globals.css               # Global styles
│   ├── page.jsx                  # Entry point (renders App)
│   ├── App.jsx                   # Main application component
│   ├── login/page.jsx            # Login page (Google OAuth)
│   ├── auth/callback/route.js    # OAuth callback handler
│   ├── dashboard/page.jsx        # Documents dashboard
│   ├── components/               # React components
│   │   ├── AuthProvider.jsx      # Auth context provider
│   │   ├── BuilderPage.jsx       # Manual quote builder
│   │   ├── BuilderLine.jsx       # Single product line in builder
│   │   ├── ClientGate.jsx        # Client identification screen
│   │   ├── LoadingDots.jsx       # Loading animation
│   │   ├── MiniQuote.jsx         # Compact quote preview
│   │   ├── OptionPicker.jsx      # AI option selection UI
│   │   ├── OrderForm.jsx         # Full order form (printable)
│   │   ├── QuoteModal.jsx        # Quote preview modal
│   │   ├── SaveDocumentModal.jsx # Save order PDF modal
│   │   └── UserMenu.jsx          # User menu dropdown
│   └── api/                      # API Routes (server-side)
│       ├── anthropic/route.js    # Proxy to Anthropic API
│       ├── perplexity/route.js   # Proxy to Perplexity API
│       ├── vat/route.js          # Proxy to VIES VAT API
│       ├── events/route.js       # Events CRUD
│       ├── documents/route.js    # Documents list + create
│       ├── documents/upload/route.js    # PDF upload proxy
│       ├── documents/preview/route.js   # Signed URL generation
│       └── documents/[id]/route.js      # Document delete
├── lib/                          # Shared utilities
│   ├── api.js                    # API client functions
│   ├── catalog.js                # Product catalog & pricing logic
│   ├── countries.js              # Country list
│   ├── pdf.js                    # PDF generation (html2canvas + jsPDF)
│   ├── prompt.js                 # AI system prompt
│   ├── styles.js                 # Shared style constants
│   ├── utils.js                  # Helper functions
│   ├── vat.js                    # VAT validation logic
│   └── supabase/                 # Supabase clients
│       ├── client.js             # Browser-side client
│       ├── server.js             # Server-side client + admin
│       └── middleware.js          # Session refresh middleware
├── middleware.js                  # Next.js route protection
├── public/                       # Static assets
│   └── logo.png                  # LoveLab logo
├── .env                          # Environment variables (gitignored)
├── .env.example                  # Environment template
├── .gitignore                    # Git ignore rules
├── jsconfig.json                 # Path aliases (@/)
├── next.config.js                # Next.js configuration
├── package.json                  # Dependencies & scripts
├── supabase-setup.sql            # Phase 2 SQL (profiles, allowed_emails)
├── supabase-phase3.sql           # Phase 3 SQL (events, documents)
└── Resume.md                     # This file
```

---

## 5. Product Catalog

### Collections
The app supports multiple jewelry collections, each with specific attributes:

| Collection | Cord Type | Housing Options | Carats Available |
|------------|-----------|-----------------|------------------|
| CUTY | Nylon | Standard (Bezel/Prong) | 0.05, 0.10, 0.15 |
| CUBIX | Nylon | Standard | 0.10, 0.15, 0.25 |
| MATCHY | Nylon | Bezel/Prong variants | 0.03, 0.05 |
| HOLY (D VVS) | Nylon | Standard | 0.10, 0.15, 0.20 |
| MULTI THREE | Silk | Attached/Not Attached | 0.15 |
| SHAPY SPARKLE | Nylon | Bezel/Prong | 0.10, 0.15 |
| SHAPY SHINE | Nylon | Bezel/Prong | 0.10, 0.15, 0.20 |

### Cord Colors
- **Nylon:** 20+ colors (Black, Bordeaux, Navy, Pink, etc.)
- **Silk:** Premium color palette
- **Gold Metal:** Gold-tone options

### Pricing Structure
- Base prices per carat size
- Volume discounts at 3+, 10+, 25+, 50+ quantities
- Prices stored in `lib/catalog.js`

---

## 6. Key Features

### Client Gate
- First screen when app loads
- Captures: Contact name, phone, email, company, country, VAT
- **Company Lookup:** Uses Perplexity API to auto-fill address
- **VAT Validation:** Real-time VIES check (background, non-blocking)
- Skip option for quick access

### Quote Builder (Manual Mode)
- Add multiple product lines
- Select collection → colors → carat → housing → quantity
- "Consistent mode" toggle: apply same settings to all colors
- Real-time price calculation
- Budget tracker with AI recommendations

### AI Advisor (Chat Mode)
- Natural language quote building
- Quick-start suggestion chips
- Filter context (budget, collections, colors)
- Generates structured quotes from conversation
- Option picker for clarifying questions

### Quote Modal
- Full quote preview with line items
- Client details display
- Discount/volume pricing breakdown
- "Finalize" button to proceed to Order Form
- Print-friendly layout

### Order Form
- Professional multi-page layout (A4 landscape)
- Editable fields (pre-filled from quote)
- Side calculator for discounts/delivery/adjustments
- Prepayment tracking
- Signature areas
- Print button (CSS @media print optimized)

---

## 7. API Integration

### Anthropic (Claude)
- **Endpoint:** `/api/anthropic`
- **Purpose:** AI chat for quote building
- **Model:** Claude (via Anthropic API)
- **System prompt:** Defined in `lib/prompt.js`

### Perplexity
- **Endpoint:** `/api/perplexity`
- **Purpose:** Company lookup (address, VAT)
- **Returns:** Structured JSON with company details

### VIES VAT Validation
- **Endpoint:** `/api/vat`
- **Purpose:** Validate EU VAT numbers
- **External API:** `ec.europa.eu/taxation_customs/vies/rest-api`
- **Behavior:** Returns valid/invalid + company name if found

---

## 8. State Management

### localStorage Persistence
Key: `lovelab-b2b-state`

Persisted data:
- `lines` - Builder product lines
- `client` - Client information (when gate passed)
- `clientReady` - Gate completion status
- `curQuote` - Current quote object
- `aiMsgs` - AI conversation history
- `mode` - Current mode (builder/describe)
- `builderBudget` - Budget input
- `aiBudget`, `aiCollections`, `aiColors` - AI filters

### Quote Object Structure
```javascript
{
  lines: [
    {
      product: "CUTY",
      carat: "0.10",
      colorName: "Black",
      housing: "Bezel",
      qty: 5,
      unitB2B: 85,
      lineTotal: 425
    }
  ],
  subtotal: 425,
  discount: 0,
  total: 425,
  minimumMet: false,
  totalQty: 5
}
```

---

## 9. Security Considerations

### Current Protections
- API keys stored server-side only (not exposed to client)
- `.env` file gitignored
- API routes proxy external services
- Google OAuth for authentication (Supabase Auth)
- Email allowlist (7 approved team members)
- Supabase Row Level Security (RLS) on all tables
- Protected routes via Next.js middleware
- Storage policies restrict access to authenticated users
- Server-side upload/preview/delete proxies

### Potential Threats Identified
1. **Unauthorized access** → Mitigated by auth + allowlist
2. **API key exposure** → Mitigated by server-side routes
3. **Data leakage** → Mitigated by RLS policies
4. **Session hijacking** → Mitigated by Supabase secure sessions

---

## 10. Internationalization

### Current Languages
The app content is primarily in English, with French translations:
- **All language changes must be applied to French (and any future languages)**
- Italian was removed per user request - only English + French

### Translation Strategy (To Be Implemented)
- Extract strings to translation files
- Use Next.js i18n or react-intl
- Support: English, French (minimum)

---

## 11. Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Environment Variables Required
```env
ANTHROPIC_API_KEY=your_key_here
PERPLEXITY_API_KEY=your_key_here
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
ALLOWED_EMAILS=email1@gmail.com,email2@gmail.com
```

---

## 12. Deployment

### Target Platform: Vercel
- Automatic deployments from Git
- Serverless functions for API routes
- Edge network for fast global delivery
- Environment variables in Vercel dashboard

### Pre-Deployment Checklist
- [ ] All environment variables set in Vercel
- [ ] Build completes without errors
- [ ] API routes tested
- [ ] OAuth redirect URIs configured (Phase 2)

---

## 13. Future Considerations

### Performance Optimizations
- Image optimization with next/image
- Code splitting (already handled by Next.js)
- API response caching where appropriate

### Accessibility
- Semantic HTML structure
- Keyboard navigation support
- ARIA labels for interactive elements

### Mobile Experience
- Responsive design (already implemented)
- Touch-friendly UI elements
- Offline capability (future PWA consideration)

---

## 14. Key Contacts & Resources

### External Services
- **Supabase:** https://supabase.com (Phase 2)
- **Vercel:** https://vercel.com
- **Anthropic:** https://anthropic.com
- **Perplexity:** https://perplexity.ai

### Company Details (for forms)
```
LOVELAB - The Love Group BV
Schupstraat 20
2018 Antwerpen, Belgium
VAT: BE1017670055
Email: hello@love-lab.com
Web: www.love-lab.com
```

---

## 15. Conversation Context for AI

When starting a new conversation, provide this context:

> This is the LoveLab Mini B2B project - a quote building tool for a jewelry company's B2B sales team. The app runs on Next.js 14 App Router with Supabase for auth, database, and storage. Phases 1-4 are complete: Next.js migration, Google OAuth authentication with email allowlist, document storage (PDF orders organized by events), and a dashboard for viewing/downloading/deleting saved documents. Phase 5 (Google Drive sync) and Phase 6 (External API) are pending. The user is non-technical and prefers step-by-step guidance. All language-related changes must be applied to English and French.

---

*This Resume.md should be included at the start of new chat conversations to provide full project context.*
