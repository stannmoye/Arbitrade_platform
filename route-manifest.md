# Route manifest

This manifest reflects the current source-level entry routing. It is not a substitute for runtime HTTP, authentication, or browser verification.

| Route | Rendering / handler | Purpose and access notes |
|---|---|---|
| `/` | Client-rendered SPA → `PortalGateway` | Portal gateway with customer and administrator entry points. |
| `/customer` | Client-rendered SPA → `CustomerPortal` | Customer signup/sign-in and authenticated session resolution via `trpc.auth.me`; OAuth profile completion is handled by the server callback flow. |
| `/ops-console-7f3a` | Client-rendered SPA → `AdminRoute` | Unlisted administrator sign-in and operations portal; server-side authorization remains mandatory. Current source matches any path beginning with this prefix. |
| Other non-root, non-admin paths | Client-rendered SPA → `CustomerPortal` | The current client routing falls back to the customer portal. Confirm server/static fallback behaviour and whether unknown paths should instead return a not-found view. Customer sections are primarily in-app state, not separate URL paths. |
| `/api/health` | Express server | Unauthenticated health check. |
| `/api/oauth/google/start` | Express server | Google authorization start; reads server-only credentials. |
| `/api/oauth/google/callback` | Express server | Google authorization-code callback and session creation. |
| `/api/oauth/microsoft/start` | Express server | Microsoft authorization start; reads server-only credentials. |
| `/api/oauth/microsoft/callback` | Express server | Microsoft authorization-code callback and session creation. |
| `/api/trpc` | Express/tRPC server | Client API transport used by the SPA; each procedure must enforce its own authentication and authorization requirements. |
| `/installer/index.php` | PHP installer | Temporary visual installer; remove or securely disable after setup. |

Dynamic API/OAuth paths must reach the server before any SPA/static catch-all. Personalized responses and OAuth callbacks are not cacheable. Source inspection found an unreachable legacy prototype block after the active route-selection returns in `client/src/App.tsx`; it is not part of the active rendered route tree and should be reviewed separately before removal.
