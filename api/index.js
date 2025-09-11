const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

const app = express();

// 环境变量
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';

// 存储 PKCE state 和 code_verifier
const stateStore = new Map();

// 主页 HTML（仅标题和按钮）
const htmlContent = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>X 授权</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      text-align: center; 
      padding: 50px; 
      background-color: #f5f8fa;
      color: #14171a;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 15px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 500px;
      margin: 0 auto;
    }
    h1 { color: #1da1f2; }
    .btn { 
      background: #1da1f2; 
      color: white; 
      padding: 15px 25px; 
      border-radius: 50px; 
      text-decoration: none; 
      display: inline-block; 
      font-weight: bold;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>X 授权</h1>
    <a class="btn" href="/auth/x">Login with X</a>
  </div>
</body>
</html>
`;

// 主页
app.get('/', (req, res) => {
  console.log('访问主页');
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(htmlContent);
});

// 授权请求
app.get('/auth/x', (req, res) => {
  console.log('开始OAuth流程，重定向到X授权页面');
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('错误: 缺少API密钥或密钥未设置');
    return res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 服务器配置错误</h1>
        <p>应用未正确配置API密钥，请检查环境变量设置。</p>
        <a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页</a>
      </div>
    `);
  }

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

  const authUrl = `https://twitter.com/i/oauth2/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: ['tweet.write', 'offline.access'].join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })}`;

  console.log('重定向到:', authUrl);
  res.redirect(authUrl);
});

// 回调处理
app.get('/api/callback', async (req, res) => {
  console.log('收到回调请求，查询参数:', JSON.stringify(req.query, null, 2));
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('X平台返回错误:', error, error_description);
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权失败</h1>
        <p>X平台返回了错误: ${error}</p>
        <p>错误描述: ${error_description || '无详细描述'}</p>
        <p>请检查 Twitter Developer Portal 配置，确保权限为 'Read and Write'，回调 URL 为 '${REDIRECT_URI}'。</p>
        <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页重试</a></p>
      </div>
    `);
  }

  if (!code) {
    console.error('错误: 缺少必需的code参数');
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权流程异常</h1>
        <p>授权流程没有正确完成，缺少必要的code参数。</p>
        <p>可能的原因：</p>
        <ul style="text-align: left; max-width: 400px; margin: 20px auto;">
          <li>您在X的授权页面上点击了"取消"</li>
          <li>浏览器阻止了重定向</li>
          <li>X平台返回的参数不完整</li>
          <li>回调URL配置不正确</li>
        </ul>
        <p><a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1da1f2; color: white; text-decoration: none; border-radius: 50px; font-weight: bold;">返回首页重试</a></p>
      </div>
    `);
  }

  if (!stateStore.has(state)) {
    console.error('State验证失败: 预期存在于stateStore，实际', state);
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 安全验证失败</h1>
        <p>State参数不匹配，这可能是一次CSRF攻击。</p>
        <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页重试</a></p>
      </div>
    `);
  }

  const codeVerifier = stateStore.get(state);
  stateStore.delete(state);
  console.log('使用 code_verifier:', codeVerifier);

  try {
    console.log('使用授权码获取访问令牌...');
    const tokenResponse = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      querystring.stringify({
        code,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
        timeout: 10000,
      }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log('成功获取访问令牌:', accessToken.substring(0, 10) + '...');

    try {
      console.log('发送推文...');
      const tweetResponse = await axios.post(
        'https://api.twitter.com/2/tweets',
        { text: '你妈死了' },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const tweetId = tweetResponse.data.data.id;
      console.log('推文发送成功，ID:', tweetId);

      res.send(`
        <!DOCTYPE html>
        <html lang="zh">
        <head>
          <title>操作成功！</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px; 
              background-color: #f5f8fa;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 15px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              max-width: 500px;
              margin: 0 auto;
            }
            h1 { color: #17bf63; }
            .success-info {
              background: #e8f5fe;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              text-align: left;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎉 推文发布成功！</h1>
            <div class="success-info">
              <p><strong>新推文:</strong> 你妈死了</p>
              <p><strong>推文ID:</strong> ${tweetId}</p>
            </div>
            <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页</a></p>
          </div>
        </body>
        </html>
      `);
    } catch (tweetError) {
      console.error('推文发送失败:', tweetError.response?.data || tweetError.message);
      let errorMessage = tweetError.response?.data ? JSON.stringify(tweetError.response.data, null, 2) : tweetError.message;
      if (tweetError.response?.status === 403) {
        errorMessage += ' (可能原因：推文内容违反X规则或应用权限不足，请检查 Twitter Developer Portal)';
      }
      res.send(`
        <div style="text-align: center; padding: 50px;">
          <h1 style="color: #e0245e;">❌ 推文发送失败</h1>
          <div style="background: #ffe6e6; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 500px; overflow: auto;">
            <pre style="text-align: left; white-space: pre-wrap;">${errorMessage}</pre>
          </div>
          <p>可能的原因：推文内容违反规则或权限不足。</p>
          <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页重试</a></p>
        </div>
      `);
    }
  } catch (error) {
    console.error('Token交换失败:', error.response?.data || error.message);
    let errorMessage = error.response?.data
      ? `${error.response.data.error || '未知错误'}: ${error.response.data.error_description || '无详细描述'}`
      : error.message;
    res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 认证失败</h1>
        <p>在获取访问令牌时出错。</p>
        <div style="background: #ffe6e6; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 500px;">
          <p><strong>错误信息:</strong> ${errorMessage}</p>
        </div>
        <p>可能的原因：</p>
        <ul style="text-align: left; max-width: 400px; margin: 20px auto;">
          <li>授权码已过期</li>
          <li>API密钥或密钥不正确</li>
          <li>回调URL不匹配</li>
          <li>网络连接问题</li>
        </ul>
        <p><a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1da1f2; color: white; text-decoration: none; border-radius: 50px; font-weight: bold;">返回首页重试</a></p>
      </div>
    `);
  }
});

// 处理 404
app.use((req, res) => {
  console.log(`找不到页面: 路径=${req.path}, 方法=${req.method}`);
  res.status(404).send(`
    <div style="text-align: center; padding: 50px;">
      <h1 style="color: #e0245e;">❌ 页面不存在</h1>
      <p>访问的路径: ${req.path}</p>
      <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页</a></p>
    </div>
  `);
});

module.exports = app;