export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Authentication and sessions are owned by this application and its database.
// Navigating to customer access opens the local register/sign-in form; no hosted
// OAuth portal or project-specific redirect is involved.
export const startLogin = () => {
  const target = window.location.pathname.startsWith("/ops-console") ||
    window.location.pathname.startsWith("/admin")
    ? "/ops-console-7f3a"
    : "/customer";
  if (window.location.pathname !== target) window.location.assign(target);
};
