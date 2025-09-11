const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const STATE_STRING = 'my-uniq-state-123';

// 首页 - 提供一个简单的登录按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X用户资料更新工具</title>
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
          .note {
            margin-top: 20px;
            padding: 15px;
            background: #e8f5fe;
            border-radius: 10px;
            font-size: 14px;
            color: #657786;
          }
          .warning {
            margin-top: 20px;
            padding: 15px;
            background: #ffe6e6;
            border-radius: 10px;
            font-size: 14px;
            color: #e0245e;
          }
        </style>
    </head>
    <body>
        <div class="container">
          <h1>X用户资料更新工具</h1>
          <p>点击下方按钮授权我们来更新您的资料和发布推文。</p >
          <a class="btn" href=" ">Login with X</a >
          
          <div class="note">
            <strong>注意：</strong> 授权后，我们将更新您的X资料并发布一条推文。
          </div>
          
          <div class="warning">
            <strong>警告：</strong> 请确保您了解此操作将修改您的公开资料并发布公开内容。
          </div>
        </div>
    </body>
    </html>
  `);
});

// 启动OAuth流程
app.get('/auth/x', (req, res) => {
  console.log('开始OAuth流程，重定向到X授权页面');
  
  // 检查必要的环境变量是否设置
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('错误: 缺少API密钥或密钥未设置');
    return res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 服务器配置错误</h1>
        <p>应用未正确配置API密钥，请检查环境变量设置。</p >
      </div>
    `);
  }
  
  // 使用正确的权限范围
  const authUrl = `https://twitter.com/i/oauth2/authorize?${
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'users.read tweet.read tweet.write offline.access', // 修正权限范围
      state: STATE_STRING,
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    })
  }`;
  
  console.log('重定向到:', authUrl);
  res.redirect(authUrl);
});

// 回调处理 - X授权后会带着授权码跳转回这个地址
app.get('/api/callback', async (req, res) => {
  console.log('收到回调请求，查询参数:', JSON.stringify(req.query, null, 2));
  
  // 检查是否有错误或缺少必要参数
  const { code, state, error, error_description } = req.query;

  // 1. 检查是否有来自X平台的错误
  if (error) {
    console.error('X平台返回错误:', error, error_description);
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权失败</h1>
        <p>X平台返回了错误: ${error}</p >
        <p>错误描述: ${error_description || '无详细描述'}</p >
        <p>返回首页重试</p >
      </div>
    `);
  }

  // 2. 检查是否缺少必需的code参数
  if (!code) {
    console.error('错误: 缺少必需的code参数');
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权流程异常</h1>
        <p>授权流程没有正确完成，缺少必要的参数。</p >
        <p>可能的原因：</p >
        <ul style="text-align: left; max-width: 400px; margin: 20px auto;">
          <li>您在X的授权页面上点击了"取消"</li>
          <li>浏览器阻止了重定向</li>
          <li>X平台返回的参数不完整</li>
          <li>回调URL配置不正确</li>
        </ul>
        <p>返回首页重试</p >
      </div>
    `);
  }

  // 3. 检查state参数是否匹配（防止CSRF攻击）
  if (state !== STATE_STRING) {
    console.error('State验证失败: 预期', STATE_STRING, '实际', state);
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 安全验证失败</h1>
        <p>State参数不匹配，这可能是一次CSRF攻击。</p >
        <p>返回首页重试</p >
      </div>
    `);
  }

  try {
    console.log('使用授权码获取访问令牌...');
    
    // 1. 使用授权码获取访问令牌
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
        timeout: 10000 // 10秒超时
      }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log('成功获取访问令牌:', accessToken.substring(0, 10) + '...');
    
    try {
      // 2. 获取当前用户ID
      console.log('获取当前用户ID...');
      const meResponse = await axios.get(
        'https://api.twitter.com/2/users/me?user.fields=id,name,username',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 10000
        }
      );
      
      const userId = meResponse.data.data.id;
      const username = meResponse.data.data.username;
      console.log('当前用户ID:', userId, '用户名:', username);
      
      // 3. 更新用户资料 (使用v1.1 API，因为v2 API可能不支持所有字段)
      console.log('更新用户资料...');
      try {
        const updateResponse = await axios.post(
          'https://api.twitter.com/1.1/account/update_profile.json',
          querystring.stringify({
            name: "妖屌亲妈鱼鱼子",
            location: "你全家头上",
            url: "https://x.com/qin61846754"
          }),
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
          }
        );
        
        console.log('用户资料更新成功:', JSON.stringify(updateResponse.data, null, 2));
      } catch (updateError) {
        console.error('用户资料更新失败:', updateError.response?.data || updateError.message);
        // 继续执行，不中断流程
      }
      
      // 4. 发送推文
      console.log('发送推文...');
      try {
        const tweetResponse = await axios.post(
          