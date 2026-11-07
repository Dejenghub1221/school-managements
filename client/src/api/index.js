// Same origin in production — Express serves both the API and the frontend.
// In dev, Vite proxy forwards /api → localhost:4000 (set in vite.config.js).
const rawUrl = import.meta.env.VITE_API_URL;
const BASE = (rawUrl && !rawUrl.includes('your-backend-url') && !rawUrl.includes('example.com')) ? rawUrl : '';

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: 'Bearer ' + token })
    },
    body: body && JSON.stringify(body)
  });
  if (res.status === 204) return {};
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // If backend returned HTML (e.g. 404 Cannot DELETE ... or 500 HTML)
    const cleanMsg = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    data = { error: cleanMsg || `Request failed (${res.status})` };
  }
  if (res.status === 401 && path !== '/login' && path !== '/settings') {
    localStorage.clear();
    location.reload();
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}
