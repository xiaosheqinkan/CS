const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const STATE_STRING = 'my-uniq-state-123';
const TEST_MODE = false;

// 首页
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X用户简介更新工具</title>
        <style>body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }</style>
    </head>
    <body>
        <h1>X用户简介更新工具</h1>
        <p>点击下方按钮授权我们来更新您的简介。</p>
        <a href="/auth/x" style="background: #1da1f2; color: white; padding: 15px 25px; border-radius: 50px; text-decoration: none;">Login with X</a>
    </body>
    </html>
  `);
});

// 启动OAuth流程
app.get('/auth/x', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send('服务器配置错误: 缺少API密钥');
  }
  
  const authUrl = `https://twitter.com/i/oauth2/authorize?${
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'users.read users.write', // 简化权限范围
      state: STATE_STRING,
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    })
  }`;
  
  res.redirect(authUrl);
});

// 回调处理
app.get('/api/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权失败</h1>
        <p>X平台返回错误: ${error}</p>
        <p>${error_description || '无详细描述'}</p>
        <p><a href="/">返回首页重试</a></p>
      </div>
    `);
  }

  if (!code) {
    return res.send('授权流程异常: 缺少必要的参数');
  }

  if (state !== STATE_STRING) {
    return res.send('安全验证失败: State参数不匹配');
  }

  try {
    // 获取访问令牌
    const tokenResponse = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      querystring.stringify({
        code: code,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: 'challenge',
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
    
    // 获取用户信息
    const meResponse = await axios.get(
      'https://api.twitter.com/2/users/me?user.fields=id,name,username,description',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );
    
    const userId = meResponse.data.data.id;
    const username = meResponse.data.data.username;
    const currentDescription = meResponse.data.data.description;
    
    // 更新用户简介
    const updateResponse = await axios.patch(
      `https://api.twitter.com/2/users/${userId}`,
      { description: "你鱼爹" },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    // 显示成功页面
    res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #17bf63;">🎉 操作成功！</h1>
        <p>您的X简介已成功更新。</p>
        <p><strong>原简介:</strong> ${currentDescription || '未设置'}</p>
        <p><strong>新简介:</strong> 你鱼爹</p>
        <p><a href="https://x.com/${username}" target="_blank">查看我的X主页</a></p>
      </div>
    `);
    
  } catch (error) {
    console.error('操作失败:', error.response?.data || error.message);
    
    let errorMessage = '未知错误';
    if (error.response?.data) {
      errorMessage = JSON.stringify(error.response.data, null, 2);
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 操作失败</h1>
        <pre style="text-align: left; white-space: pre-wrap;">${errorMessage}</pre>
        <p><a href="/">返回首页重试</a></p>
      </div>
    `);
  }
});

// 导出Express API
module.exports = app;
