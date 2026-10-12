// In dev: Vite proxy forwards /api → localhost:4000 (no BASE needed)
// In production: VITE_API_URL must be set to the backend service URL
const BASE = import.meta.env.VITE_API_URL || '';

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
