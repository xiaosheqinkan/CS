const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback'; // 请替换为您的实际域名
const STATE_STRING = 'my-uniq-state-123';

// 首页 - 显示授权按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X API 权限测试</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .info { background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left; }
        </style>
    </head>
    <body>
        <h1>X API 权限测试工具</h1>
        
        <div class="info">
          <h3>测试目的：</h3>
          <p>此工具仅测试能否成功获取 <strong>users.read</strong> 和 <strong>users.write</strong> 权限。</p>
          <p>不会实际修改您的 X 简介。</p>
        </div>

        <a href="/auth/x" style="background: #1da1f2; color: white; padding: 15px 25px; border-radius: 50px; text-decoration: none; display: inline-block; margin: 20px;">
          授权测试
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
    scope: 'users.read users.write', // 只请求这两个权限
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

    // 使用获取的访问令牌请求用户信息（验证权限）
    const meResponse = await axios.get(
      'https://api.twitter.com/2/users/me?user.fields=id,name,username,description,created_at',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );

    // 显示成功信息和授权详情
    res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #17bf63;">✅ 授权成功！</h1>
        
        <div style="background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left;">
          <h3>授权详情：</h3>
          <p><strong>授予的权限范围:</strong> ${scope}</p>
          <p><strong>访问令牌类型:</strong> ${tokenResponse.data.token_type}</p>
          <p><strong>过期时间:</strong> ${tokenResponse.data.expires_in} 秒后</p>
        </div>

        <div style="background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left;">
          <h3>用户信息（users.read 权限验证）:</h3>
          <p><strong>用户ID:</strong> ${meResponse.data.data.id}</p>
          <p><strong>用户名:</strong> @${meResponse.data.data.username}</p>
          <p><strong>显示名称:</strong> ${meResponse.data.data.name}</p>
          <p><strong>当前简介:</strong> ${meResponse.data.data.description || '未设置'}</p>
          <p><strong>账号创建时间:</strong> ${new Date(meResponse.data.data.created_at).toLocaleDateString()}</p>
        </div>

        <p style="color: #657786; font-size: 14px; margin-top: 30px;">
          注意：此测试仅验证权限获取，未执行任何修改操作。
        </p>

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
