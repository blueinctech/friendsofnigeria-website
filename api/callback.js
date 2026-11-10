/**
 * Step 2 of the content-manager sign-in: swap GitHub's code for a token and
 * hand it to the Decap CMS window that opened this popup.
 */
export default async function handler(req, res) {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;
  const { code, state } = req.query;
  const cookie = (req.headers.cookie || '').match(/decap_oauth_state=([a-f0-9]+)/)?.[1];

  const send = (status, content) => {
    const msg = JSON.stringify(`authorization:github:${status}:${JSON.stringify(content)}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><script>
      (function () {
        function receive(e) {
          if (e.origin !== location.origin) return;
          window.opener.postMessage(${msg}, e.origin);
          window.removeEventListener('message', receive, false);
        }
        window.addEventListener('message', receive, false);
        window.opener.postMessage('authorizing:github', location.origin);
      })();
    </script>`);
  };

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) return send('error', { message: 'Sign-in is not configured.' });
  if (!code || !state || state !== cookie) return send('error', { message: 'Sign-in expired. Please try again.' });

  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
    });
    const data = await r.json();
    if (!data.access_token) return send('error', { message: data.error_description || 'GitHub refused the sign-in.' });
    send('success', { token: data.access_token, provider: 'github' });
  } catch {
    send('error', { message: 'Could not reach GitHub.' });
  }
}
