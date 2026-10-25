# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dynamic — bare `$`, no curly braces) |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment) |
| `files/$.tsx` | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx` | layout route (renders children via `<Outlet />`) |
| `__root.tsx` | app shell — wraps every page; preserve `<Outlet />` |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Booking API (server routes)

| Method and path | Purpose | Required query/header values |
| --- | --- | --- |
| `GET /api/v1/catalog/countries` | Active countries | — |
| `GET /api/v1/catalog/regions?country_id=...` | Active regions in an active country | `country_id` UUID |
| `GET /api/v1/catalog/cities?country_id=...&region_id=...` | Active cities with active parents | `country_id` UUID; optional `region_id` UUID |
| `GET /api/v1/catalog/locations?city_id=...` | Active pickup/drop locations | `city_id` UUID |
| `GET /api/v1/catalog/vehicle-categories?city_id=...&pickup_at=...` | Active categories available in that city/date | `city_id` UUID; optional ISO `pickup_at` |
| `POST /api/v1/quotes` | Create a server-priced quote | Validated trip, route, pickup, category, and passenger data |
| `POST /api/v1/bookings` | Create a guest booking draft from an open quote | `Idempotency-Key` header and customer details |

The quote endpoint rejects unknown fields such as `amount` or `totalAmount`. It invokes the database pricing resolver and quote function; it does not calculate a client-provided price. The booking endpoint accepts only a quote ID and customer details, then copies the quote snapshot and amounts into a `payment_pending` booking with payment status `pending`.

The current quote formula uses the selected rule's base fare, applicable distance/hour overages, per-day driver allowance, the night surcharge for local pickup times from 22:00 to 06:00, airport charge for airport routes, configured toll charge, and configured tax percentage. This uses estimated distance/duration values only when a selected rule has corresponding extra rates. Rates and their meaning are controlled by active database pricing rules.

The server runtime needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; the legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Set these as server secrets in the app's runtime. Do not use `VITE_` prefixes or expose these values to the browser.

Phase 3A has no location, category, availability, or pricing seed data. Catalog lists therefore remain empty and quote requests return `ONLINE_PRICING_UNAVAILABLE` until authorized catalog and city rate cards are added.
