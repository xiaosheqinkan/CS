const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const STATE_STRING = 'my-uniq-state-123';

// 首页 - 显示授权按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X API 位置修改工具</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .info { background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left; }
          .warning { background: #fff4e6; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left; }
        </style>
    </head>
    <body>
        <h1>X API 位置修改工具</h1>
        
        <div class="info">
          <h3>功能说明：</h3>
          <p>此工具将使用 X API 2.0 的 <code>PUT /2/users/:id</code> 接口修改您的位置信息。</p>
          <p>将把位置设置为: <strong>"你妈头上"</strong></p>
        </div>

        <div class="warning">
          <h3>⚠️ 注意：</h3>
          <p>这是一个真实操作，会实际修改您的 X 账户位置信息。</p>
          <p>请确保您了解此操作的后果。</p>
        </div>

        <a href="/auth/x" style="background: #1da1f2; color: white; padding: 15px 25px; border-radius: 50px; text-decoration: none; display: inline-block; margin: 20px;">
          授权并修改位置
        </a>
    </body>
    </html>
  `);
});

// 启动 OAuth 2.0 授权流程
app.get('/auth/x', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send('服务器配置错误: 缺少 API 密钥或密钥秘密');
  }
  
  // 构建授权 URL - 关键部分：权限范围(scope)
  const authUrl = `https://twitter.com/i/oauth2/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'users.read users.write', // 需要读写权限
    state: STATE_STRING,
    code_challenge: 'challenge',     // 使用 PKCE 的简化示例
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
        <h1 style="color: #e0245e;">❌ 授权失败</h1>
        <p><strong>错误类型:</strong> ${error}</p>
        <p><strong>详细描述:</strong> ${error_description || '无详细描述'}</p>
        ${error === 'invalid_scope' ? `
          <div style="background: #fff4f4; padding: 15px; border-radius: 8px; margin: 20px;">
            <h3>invalid_scope 错误解决方案：</h3>
            <ol style="text-align: left;">
              <li>登录 <a href="https://developer.twitter.com" target="_blank">X Developer Portal</a></li>
              <li>进入您的应用设置</li>
              <li>在 "User authentication settings" 中确保已启用：
                <ul>
                  <li>Read users (users.read)</li>
                  <li>Edit users (users.write)</li>
                </ul>
              </li>
              <li>应用类型必须设置为 "Read and write"</li>
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
        code_verifier: 'challenge', // 与 code_challenge 对应
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
    const scope = tokenResponse.data.scope; // 获取实际授予的权限范围

    // 使用获取的访问令牌请求用户信息（获取用户ID）
    const meResponse = await axios.get(
      'https://api.twitter.com/2/users/me?user.fields=id,name,username,description,location,created_at',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );

    const userId = meResponse.data.data.id;
    const currentLocation = meResponse.data.data.location || '未设置';

    // 使用 PUT /2/users/:id 接口修改位置
    const updateResponse = await axios.put(
      `https://api.twitter.com/2/users/${userId}`,
      {
        location: "你妈头上"
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    // 显示成功信息和修改详情
    res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #17bf63;">✅ 位置修改成功！</h1>
        
        <div style="background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left;">
          <h3>修改详情：</h3>
          <p><strong>用户ID:</strong> ${userId}</p>
          <p><strong>原位置:</strong> ${currentLocation}</p>
          <p><strong>新位置:</strong> 你妈头上</p>
          <p><strong>授予的权限:</strong> ${scope}</p>
        </div>

        <div style="background: #e6f7ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px;">
          <h3>API 响应：</h3>
          <pre style="text-align: left; white-space: pre-wrap; background: white; padding: 15px; border-radius: 5px;">
${JSON.stringify(updateResponse.data, null, 2)}
          </pre>
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
        <h1 style="color: #e0245e;">❌ 请求失败</h1>
        <pre style="text-align: left; white-space: pre-wrap; background: #f8f8f8; padding: 15px; border-radius: 8px;">${errorMessage}</pre>
        <p><a href="/">返回首页重试</a></p>
      </div>
    `);
  }
});

module.exports = app;
