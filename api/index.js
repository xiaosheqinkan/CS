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
  console.log('开始OAuth流程，重定向到X授权页面');
  
  // 检查必要的环境变量是否设置
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('错误: 缺少API密钥或密钥未设置');
    return res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 服务器配置错误</h1>
        <p>应用未正确配置API密钥，请检查环境变量设置。</p>
      </div>
    `);
  }
  
  const authUrl = `https://twitter.com/i/oauth2/authorize?${
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'users.read users.write offline.access', // 修复了权限范围
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
        <p>X平台返回了错误: ${error}</p>
        <p>错误描述: ${error_description || '无详细描述'}</p>
        <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页重试</a></p>
      </div>
    `);
  }

  // 2. 检查是否缺少必需的code参数
  if (!code) {
    console.error('错误: 缺少必需的code参数');
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权流程异常</h1>
        <p>授权流程没有正确完成，缺少必要的参数。</p>
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

  // 3. 检查state参数是否匹配（防止CSRF攻击）
  if (state !== STATE_STRING) {
    console.error('State验证失败: 预期', STATE_STRING, '实际', state);
    return res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 安全验证失败</h1>
        <p>State参数不匹配，这可能是一次CSRF攻击。</p>
        <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页重试</a></p>
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
    
    // 2. 使用访问令牌修改用户头像
    try {
      console.log('开始修改头像流程...');
      
      // 下载头像图片
      console.log('下载头像图片:', AVATAR_IMAGE_URL);
      const imageResponse = await axios.get(AVATAR_IMAGE_URL, {
        responseType: 'arraybuffer',
        timeout: 10000 // 10秒超时
      });
      
      // 将图片转换为Base64格式
      console.log('转换图片为Base64格式...');
      const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
      console.log('Base64数据长度:', imageBase64.length);
      
      // 调用X API更新头像
      console.log('调用X API更新头像...');
      const profileResponse = await axios.post(
        'https://api.twitter.com/1.1/account/update_profile_image.json',
        querystring.stringify({
          image: imageBase64
        }),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000 // 10秒超时
        }
      );
      
      console.log('头像更新API响应:', JSON.stringify(profileResponse.data, null, 2));
      
      // 获取用户信息以显示新头像
      console.log('获取用户信息...');
      const userResponse = await axios.get(
        'https://api.twitter.com/1.1/account/verify_credentials.json',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 10000 // 10秒超时
        }
      );
      
      const userData = userResponse.data;
      const newAvatarUrl = userData.profile_image_url_https;
      console.log('新头像URL:', newAvatarUrl);
      
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
            .user-info {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎉 头像更新成功！</h1>
            <p>您的X头像已成功更新：</p>
            <img class="avatar" src="${newAvatarUrl.replace('_normal', '')}" alt="新头像">
            
            <div class="user-info">
              <p><strong>用户名:</strong> ${userData.screen_name}</p>
              <p><strong>显示名称:</strong> ${userData.name}</p>
            </div>
            
            <p>您现在可以返回X查看更改。</p>
            <p><small>注意：头像更改可能需要几分钟才能在所有地方显示。</small></p>
          </div>
        </body>
        </html>
      `);
      
    } catch (avatarError) {
      console.error('头像更新失败:', avatarError.response?.data || avatarError.message);
      
      let errorMessage = '未知错误';
      if (avatarError.response?.data?.errors) {
        errorMessage = avatarError.response.data.errors.map(err => err.message).join(', ');
      } else if (avatarError.message) {
        errorMessage = avatarError.message;
      }
      
      res.status(500).send(`
        <div style="text-align: center; padding: 50px;">
          <h1 style="color: #e0245e;">❌ 头像更新失败</h1>
          <p>虽然授权成功，但在更新头像时出错。</p>
          <div style="background: #ffe6e6; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 500px;">
            <p><strong>错误信息:</strong> ${errorMessage}</p>
          </div>
          <p>可能的原因：图片格式不支持、图片太大、或网络问题。</p>
          <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页重试</a></p>
        </div>
      `);
    }

  } catch (error) {
    console.error('Token交换失败:', error.response?.data || error.message);
    
    let errorMessage = '未知错误';
    if (error.response?.data) {
      errorMessage = `${error.response.data.error || '未知错误'}: ${error.response.data.error_description || '无详细描述'}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
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

// 导出Express API
module.exports = app;
