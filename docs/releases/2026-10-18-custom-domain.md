# BIG MATCH — custom domain migration, 18 October 2026

Requested destination: https://bigmatch.justcolors.net/.
The owner has configured the Cargo DNS record and the GitHub Pages custom domain; the last supplied screenshot confirms successful DNS verification, with certificate issuance pending.

## Scope

- Publish the existing app at `/`, with the canonical production URL set explicitly in the Pages workflow. This intentionally supersedes the old repository-level VITE_APP_URL variable for production. Keep the configurable Vite default for local/prefix development.
- Add only the exact HTTPS production origin to the deployed Edge entrypoint, retaining all existing configured origins. No credentials are exposed or changed. The request handler, SQL schema, event data, retention, authorization and matching rules remain unchanged.
- Test both `/big-match/` and `/` on desktop Chromium, mobile Chromium and WebKit, using local fixtures only, including the existing pre-order regressions.
- Keep all 28 card artworks, HTML, CSS, game mechanics and pre-order UI unchanged. No Vague Vase repository or Shopify/DNS setting is modified by this release.
- Before publishing, check real backend CORS using GET and OPTIONS only. After publishing, verify valid HTTPS, exact bytes for all public files, and the redirect from the old GitHub Pages URL. These hosted checks must not create participants or pre-orders.

## Deployment order and evidence

1. Validate the candidate on its fix branch.
2. Deploy the corresponding Edge entrypoint/configuration with the existing handler and `verify_jwt=false` retained; the handler continues verifying private bearer tokens with Auth.
3. Fast-forward the reviewed candidate to main, with the expected old main SHA checked. The narrowly scoped push trigger is an explicit one-time release request and still requires the existing PAGES_DEPLOY_ENABLED flag and all CI gates.
4. Read the production workflow results and hosted verification output. A code commit alone is not evidence of successful deployment or certificate issuance.
5. Remove the one-time branch/path trigger after publication; retain manual and release-tag publication.

Server-side data remains in the same Supabase project. Browser-local sessions and cached choices do not transfer automatically between origins. No attempt is made to export them or generate replacement participation records.

## Rollback

Restore the previous Pages production base/URL and GitHub Pages custom-domain setting together, then run a checked release. Do not alter Vague Vase. The additive HTTPS origin can be left in place during rollback or removed by redeploying the previous Edge entrypoint. No database rollback is required.


## Follow-up release — 20 October 2026

Explicitly requested production publish after merge commit `17570863bb1ba61b5bad51658f17bc0272cc757c`.
Scope: reset the visible personal selection to 0/3 when a completed match is closed, while preserving the already-saved participation and its contribution to community counts. No matching, aggregate-map, pre-order, privacy, retention or authorization rule is changed by this follow-up.

Pre-deploy validation: GitHub Actions run 39420608220 completed successfully for both the custom-domain root and the legacy /big-match/ prefix.

## Follow-up release — 22 October 2026

Explicitly requested production publish after merge commit `aec168aa3b557f2fd073555f3cbd31fa881e8b0a`.
Scope: add a results-page message explaining that every BIG MATCH response contributes to a final collective result; at the end of BIG, the three most selected Impersonae will be published. The callout links directly to `@justcolors____` on Instagram. No matching, aggregation, pre-order, privacy, retention or authorization rule is changed.

Pre-deploy validation: static checks, 63 application/SQL tests, 9 service-worker tests, release build and the complete GitHub-prefix browser matrix succeeded. The production workflow repeats all release gates before publishing.


## Follow-up release — 22 October 2026

Production publish requested during BIG after visitor feedback on the result screen.
Scope: move the final collective reveal message immediately below the visitor's three-card result, before sharing controls, and add a prominent follow CTA to @justcolors____. Existing matching, BIG MIND aggregates, participation persistence, privacy, pre-order, and backend logic are unchanged.


## Follow-up release — 22 October 2026, optional catalogue request

Publish the reviewed catalogue contact form added to the BIG MATCH results page. The interface shows the form only when the event is open and contact_enabled is true. The backend has been enabled with a dedicated updated privacy notice. Submission checks a successful server acknowledgement before showing success; no newsletter consent is inferred. Confirm the deployed release displays the form and that contacts are persisted after explicit consent. Existing matches and preorder data remain unchanged.


## Follow-up release — 23 October 2026

Production publish requested to correct the visible label for card id 11 from "Otherthinker" to "Overthinker". Technical identity is unchanged: id 11, slug `otherthinker`, image file `cards/otherthinker.jpg`, backend data, match logic and counts are untouched. The frontend display label updates automatically in card listings, result names and the card-frequency ranking.
