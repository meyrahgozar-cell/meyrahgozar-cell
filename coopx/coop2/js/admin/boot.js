// Shared start-up for admin pages: role gate + layout. Returns the signed-in user or null.
import { requireRole, refreshUser, isSuper } from '../auth.js';
import { renderLayout } from '../layout.js';

export async function boot(min = 'admin') {
  const user = requireRole(min);
  if (!user) return null;
  renderLayout();
  try {                                   // the server decides: re-read the role before showing anything
    const fresh = await refreshUser();
    if (min === 'superadmin' ? !isSuper(fresh) : !(fresh.role === 'admin' || fresh.role === 'superadmin')) {
      location.replace(new URL('../../dashboard.html', import.meta.url).href); return null;
    }
    return fresh;
  } catch { return null; }
}

export const genPassword = (n = 9) => {
  const set = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(n); crypto.getRandomValues(a);
  return Array.from(a, (x) => set[x % set.length]).join('');
};
