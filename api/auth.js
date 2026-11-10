/**
 * Step 1 of the content-manager sign-in: send the editor to GitHub.
 * Needs GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (a GitHub OAuth app whose
 * callback URL is https://<your-domain>/api/callback).
 */
import crypto from 'node:crypto';

export default function handler(req, res) {
  const { GITHUB_CLIENT_ID } = process.env;
  if (!GITHUB_CLIENT_ID) return res.status(503).send('Content manager sign-in is not configured (GITHUB_CLIENT_ID missing).');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `decap_oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', `https://${host}/api/callback`);
  url.searchParams.set('scope', 'repo,user');
  url.searchParams.set('state', state);
  res.setHeader('Location', url.toString());
  res.status(302).end();
}
