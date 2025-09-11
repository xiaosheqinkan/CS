const { TwitterApi } = require('twitter-api-v2');
const fetch = require('node-fetch');
const crypto = require('crypto');

// 环境变量（在 Vercel 中配置）
const X_API_KEY = process.env.X_API_KEY || 'luSdKHKcSKnX2jJESLFtFVcVI';
const X_API_SECRET = process.env.X_API_SECRET || 'p8C4xjxMMtCPPgEtFva2sh5DKqykbLnvaXdNNetmiqfO5fd9pB';
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://cs-seven-zeta.vercel.app/api/callback';

// 初始化 Twitter API 客户端
const client = new TwitterApi({
  clientId: X_API_KEY,
  clientSecret: X_API_SECRET,
});

// 存储 PKCE 状态和 code_verifier（生产环境中建议使用数据库）
const stateStore = new Map();

// 简单的 HTML 页面
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
  <p>Click the button below to authorize and post a tweet.</p>
  <a href="/api/auth"><button>Authorize and Post Tweet</button></a>
</body>
</html>
`;

module.exports = async (req, res) => {
  const { path } = req;

  // 根路径：返回 HTML 页面
  if (path === '/' && req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlContent);
    return;
  }

  // 授权请求：/api/auth
  if (path === '/api/auth' && req.method === 'GET') {
    // 生成 PKCE code_verifier 和 code_challenge
    const codeVerifier = crypto.randomBytes(32).toString('hex');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 生成随机的 state 参数
    const state = crypto.randomBytes(16).toString('hex');

    // 存储 code_verifier 和 state
    stateStore.set(state, codeVerifier);

    // 生成授权 URL
    const authUrl = client.generateOAuth2AuthUrl({
      redirect_uri: CALLBACK_URL,
      scope: ['tweet.write', 'users.read', 'offline.access'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    // 重定向到 Twitter 授权页面
    res.writeHead(302, { Location: authUrl });
    res.end();
  }

  // 回调请求：/api/callback
  else if (path === '/api/callback' && req.method === 'GET') {
    const { code, state } = req.query;

    // 验证 state
    if (!stateStore.has(state)) {
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
    }

    const codeVerifier = stateStore.get(state);
    stateStore.delete(state); // 清理存储

    try {
      // 交换 code 获取 access_token
      const { accessToken } = await client.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri: CALLBACK_URL,
      });

      // 使用 access_token 创建用户级客户端
      const userClient = new TwitterApi(accessToken);

      // 下载图片
      const imageUrl = 'https://i.postimg.cc/BSYB7WCj/GQr-QAj-Jbg-AA-ogm.jpg';
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to download image');
      }
      const imageBuffer = await imageResponse.buffer();

      // 上传图片到 Twitter
      const mediaId = await userClient.v1.uploadMedia(imageBuffer, {
        mimeType: 'image/jpeg',
      });

      // 发布推文
      await userClient.v2.tweet({
        text: '你妈死了',
        media: { media_ids: [mediaId] },
      });

      // 返回成功页面
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
      console.error('Error in callback:', error);
      res.status(500).json({ error: 'Failed to post tweet', details: error.message });
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
};