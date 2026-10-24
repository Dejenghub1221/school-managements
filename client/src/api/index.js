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
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login' && path !== '/settings') {
    localStorage.clear();
    location.reload();
  }
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
