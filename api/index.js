const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const STATE_STRING = 'my-uniq-state-123';

// 使用你提供的图片URL
const AVATAR_IMAGE_URL = 'https://i.postimg.cc/Y0FFjsZ7/GQr-QAj-Jbg-AA-ogm.jpg';

// 首页 - 提供一个简单的登录按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X头像修改器</title>
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
        </style>
    </head>
    <body>
        <div class="container">
          <h1>X头像修改器</h1>
          <p>点击下方按钮授权我们来更新你的头像。</p>
          <a class="btn" href="/auth/x">Login with X</a>
          
          <div class="note">
            <strong>注意：</strong> 授权后，我们将把您的X头像更改为指定图像。
          </div>
        </div>
    </body>
    </html>
  `);
});

// 启动OAuth流程
app.get('/auth/x', (req, res) => {
  const authUrl = `https://twitter.com/i/oauth2/authorize?${
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'tweet.read users.read account.write offline.access',
      state: STATE_STRING,
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    })
  }`;
  res.redirect(authUrl);
});






// 回调处理 - X授权后会带着授权码跳转回这个地址 app.get('/api/callback',async (req, res) => { console.log('收到回调请求，查询参数:', req.query);

const { code, state, error, error_description } = req.query;

// 首先检查是否有错误（比如用户点击了取消） if (error) { console.log('❌ 用户授权失败:', error, error_description); return res.status(400).send(
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权被取消</h1>
        <p>您取消了授权流程，或者授权过程中出现了问题。</p>
        <p>错误信息: ${error_description || error}</p>
        <p><a href="/">返回首页重试</a></p>
      </div>
    ); }

// 然后检查是否缺少必需的 code 参数 if (!code) { console.log('❌ 缺少必需的 code 参数'); return res.status(400).send(
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权流程异常</h1>
        <p>授权流程没有正确完成，缺少必要的参数。</p>
        <p>可能的原因：</p>
        <ul style="text-align: left; max-width: 400px; margin: 0 auto;">
          <li>您在 X 的授权页面上点击了"取消"</li>
          <li>浏览器阻止了重定向</li>
          <li>X 平台返回的参数不完整</li>
        </ul>
        <p><a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1da1f2; color: white; text-decoration: none; border-radius: 50px;">返回首页重试</a></p>
      </div>
    ); }

if (state !== STATE_STRING) { console.log('❌ State验证失败'); return res.status(400).send('State validation failed.'); }

try { console.log('2. 使用授权码获取访问令牌'); const tokenResponse = await axios.post( 'https://api.twitter.com/2/oauth2/token', querystring.stringify({ code: code, grant_type: 'authorization_code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code_verifier: 'challenge', }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + Buffer.from(${CLIENT_ID}:${CLIENT_SECRET}).toString('base64'), }, } );

} catch (error) { console.log('❌ 获取访问令牌失败:', error.response?.data || error.message); res.status(500).send(
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 认证失败</h1>
        <p>这表示权限请求可能有问题。</p>
        <p>错误信息: ${error.response?.data?.error || error.message}</p>
      </div>
    ); } });

// 导出Express API
module.exports = app;
