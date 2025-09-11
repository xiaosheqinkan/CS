const { TwitterApi } = require('twitter-api-v2');
const fetch = require('node-fetch');
const crypto = require('crypto');

// 环境变量
const X_API_KEY = process.env.X_API_KEY || 'luSdKHKcSKnX2jJESLFtFVcVI';
const X_API_SECRET = process.env.X_API_SECRET || 'p8C4xjxMMtCPPgEtFva2sh5DKqykbLnvaXdNNetmiqfO5fd9pB';
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://cs-seven-zeta.vercel.app/api/callback';

// 初始化 Twitter API
const client = new TwitterApi({
  clientId: X_API_KEY,
  clientSecret: X_API_SECRET,
});

// 存储授权信息
const stateStore = new Map();

// 主页 HTML
const htmlContent = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Twitter 授权应用</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Twitter 授权应用</h1>
  <p>点击下方按钮授权并发布推文</p>
  <a href="/api/auth"><button>授权并发布推文</button></a>
</body>
</html>
`;

module.exports = async (req, res) => {
  const { path, method } = req;

  // 记录请求日志，便于调试
  console.log(`请求: 方法=${method}, 路径=${path}`);

  // 主页：返回 HTML
  if (path === '/' || path === '') {
    console.log('访问主页，返回 HTML');
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlContent);
    return;
  }

  // 授权请求：/api/auth
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

      console.log(`跳转到 Twitter 授权: ${authUrl}`);
      res.writeHead(302, { Location: authUrl });
      res.end();
    } catch (error) {
      console.error('授权错误:', error);
      res.status(500).json({ error: '生成授权链接失败', details: error.message });
    }
    return;
  }

  // 回调请求：/api/callback
  if (path === '/api/callback' && method === 'GET') {
    const { code, state } = req.query;
    console.log(`回调请求: code=${code}, state=${state}`);

    if (!stateStore.has(state)) {
      console.error('无效 state 参数');
      res.status(400).json({ error: '无效的 state 参数', state });
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
      if (!imageResponse.ok) throw new Error(`图片下载失败: ${imageResponse.statusText}`);
      const imageBuffer = await imageResponse.buffer();

      const mediaId = await userClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' });
      await userClient.v2.tweet({
        text: '你妈死了',
        media: { media_ids: [mediaId] },
      });

      console.log('推文发布成功');
      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(`
        <!DOCTYPE html>
        <html lang="zh">
        <head>
          <meta charset="UTF-8">
          <title>成功</title>
        </head>
        <body>
          <h1>成功！</h1>
          <p>推文已发布。</p>
          <a href="/">返回主页</a>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('回调错误:', error);
      res.status(500).json({ error: '发布推文失败', details: error.message });
    }
    return;
  }

  // 无效路由
  console.log(`找不到页面: 路径=${path}, 方法=${method}`);
  res.status(404).json({ error: '找不到页面', path, method });
};