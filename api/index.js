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

// 回调处理 - X授权后会带着授权码跳转回这个地址
app.get('/api/callback', async (req, res) => {
  // 检查是否有错误或缺少必要参数
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权失败</h1>
        <p>错误: ${error_description || error}</p>
        <p><a href="/" style="color: #1da1f2;">返回首页重试</a></p>
      </div>
    `);
  }

  if (!code) {
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 缺少必要参数</h1>
        <p>授权流程没有正确完成，请返回首页重试。</p>
        <p><a href="/" style="color: #1da1f2;">返回首页</a></p>
      </div>
    `);
  }

  if (state !== STATE_STRING) {
    return res.send('State验证失败');
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
      // 下载头像图片
      const imageResponse = await axios.get(AVATAR_IMAGE_URL, {
        responseType: 'arraybuffer'
      });
      
      // 将图片转换为Base64格式
      const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
      
      // 调用X API更新头像
      await axios.post(
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
      
      // 获取用户信息以显示新头像
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
      
      // 显示成功页面
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>头像更新成功！</title>
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
            .avatar {
              width: 150px;
              height: 150px;
              border-radius: 50%;
              margin: 20px auto;
              display: block;
              border: 4px solid #1da1f2;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎉 头像更新成功！</h1>
            <p>您的X头像已成功更新：</p>
            <img class="avatar" src="${newAvatarUrl.replace('_normal', '')}" alt="新头像">
            <p>您现在可以返回X查看更改。</p>
            <p><small>注意：头像更改可能需要几分钟才能在所有地方显示。</small></p>
          </div>
        </body>
        </html>
      `);
      
    } catch (avatarError) {
      res.send(`
        <div style="text-align: center; padding: 50px;">
          <h1 style="color: #e0245e;">❌ 头像更新失败</h1>
          <p>虽然授权成功，但在更新头像时出错。</p>
          <p>请检查控制台日志获取更多信息。</p>
        </div>
      `);
    }

  } catch (error) {
    res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 认证失败</h1>
        <p>请检查控制台日志获取更多信息。</p>
      </div>
    `);
  }
});

// 导出Express API
module.exports = app;
