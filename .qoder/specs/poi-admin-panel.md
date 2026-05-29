# POI Data Management Admin Panel

## Overview

Build an independent admin panel for managing POI (Point of Interest) data. The admin runs as a separate Vite entry point alongside the existing user-facing app, with its own routing (react-router-dom), UI (shadcn/ui), and API routes (`/api/admin/*`).

## Architecture

```
admin.html  ──→  admin/main.tsx  ──→  React 18 + react-router-dom
                                           │
                  Vite 6 multi-entry        │  shadcn/ui components
                                           │
server/index.ts  ──→  /api/admin/*  ──→  better-sqlite3 (server DB + agent DB)
                                    ──→  child_process.spawn(agent CLI)
```

### Key Decisions
- **Completely independent** from the user app (separate HTML, entry point, routing)
- **shadcn/ui** component library (CVA + Tailwind CSS variables, already partially in use)
- **Field provenance: display only** (show current source + confidence, no history tracking)
- **Data updates: Server calls Agent CLI** via `child_process.spawn()`

---

## Phase 1: Foundation

### 1.1 Vite Multi-Entry (`vite.config.ts`)
- Add `admin.html` as second entry via `build.rollupOptions.input`
- Add `@admin` alias → `./admin`
- Extend proxy: `/api/admin` → `http://127.0.0.1:3001`

### 1.2 `admin.html`
- Copy structure from `index.html` (same Google Fonts: Inter + Noto Sans SC)
- Script: `/admin/main.tsx`
- Title: "POI Admin"

### 1.3 Tailwind (`tailwind.config.ts`)
- Add `'./admin/**/*.{ts,tsx}'` to content array
- Admin uses same CSS variable system; reuse existing design tokens

### 1.4 `admin/` Directory Structure
```
admin/
  main.tsx                 # React root + BrowserRouter
  App.tsx                  # Route definitions
  index.css                # Tailwind imports + admin CSS variables
  components/
    layout/
      AdminLayout.tsx      # Sidebar + Header + <Outlet>
      Sidebar.tsx          # Nav links: Dashboard, Cities, POIs, Updates
      Header.tsx           # Breadcrumb + search
    ui/                    # shadcn/ui components (adapted from src/components/ui/)
      button.tsx           # (copy + adapt from existing)
      input.tsx
      select.tsx
      table.tsx
      dialog.tsx
      badge.tsx
      tabs.tsx
      card.tsx
      pagination.tsx
      dropdown-menu.tsx
      tooltip.tsx
      progress.tsx
      separator.tsx
      skeleton.tsx
      textarea.tsx
      label.tsx
      checkbox.tsx
    dashboard/
      StatsCards.tsx       # Total POIs, cities, categories, last update
      RecentUpdates.tsx    # Recent update jobs list
    cities/
      CityTable.tsx        # DataTable: country, city, POI count, last update
      CityFormDialog.tsx   # Add/edit country+city dialog
    pois/
      POITable.tsx         # List view: name, category, rating, coords, updated
      POIFilters.tsx       # L1 tabs + L2/L3 dropdown filters
      POISearch.tsx        # Search input with scope toggle (global/city)
      POIDetail.tsx        # Full POI info page
      POISourceInfo.tsx    # Field-level source provenance display
      Pagination.tsx       # Configurable page size (20/50)
    updates/
      BatchUpdateDialog.tsx   # Select country/city/L1 → trigger batch update
      TargetUpdateDialog.tsx  # Trigger single POI update
      UpdateJobList.tsx       # Job history table
      UpdateJobProgress.tsx   # Real-time progress indicator
  hooks/
    usePOIs.ts             # POI list/search API hook
    useCities.ts           # City CRUD API hook
    useCategories.ts       # Category tree hook
    useUpdateJobs.ts       # Update job management hook
    useDebounce.ts         # Debounced search input
  lib/
    api.ts                 # Fetch wrapper (base URL, error handling)
    utils.ts               # cn() utility (shared with main app)
    formatters.ts          # Date, coordinate, category formatters
  types/
    index.ts               # Admin-specific TypeScript types
```

### 1.5 `admin/index.css`
- Tailwind directives (`@tailwind base/components/utilities`)
- CSS custom properties for admin color scheme (slate blue primary)
- Reuse existing design token pattern from `src/index.css`

### 1.6 Router (`admin/App.tsx`)
```
/admin                   → Dashboard
/admin/cities            → City Management
/admin/pois              → POI Browser (list)
/admin/pois/:id          → POI Detail
/admin/updates           → Update Jobs
```

---

## Phase 2: Server Admin API

### 2.1 New Route Group in `server/index.ts`

Register `/api/admin` routes (inline or separate router file `server/admin-routes.ts`):

```
GET    /api/admin/stats                    → Dashboard statistics
GET    /api/admin/cities                   → List all cities with POI counts
POST   /api/admin/cities                   → Add new city (country + city name + coords)
PUT    /api/admin/cities/:cityId           → Update city info
DELETE /api/admin/cities/:cityId           → Remove city
GET    /api/admin/categories               → Category tree (L1/L2/L3)
GET    /api/admin/pois                     → POI list with query params:
                                              ?city=&l1=&l2=&l3=&q=&page=&pageSize=
GET    /api/admin/pois/:id                 → Single POI detail + field sources
GET    /api/admin/pois/search              → Global search: ?q=&scope=&city=
POST   /api/admin/updates/batch            → Trigger batch update { country?, city?, l1? }
POST   /api/admin/updates/targeted         → Trigger single POI update { poiId, cityId }
GET    /api/admin/updates                  → List update jobs (history)
GET    /api/admin/updates/:id              → Job status + progress
```

### 2.2 Agent DB Access

Server opens the agent's SQLite database (read-only) to query:
- `city_pois` table (POI data stored as JSON blobs per city+season)
- `poi_field_sources` table (new, created by agent merger)

Server DB connection remains for:
- `admin_update_jobs` table (new)
- `city_registry` table (new, or read from `scripts/city-registry.json`)

### 2.3 New DB Tables (Server Side)

**`admin_update_jobs`** in `server/db.ts`:
```sql
CREATE TABLE IF NOT EXISTS admin_update_jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL,           -- 'batch' | 'targeted'
  status      TEXT    NOT NULL DEFAULT 'pending',  -- pending|running|completed|failed
  config      TEXT    NOT NULL,           -- JSON: { country, city, l1, poiId }
  progress    TEXT,                       -- JSON: { current, total, message }
  result      TEXT,                       -- JSON: final stats
  error       TEXT,
  pid         INTEGER,                    -- child process PID
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  started_at  INTEGER,
  completed_at INTEGER
)
```

**`city_registry`** (optional — could also just read from JSON file):
```sql
CREATE TABLE IF NOT EXISTS city_registry (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_en    TEXT,
  country    TEXT,
  lat        REAL,
  lng        REAL,
  hotness    INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
)
```

### 2.4 Agent CLI Execution

For update jobs, server uses `child_process.spawn`:
```typescript
const child = spawn('npx', ['tsx', 'agent/index.ts', 'collect', '--city', cityId], {
  cwd: process.cwd(),
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

- Parse stdout for progress updates (agent emits structured log lines)
- Update `admin_update_jobs` row with progress
- Client polls `GET /api/admin/updates/:id` for progress

### 2.5 POI List Query Logic

Since POIs are stored as JSON blobs in `city_pois`:
1. Filter cities by query params (city, country)
2. Load JSON data for matching cities
3. Parse and filter POIs in memory (by L1/L2/L3, search query)
4. Paginate results
5. Return enriched with field_sources from agent DB

### 2.6 Search Algorithm

Scored matching (higher = better match):
| Match Type     | Score | Example                         |
|---------------|-------|----------------------------------|
| Exact name    | 100   | "故宫博物院" = "故宫博物院"       |
| Name prefix   | 70    | "故宫" prefix of "故宫博物院"     |
| Name contains | 40    | "博物" in "故宫博物院"            |
| Alias match   | 60    | aliases array contains query     |
| Address match | 30    | address contains query           |
| L2/L3 tag     | 25    | category path matches            |
| Description   | 20    | description contains query       |

Results sorted by score descending, with threshold ≥ 20.

---

## Phase 3: Admin UI Shell

### 3.1 AdminLayout
- Fixed sidebar (240px, collapsible to 64px icon-only)
- Top header with breadcrumb navigation
- Main content area with max-width 1400px
- Responsive: sidebar collapses to drawer on mobile

### 3.2 Sidebar Navigation
- Dashboard (LayoutDashboard icon)
- City Management (MapPin icon)
- POI Browser (Database icon)
- Updates (RefreshCw icon)
- Active state highlight based on current route

### 3.3 Design System
- Primary: slate blue (`hsl(222, 47%, 41%)`)
- Background: cool gray (`hsl(220, 14%, 96%)`)
- Surface: white cards with subtle shadow
- Typography: Inter (already loaded via Google Fonts)
- Same CSS variable pattern as existing app

---

## Phase 4: City Management

### 4.1 CityTable
- Columns: Country, City Name, City Name (EN), POI Count, Last Updated, Actions
- Sort by any column
- Search filter (client-side)
- Actions: Edit, Delete, "View POIs" (navigate to POI browser with city filter)

### 4.2 CityFormDialog
- Mode: Add / Edit
- Fields: Country (input), City Name (input), City Name EN (input), Latitude, Longitude
- Pre-fill with existing data in edit mode
- Validate coordinates (-90..90, -180..180)

### 4.3 Data Source
- Cities come from `scripts/city-registry.json` (200 cities) + `agent/data/city-coords.json`
- Admin can add new entries (writes to DB or JSON file)

---

## Phase 5: POI Browser

### 5.1 Layout
Three-section layout:
- **Top bar**: Search input + scope toggle (Global / Current City) + page size selector
- **Left panel**: L1 category tabs (horizontal) + L2/L3 dropdown filters
- **Main area**: POI result table

### 5.2 POITable Columns
- Name (primary name + first alias)
- L1 Category (badge with color)
- L2 > L3 Category (text)
- Rating (stars)
- Coordinates (lat, lng)
- Last Updated (relative time)
- Actions: View Detail

### 5.3 Pagination
- Default: 20 items per page
- Options: 20, 50 per page
- Show total count
- Page navigation: prev/next + page numbers

### 5.4 Search & Filters
- **Global search**: queries all cities (API: `GET /api/admin/pois/search?q=...`)
- **City-scoped search**: queries within selected city
- **Category filters**: L1 tab → L2 dropdown → L3 dropdown (cascading)
- Search matches: primary name, aliases, address, L2/L3 tags (using scored algorithm)

---

## Phase 6: POI Detail & Source Provenance

### 6.1 POIDetail Page
Route: `/admin/pois/:id`

Sections:
1. **Header**: POI name + aliases, L1/L2/L3 category badges, edit button (future)
2. **Basic Info Card**: Rating, cost range, duration, seasons, opening hours
3. **Location Card**: Coordinates, address, map preview (optional: static map image)
4. **Description Card**: Full description text
5. **Tags Card**: All associated tags
6. **Media Card**: Image URLs (if available)
7. **Metadata**: Created at, Updated at, Data version

### 6.2 POISourceInfo Component
For each field, display:
```
┌─────────────────────────────────────────────────────┐
│ Field: name                                         │
│ Value: 故宫博物院                                    │
│ Sources:                                            │
│   ┌──────────┬──────────┬────────────┐              │
│   │ Source   │ Value    │ Confidence │              │
│   ├──────────┼──────────┼────────────┤              │
│   │ osm      │ 故宫博物院│ 0.95       │ ← highlighted│
│   │ google   │ Forbidden City │ 0.80 │              │
│   │ ai       │ 故宫     │ 0.60       │              │
│   └──────────┴──────────┴────────────┘              │
│ Current: osm (confidence: 0.95)                     │
└─────────────────────────────────────────────────────┘
```

Fields with source tracking:
- name, aliases, description, address, rating, cost, duration, tags, images, openingHours, coord

### 6.3 `poi_field_sources` Table (Agent DB)

Created by `agent/merger.ts` during data merge:
```sql
CREATE TABLE IF NOT EXISTS poi_field_sources (
  poi_id      TEXT NOT NULL,
  city_id     TEXT NOT NULL,
  field_name  TEXT NOT NULL,          -- 'name', 'description', 'rating', etc.
  source      TEXT NOT NULL,          -- 'osm', 'google', 'foursquare', 'amap', 'ai'
  value       TEXT NOT NULL,          -- the value from this source
  confidence  REAL NOT NULL DEFAULT 0, -- 0-1 confidence score
  is_selected INTEGER NOT NULL DEFAULT 0, -- 1 if this source was chosen
  PRIMARY KEY (poi_id, field_name, source)
)
```

Agent `merger.ts` writes to this table during the merge pipeline (in the data merge step).

---

## Phase 7: Batch & Targeted Updates

### 7.1 BatchUpdateDialog
- Trigger button in Updates page header
- Form:
  - Country (optional, select)
  - City (optional, select — filtered by country if selected)
  - L1 Category (optional, select — defaults to all)
- "Start Update" button → `POST /api/admin/updates/batch`
- Confirmation dialog before execution

### 7.2 TargetUpdateDialog
- Accessible from POI Detail page ("Refresh This POI" button)
- Auto-fills POI info
- "Refresh" button → `POST /api/admin/updates/targeted`

### 7.3 UpdateJobList
- Table: ID, Type, Config (city/category), Status (badge), Progress, Started, Duration, Actions
- Status badges: pending (yellow), running (blue, animated), completed (green), failed (red)
- Auto-refresh running jobs every 3 seconds

### 7.4 UpdateJobProgress
- Progress bar (current/total)
- Current step message
- Elapsed time
- For running jobs, poll `GET /api/admin/updates/:id`

### 7.5 Agent CLI Integration

Server executes:
```
# Batch update
npx tsx agent/index.ts collect --city <cityId>

# Full refresh
npx tsx agent/index.ts refresh --full --city <cityId>

# Single POI (targeted — collect then merge for that city, filter to specific POI)
npx tsx agent/index.ts collect --city <cityId>
```

Progress parsing: agent stdout emits lines like `[PROGRESS] 5/20 Collecting from osm...` which server parses and stores.

---

## Phase 8: Polish

### 8.1 Dashboard Page
- Stats cards: Total POIs, Total Cities, Categories Covered, Last Update
- Recent update jobs (last 5)
- Data freshness distribution (fresh/recent/aging/stale/expired pie or bar)

### 8.2 Error Handling
- API error responses with consistent format: `{ error: string, details?: string }`
- Client-side toast notifications for errors
- Loading skeletons for all data fetches

### 8.3 Responsive Design
- Desktop: full sidebar + content area
- Tablet: collapsible sidebar
- Mobile: hamburger menu + drawer

---

## File Changes Summary

### New Files
| File | Description |
|------|-------------|
| `admin.html` | Admin HTML entry point |
| `admin/main.tsx` | React root mount |
| `admin/App.tsx` | Router + route definitions |
| `admin/index.css` | Tailwind + admin CSS variables |
| `admin/components/layout/*` | AdminLayout, Sidebar, Header |
| `admin/components/ui/*` | shadcn/ui components |
| `admin/components/dashboard/*` | Dashboard widgets |
| `admin/components/cities/*` | City management UI |
| `admin/components/pois/*` | POI browser + detail UI |
| `admin/components/updates/*` | Update job UI |
| `admin/hooks/*` | Custom React hooks |
| `admin/lib/*` | API client, formatters, utils |
| `admin/types/index.ts` | TypeScript type definitions |
| `server/admin-routes.ts` | Admin API route handlers |

### Modified Files
| File | Changes |
|------|---------|
| `vite.config.ts` | Multi-entry build, `@admin` alias, proxy `/api/admin` |
| `tailwind.config.ts` | Add `'./admin/**/*.{ts,tsx}'` to content |
| `server/index.ts` | Register admin routes |
| `server/db.ts` | Add `admin_update_jobs` table, optional `city_registry` table |
| `agent/db.ts` | Add `poi_field_sources` table creation |
| `agent/merger.ts` | Write field provenance to `poi_field_sources` after merge |
| `package.json` | Add `"admin:dev"` script |

---

## Implementation Order

1. **Foundation** — admin.html, Vite config, Tailwind, admin entry point, UI components, router
2. **Server API** — admin routes, DB tables, POI list/search, city CRUD, categories
3. **UI Shell** — AdminLayout, Sidebar, Header, navigation
4. **City Management** — CityTable, CityFormDialog
5. **POI Browser** — POITable, filters, search, pagination
6. **POI Detail** — POIDetail page, POISourceInfo, agent field_sources integration
7. **Updates** — BatchUpdateDialog, TargetUpdateDialog, job list, progress tracking
8. **Polish** — Dashboard stats, error handling, responsive design
