<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- All site copy, contact details, fleet, cities and destinations live in `src/content/site.ts`; pages only render it — keeps facts in one auditable place.
- Enquiry form has no backend: it validates and opens WhatsApp (email fallback) with the details — the site is a lead-gen brochure, no Cloud needed.
- Never add stats, prices, specs, testimonials or claims not in the client's company material — client requirement for factual accuracy.
- No `lovable-assets` pointers or `/__l5e/` URLs: the user self-hosts via GitHub pushes, so every image must be a regular file imported from `src/assets` (or `public/`) — Lovable CDN paths don't exist on their host.
- Customer booking UI uses `src/lib/booking-client.ts` as its browser-only REST boundary; never import the existing server `booking-api.ts` into UI, so frontend work preserves the tested backend.
- Frontend preview locations/vehicles are isolated from authoritative catalog availability; no quote, booking or payment mutation runs until explicit future integration, preventing demonstration journeys from becoming transactions.
- Load Mapbox dynamically inside the booking map effect and clean it up; browser tokens, styles and routing remain outside SSR and non-booking pages.
