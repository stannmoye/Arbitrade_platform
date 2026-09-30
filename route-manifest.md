# Route manifest

| Route | Rendering | Purpose |
|---|---|---|
| `/` | Client-rendered SPA | Customer signup/login entry and simulated customer workspace |
| `/customer` | Client-rendered SPA | Customer signup/login and OAuth profile completion |
| `/ops-console-7f3a` | Client-rendered SPA | Unlisted admin login and operations portal |
| `/api/health` | Server | Unauthenticated health check |
| `/api/oauth/google/start` | Server | Google authorization start; reads server-only credentials |
| `/api/oauth/google/callback` | Server | Google authorization-code callback and session creation |
| `/api/oauth/microsoft/start` | Server | Microsoft authorization start; reads server-only credentials |
| `/api/oauth/microsoft/callback` | Server | Microsoft authorization-code callback and session creation |
| `/installer/index.php` | PHP installer | Temporary visual installer; remove after setup |

Dynamic API/OAuth paths must reach the server before any SPA/static catch-all. Personalized responses and OAuth callbacks are not cacheable.
