export function errorHandler(err, req, res, next) {
  console.error('API Error:', err);
  if (err.code === '23505') {
    return res.status(400).json({ error: `Duplicate entry: ${err.detail || err.message}` });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: `Referenced entity not found: ${err.detail || err.message}` });
  }
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
}
