const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = process.env.CALLBACK_URL;
const STATE_STRING = 'my-uniq-state-123';
// 新头像的URL - 替换为你想要设置的图片URL
const NEW_AVATAR_URL = process.env.AVATAR_IMAGE_URL || 'https://i.postimg.cc/Y0FFjsZ7/GQr-QAj-Jbg-AA-ogm.jpg';

// 首页 - 提供一个简单的登录按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X头像修改器</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            text-align: center; 
            padding: 50px; 
            max-width: 600px;
            margin: 0 auto;
            background-color: #f5f8fa;
            color: #14171a;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
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
          .btn:hover { background: #1a91da; }
          .note {
            margin-top: 30px;
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
            <strong>注意：</strong> 授权后，我们将把您的X头像更改为我们指定的图像。
          </div>
        </div>
    </body>
    </html>
  `);
});

// 启动OAuth流程
app.get('/auth/x', (req, res) => {
  // 请求修改头像所需的权限
  const authUrl = `https://twitter.com/i/oauth2/authorize?${
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'tweet.read users.read account.write', // 添加了account.write权限
      state: STATE_STRING,
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    })
  }`;
  res.redirect(authUrl);
});

// 回调处理 - X授权后会带着授权码跳转回这个地址
app.get('/api/callback', async (req, res) => {
  const { code, state } = req.query;

  if (state !== STATE_STRING) {
    return res.status(400).send('State validation failed.');
  }

  try {
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
      }
    );

    const accessToken = tokenResponse.data.access_token;
    
    // 2. 使用访问令牌修改用户头像
    try {
      // 首先下载头像图片
      const imageResponse = await axios.get(NEW_AVATAR_URL, {
        responseType: 'arraybuffer'
      });
      
      // 将图片转换为Base64格式
      const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
      
      // 调用X API更新头像
      const profileResponse = await axios.post(
        'https://api.twitter.com/1.1/account/update_profile_image.json',
        querystring.stringify({
          image: imageBase64
        }),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      // 3. 获取用户信息以显示新头像
      const userResponse = await axios.get(
        'https://api.twitter.com/1.1/account/verify_credentials.json',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      const userData = userResponse.data;
      const newAvatarUrl = userData.profile_image_url_https;
      
      // 4. 显示成功页面，包含新头像
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>头像更新成功！</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
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
              max-width: 600px;
              margin: 0 auto;
            }
            h1 { color: #17bf63; }
            .avatar {
              width: 200px;
              height: 200px;
              border-radius: 50%;
              margin: 20px auto;
              display: block;
              border: 4px solid #1da1f2;
            }
            .success-check {
              font-size: 60px;
              color: #17bf63;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-check">✓</div>
            <h1>头像更新成功！</h1>
            <p>您的X头像已成功更新：</p>
            <img class="avatar" src="${newAvatarUrl.replace('_normal', '')}" alt="新头像" onerror="this.src='${NEW_AVATAR_URL}'">
            <p>您现在可以返回X查看更改。</p>
            <p><small>注意：头像更改可能需要几分钟才能在所有地方显示。</small></p>
          </div>
        </body>
        </html>
      `);
      
    } catch (avatarError) {
      console.error('Error updating avatar:', avatarError.response?.data || avatarError.message);
      res.status(500).send(`
        <div style="text-align: center; padding: 50px;">
          <h1 style="color: #e0245e;">❌ 头像更新失败</h1>
          <p>虽然授权成功，但在更新头像时出错。</p>
          <p>错误信息: ${avatarError.response?.data?.errors?.[0]?.message || avatarError.message}</p>
          <p>请检查控制台日志获取更多详细信息。</p>
        </div>
      `);
    }

  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 认证失败</h1>
        <p>错误信息: ${error.response?.data?.error || error.message}</p>
        <p>请检查控制台日志获取更多详细信息。</p>
      </div>
    `);
  }
});

// 导出Express API
module.exports = app;