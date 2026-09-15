// Single shared-secret auth. This is a personal, single-user app: every request
// (from your own browser, or from Claude calling the API directly) must send
//   Authorization: Bearer <APP_SECRET>
// There's no per-user login system because there's only ever one user.
export function isAuthorized(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const expected = process.env.APP_SECRET;
  if (!expected) return false;
  return token === expected;
}

export function requireAuth(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}
