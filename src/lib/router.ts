import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parse(): Route {
  // Supabase auth callbacks put tokens in the hash (#access_token=...); treat anything
  // that is not a "#/" route as the home page.
  const hash = window.location.hash;
  if (!hash.startsWith('#/')) return { path: '/', params: new URLSearchParams() };
  const [path, query = ''] = hash.slice(1).split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Builds an href like "#/products?status=low", dropping empty params. */
export function href(path: string, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const qs = q.toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(path: string, params: Record<string, string | undefined> = {}, replace = false) {
  const next = href(path, params);
  if (replace) {
    history.replaceState(null, '', next);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = next.slice(1);
  }
}
