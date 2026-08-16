const params = new URLSearchParams(window.location.search);
const API_BASE = params.get('apiBase') || (window.location.origin);

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'خطأ غير معروف' }));
    throw new Error(err.error || 'حدث خطأ في الاتصال بالخادم');
  }
  return res.json();
}

const API = {
  get: (path) => api('GET', path),
  post: (path, body) => api('POST', path, body),
  put: (path, body) => api('PUT', path, body),
  del: (path) => api('DELETE', path),
  base: API_BASE
};
