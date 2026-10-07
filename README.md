# Invoice: synthetic local foundation

This new application practices draft, pending and paid invoice states using original fictional GBP examples. It is not a payment, email, accounting or authenticated service. Data lives only in this origin's browser storage. The supplied Frontend Mentor JSON, design archive, typography and exact visual comparison remain missing. Synthetic records must never be represented as official starter data or real customers.

## Accepted boundaries

Four routes: list, new, detail and edit. UUID invoice/item identities are independent of visible labels. Saved draft and unsaved form are separate. Incomplete bounded fields can be saved as draft. Pending/paid require complete details and at least one valid line. Draft may become pending; pending may become paid; repeated mark-paid is harmless. Paid is read-only in this demo, with named confirmed deletion. These local state rules are not production permissions.

GBP minor units are parsed from decimal strings without binary-money multiplication. Whole quantities 1-9999, unit prices 0-999999.99, up to 50 items. Totals are derived. No taxes, discounts, fractional quantities or currency conversion. Issue dates use calendar years 1900-9998; terms are 1/7/14/30 days. Mark-paid records today's UTC date, visibly labeled.

Zod validates version 1 storage, at most 100 invoices and 2 MB UTF-8. Web Locks serialize expected-raw compare-and-write, including theme/filter. Missing locks block unsafe persistence. Failed/corrupt/stale writes retain draft and saved bytes. Explicit backup/reset/reload handles recovery.

One TanStack Form owns the draft; explicit value resets retain the fixed defaults. App Back/Cancel/new and reload offer save/discard/cancel. Browser-level exit/reload/history uses the browser's native unsaved-change confirmation, which has leave/stay rather than an application Save option.

No auth package, database, API handlers, real financial data, remote fonts, analytics or environment variables.

## Verification status

Source-only preparation at an identified empty local baseline. No install, root lock generation, build, tests, browser, source commit/push or provider setup yet.

Use Node 24.11.1. The first authorized execution must generate/review the root lock, then run npm test, npm run lint, npm run typecheck, npm run build and npm audit --omit=dev. Start on port 4395 only in the serialized runtime slot. The prepared browser helper accepts localhost only and an explicitly selected installed Playwright module. Hosted authentication needs a separate reviewed exact-origin wrapper.

An original receipt SVG and matching 32/96 px raster, 32 px ICO and 180 px Apple icon are prepared. Their source generator uses only the Python standard library. They still need served-artifact and visual inspection. No PWA/offline-installation claim. Titles are generic; no record content appears in metadata. Official asset/design fidelity and later central authentication remain separate gates.
