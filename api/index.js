const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

const app = express();

// 环境变量
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const TARGET_IMAGE_URL = 'https://i.postimg.cc/BSYB7WCj/GQr-QAj-Jbg-AA-ogm.jpg';

// 存储 PKCE state 和 code_verifier
const stateStore = new Map();

// 简化的主页 HTML
const htmlContent = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>X 授权应用</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
    button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #1da1f2; color: white; border: none; border-radius: 5px; }
    .warning { background: #fff4e6; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 400px; }
  </style>
</head>
<body>
  <h1>X 授权应用</h1>
  <div class="warning">
    <p>⚠️ 点击授权将发布推文，可能影响您的账户，请谨慎操作。</p>
  </div>
  <a href="/api/auth"><button>授权并发布推文</button></a>
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
app.get('/api/auth', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('缺少 API 密钥或密钥秘密');
    return res.status(500).send('服务器配置错误：缺少 API 密钥');
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
    scope: ['tweet.write', 'users.read', 'offline.access'].join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })}`;

  console.log(`跳转到授权: ${authUrl}`);
  res.redirect(authUrl);
});

// 下载图片
async function downloadImage(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('下载图片失败:', error.message);
    throw new Error(`下载图片失败: ${error.message}`);
  }
}

// 上传媒体（V2）
async function uploadMediaV2(accessToken, imageUrl) {
  try {
    console.log('开始下载图片:', imageUrl);
    const buffer = await downloadImage(imageUrl);
    const size = buffer.length;
    console.log('图片下载完成，大小:', size, 'bytes');

    // 1. 初始化上传
    console.log('初始化媒体上传...');
    const initResponse = await axios.post(
      'https://api.twitter.com/2/media/upload/initialize',
      { media_type: 'image/jpeg', total_bytes: size, media_category: 'tweet_image' },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const mediaId = initResponse.data.data.media_id;
    console.log('媒体上传初始化成功，Media ID:', mediaId);

    // 2. 追加数据
    console.log('追加媒体数据...');
    await axios.post(
      `https://api.twitter.com/2/media/upload/${mediaId}/append`,
      buffer,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' }, timeout: 30000 }
    );
    console.log('媒体数据追加成功');

    // 3. 最终化上传
    console.log('最终化媒体上传...');
    const finalizeResponse = await axios.post(
      `https://api.twitter.com/2/media/upload/${mediaId}/finalize`,
      {},
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    console.log('媒体上传最终化成功');

    const processingInfo = finalizeResponse.data.data.processing_info;
    if (processingInfo && processingInfo.state !== 'succeeded') {
      console.log('媒体处理中，状态:', processingInfo.state);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return mediaId;
  } catch (error) {
    console.error('媒体上传失败:', error.response ? { status: error.response.status, data: error.response.data } : error.message);
    throw new Error(`媒体上传失败: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
  }
}

// 回调处理
app.get('/api/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  console.log(`回调请求: code=${code}, state=${state}`);

  if (error) {
    console.error(`授权失败: ${error}, ${error_description}`);
    return res.status(400).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权失败</h1>
        <p>错误: ${error}</p>
        <p>详情: ${error_description || '无'}</p>
        <a href="/" style="padding: 10px 20px; background: #1da1f2; color: white; border-radius: 5px; text-decoration: none;">返回首页</a>
      </div>
    `);
  }

  if (!stateStore.has(state)) {
    console.error('无效 state 参数');
    return res.status(400).send('安全验证失败：state 不匹配');
  }

  const codeVerifier = stateStore.get(state);
  stateStore.delete(state);

  try {
    // 获取访问令牌
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
    console.log('获取访问令牌成功');

    // 获取用户信息
    const meResponse = await axios.get(
      'https://api.twitter.com/2/users/me?user.fields=id,username',
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
    );
    const { id: userId, username } = meResponse.data.data;
    console.log(`用户信息: ${username} (ID: ${userId})`);

    // 上传图片（V2）
    const mediaId = await uploadMediaV2(accessToken, TARGET_IMAGE_URL);
    console.log(`媒体上传成功，Media ID: ${mediaId}`);

    // 发布推文（V2）
    const tweetResponse = await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: '你妈死了', media: { media_ids: [mediaId] } },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const tweetId = tweetResponse.data.data.id;
    console.log(`推文发布成功，Tweet ID: ${tweetId}`);

    // 成功页面
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #17bf63;">✅ 推文发布成功！</h1>
        <p>用户: @${username}</p>
        <p>推文 ID: ${tweetId}</p>
        <a href="/" style="padding: 10px 20px; background: #1da1f2; color: white; border-radius: 5px; text-decoration: none;">返回首页</a>
      </div>
    `);
  } catch (error) {
    console.error('错误:', error.response ? { status: error.response.status, data: error.response.data } : error.message);
    res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 失败</h1>
        <p>错误: ${error.response ? JSON.stringify(error.response.data) : error.message}</p>
        <a href="/" style="padding: 10px 20px; background: #1da1f2; color: white; border-radius: 5px; text-decoration: none;">返回首页</a>
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
      <a href="/" style="padding: 10px 20px; background: #1da1f2; color: white; border-radius: 5px; text-decoration: none;">返回首页</a>
    </div>
  `);
});

module.exports = app;