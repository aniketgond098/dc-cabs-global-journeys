# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Booking API (server routes)

| Method and path                                                    | Purpose                                                    | Required query/header values                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/v1/catalog/countries`                                    | Active countries                                           | —                                                              |
| `GET /api/v1/catalog/regions?country_id=...`                       | Active regions in an active country                        | `country_id` UUID                                              |
| `GET /api/v1/catalog/cities?country_id=...&region_id=...`          | Active cities with active parents                          | `country_id` UUID; optional `region_id` UUID                   |
| `GET /api/v1/catalog/locations?city_id=...`                        | Active pickup/drop locations                               | `city_id` UUID                                                 |
| `GET /api/v1/catalog/vehicle-categories?city_id=...&pickup_at=...` | Active categories available in that city/date              | `city_id` UUID; optional ISO `pickup_at`                       |
| `POST /api/v1/quotes`                                              | Create a server-priced quote                               | Validated trip, route, pickup, category, and passenger data    |
| `POST /api/v1/bookings`                                            | Create a guest booking draft from an open quote            | `Idempotency-Key` header and customer details                  |
| `POST /api/v1/payments/create-order`                               | Create or reuse a Razorpay test order for a guest booking  | Booking ID and server-issued payment access token              |
| `POST /api/v1/payments/verify`                                     | Verify Checkout signature and fetch captured payment state | Booking ID, payment access token, order/payment IDs, signature |
| `POST /api/v1/payments/webhook`                                    | Verify and process Razorpay payment events                 | Raw body and `X-Razorpay-Signature` header                     |
| `GET /api/v1/payments/status?booking_id=...`                       | Read authoritative booking/payment state                   | `x-booking-payment-token` header                               |

The `/book` page lets customers select an active catalog hub or enter a customer address within an active Indian service city. A custom address has no fabricated catalog ID. When a quote is requested, the server validates the city, geocodes each address, calculates the road route, then asks the database pricing resolver to create a quote. It never accepts browser coordinates, distance or duration as pricing inputs. Booking still uses the idempotent booking API and existing payment checkout. The confirmation page loads status through the protected payment status endpoint and displays the saved addresses. Do not pass the payment access token in a URL.

The quote endpoint rejects unknown fields such as `amount` or `totalAmount`. It invokes the database pricing resolver and quote function; it does not calculate a client-provided price. The booking endpoint accepts only a quote ID and customer details, then copies the quote snapshot and amounts into a `payment_pending` booking with payment status `pending`.

The current database formula uses the selected rule's base fare, applicable distance overages, per-day driver allowance, the night surcharge for local pickup times from 22:00 to 06:00, airport charge for airport routes, configured toll charge, and configured tax percentage. Airport and outstation distance is calculated server-side from the selected addresses; outstation distance is raised to the configured minimum daily kilometres times the trip days. Server-calculated route duration is saved only as a display estimate and is never billable rental time. Local packages require a complete rental itinerary and contracted hours; until those inputs are supported, their online quote fails closed. Airport rules that require billable extra hours also fail closed until an actual/contracted service-duration input exists.

The server runtime needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; the legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Set these as server secrets in the app's runtime. Do not use `VITE_` prefixes or expose these values to the browser.

MapLibre GL JS provides map visualization with a dark luxury DC Cabs style based on OpenStreetMap and OpenFreeMap vector data without proprietary API key requirements. Browser location suggestions use Photon OpenStreetMap search and the optional map preview uses OSRM. The quote API independently geocodes addresses and calculates a road route server-side with bounded requests; if that validation fails, no quote is created. Customers may select a custom address without matching a catalog location, but the server requires an active supported Indian city and an approved, effective pricing rule. No fallback coordinates, distance or duration are invented. Map and geocoding outages do not block journey entry; server route-validation outages prevent quoting. Custom browser providers remain configurable via `VITE_MAP_STYLE_URL`, `VITE_GEOCODING_API_URL`, and `VITE_ROUTING_API_URL`.

Catalog location coordinates are stored with the location records and used only to enrich the optional route preview. The currently seeded Mumbai feature coordinates are sourced from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under the ODbL; locations without verified coordinates remain selectable and simply have no route estimate.

Razorpay checkout is test-mode locked. Configure `RAZORPAY_KEY_ID` with a `rzp_test_` key ID, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` as server-side Netlify environment variables. The API returns only the test key ID and an opaque per-booking payment token to the guest browser. The webhook endpoint must be configured for `payment.captured` and `payment.failed`; the webhook secret must match the secret configured in the Razorpay dashboard. Do not configure live keys with this implementation.

The Phase 5A seed contains temporary Asian Paints test pricing. It is only for booking-engine validation and must not be presented as public DC Cabs rates. Online quotes require active catalog records, vehicle availability, and a matching pricing rule for the selected city and trip.
