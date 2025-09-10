const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const STATE_STRING = 'test-state-123';

// 首页 - 显示测试按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X API users.write 权限测试</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .test-btn { background: #1da1f2; color: white; padding: 15px 25px; border-radius: 50px; text-decoration: none; display: inline-block; margin: 20px; }
        </style>
    </head>
    <body>
        <h1>X API users.write 权限测试</h1>
        <p>此工具将测试您的应用是否具有 users.write 权限</p>
        <a href="/auth/test" class="test-btn">开始测试</a>
    </body>
    </html>
  `);
});

// 启动 OAuth 2.0 授权流程 - 只请求 users.write 权限
app.get('/auth/test', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send('请设置 X_API_KEY 和 X_API_SECRET 环境变量');
  }
  
  // 构建授权 URL - 只请求 users.write 权限
  const authUrl = `https://twitter.com/i/oauth2/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'users.write', // 只测试 users.write 权限
    state: STATE_STRING,
    code_challenge: 'test-challenge',
    code_challenge_method: 'plain',
  })}`;
  
  res.redirect(authUrl);
});

// OAuth 2.0 回调处理
app.get('/api/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // 处理授权错误
  if (error) {
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 权限测试失败</h1>
        <p><strong>错误类型:</strong> ${error}</p>
        <p><strong>详细描述:</strong> ${error_description || '无详细描述'}</p>
        
        ${error === 'invalid_scope' ? `
          <div style="background: #fff4f4; padding: 15px; border-radius: 8px; margin: 20px;">
            <h3>users.write 权限测试失败</h3>
            <p>您的应用可能没有正确配置 users.write 权限。</p>
            <p>请检查 X Developer Portal 中的应用设置，确保:</p>
            <ol style="text-align: left;">
              <li>应用类型设置为 "Read and write"</li>
              <li>已启用 "Edit users (users.write)" 权限</li>
            </ol>
          </div>
        ` : ''}
        
        <p><a href="/">返回首页重试</a></p>
      </div>
    `);
  }

  // 验证 state 参数防止 CSRF 攻击
  if (state !== STATE_STRING) {
    return res.send('安全验证失败: State 参数不匹配');
  }

  if (!code) {
    return res.send('授权流程异常: 缺少授权码');
  }

  try {
    // 使用授权码换取访问令牌
    const tokenResponse = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      querystring.stringify({
        code: code,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: 'test-challenge',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
        timeout: 10000
      }
    );

    const accessToken = tokenResponse.data.access_token;
    const scope = tokenResponse.data.scope;

    // 显示成功信息
    res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #17bf63;">✅ users.write 权限测试成功！</h1>
        
        <div style="background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left;">
          <h3>测试结果：</h3>
          <p><strong>访问令牌:</strong> ${accessToken.substring(0, 15)}...</p>
          <p><strong>授予的权限:</strong> ${scope}</p>
          <p><strong>状态:</strong> users.write 权限可用</p>
        </div>

        <p><a href="/" style="color: #1da1f2;">返回首页</a></p>
      </div>
    `);
    
  } catch (error) {
    // 错误处理
    console.error('API 请求失败:', error.response?.data || error.message);
    
    let errorMessage = '未知错误';
    if (error.response?.data) {
      errorMessage = JSON.stringify(error.response.data, null, 2);
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 令牌获取失败</h1>
        <pre style="text-align: left; white-space: pre-wrap; background: #f8f8f8; padding: 15px; border-radius: 8px;">${errorMessage}</pre>
        <p><a href="/">返回首页重试</a></p>
      </div>
    `);
  }
});

module.exports = app;
