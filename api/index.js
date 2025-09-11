const { TwitterApi } = require('twitter-api-v2');
const fetch = require('node-fetch');
const crypto = require('crypto');

// Environment variables
const X_API_KEY = process.env.X_API_KEY || 'luSdKHKcSKnX2jJESLFtFVcVI';
const X_API_SECRET = process.env.X_API_SECRET || 'p8C4xjxMMtCPPgEtFva2sh5DKqykbLnvaXdNNetmiqfO5fd9pB';
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://cs-seven-zeta.vercel.app/api/callback';

// Initialize Twitter API client
const client = new TwitterApi({
  clientId: X_API_KEY,
  clientSecret: X_API_SECRET,
});

// Store PKCE state and code_verifier
const stateStore = new Map();

// HTML for root path
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Twitter OAuth App</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Twitter OAuth App</h1>
  <p>Click below to authorize and post a tweet.</p>
  <a href="/api/auth"><button>Authorize and Post Tweet</button></a>
</body>
</html>
`;

module.exports = async (req, res) => {
  const { path, method } = req;

  // Log request for debugging
  console.log(`Received request: ${method} ${path}`);

  // Root path: Serve HTML
  if (path === '/' && method === 'GET') {
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlContent);
    return;
  }

  // Auth request: /api/auth
  if (path === '/api/auth' && method === 'GET') {
    try {
      const codeVerifier = crypto.randomBytes(32).toString('hex');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const state = crypto.randomBytes(16).toString('hex');
      stateStore.set(state, codeVerifier);

      const authUrl = client.generateOAuth2AuthUrl({
        redirect_uri: CALLBACK_URL,
        scope: ['tweet.write', 'users.read', 'offline.access'],
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      console.log(`Redirecting to auth URL: ${authUrl}`);
      res.writeHead(302, { Location: authUrl });
      res.end();
    } catch (error) {
      console.error('Error in /api/auth:', error);
      res.status(500).json({ error: 'Failed to generate auth URL', details: error.message });
    }
    return;
  }

  // Callback request: /api/callback
  if (path === '/api/callback' && method === 'GET') {
    const { code, state } = req.query;
    console.log(`Callback received with code: ${code}, state: ${state}`);

    if (!stateStore.has(state)) {
      console.error('Invalid state parameter');
      res.status(400).json({ error: 'Invalid state parameter', state });
      return;
    }

    const codeVerifier = stateStore.get(state);
    stateStore.delete(state);

    try {
      const { accessToken } = await client.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri: CALLBACK_URL,
      });

      const userClient = new TwitterApi(accessToken);
      const imageUrl = 'https://i.postimg.cc/BSYB7WCj/GQr-QAj-Jbg-AA-ogm.jpg';
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      const imageBuffer = await imageResponse.buffer();

      const mediaId = await userClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' });
      await userClient.v2.tweet({
        text: '你妈死了',
        media: { media_ids: [mediaId] },
      });

      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Success</title>
        </head>
        <body>
          <h1>Success!</h1>
          <p>Tweet posted successfully.</p>
          <a href="/">Back to Home</a>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('Error in /api/callback:', error);
      res.status(500).json({ error: 'Failed to post tweet', details: error.message });
    }
    return;
  }

  // Handle invalid routes
  res.status(404).json({ error: 'Not found', path, method });
};