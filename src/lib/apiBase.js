// API base URL helper.
//
// In local dev this stays empty and Vite proxies /api → the local Node server
// (see vite.config.js). In the hosted build set VITE_API_BASE to the App Service
// origin (e.g. https://csg-api.azurewebsites.net) so the static SWA frontend
// calls the Express backend cross-origin.
const base = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export const apiUrl = (path) => `${base}${path}`;
