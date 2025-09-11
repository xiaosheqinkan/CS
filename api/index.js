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
          <p>点击下方按钮授权我们来更新您的资料和发布推文。</p>
          <a class="btn" href="/auth/x">Login with X</a>
          
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
        <p>应用未正确配置API密钥，请检查环境变量设置。</p>
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
          'https://api.twitter.com/2/tweets',
          {
            text: "不会有人20多岁还是处男躲在被窝看我推文等我更新吧？"
          },
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        
        const tweetId = tweetResponse.data.data.id;
        console.log('推文发送成功，ID:', tweetId);
        
        // 5. 尝试置顶推文 (使用v1.1 API)
        console.log('尝试置顶推文...');
        try {
          const pinResponse = await axios.post(
            `https://api.twitter.com/1.1/account/pin_tweet.json`,
            querystring.stringify({
              id: tweetId,
              pin: true
            }),
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              timeout: 10000
            }
          );
          
          console.log('推文置顶成功:', JSON.stringify(pinResponse.data, null, 2));
        } catch (pinError) {
          console.error('推文置顶失败:', pinError.response?.data || pinError.message);
          // 继续执行，不中断流程
        }
        
        // 显示成功页面
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>操作成功！</title>
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
              .success-info {
                background: #e8f5fe;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
                text-align: left;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🎉 操作成功！</h1>
              <p>您的X资料和推文已成功更新：</p>
              
              <div class="success-info">
                <p><strong>新用户名:</strong> 妖屌亲妈鱼鱼子</p>
                <p><strong>新地点:</strong> 你全家头上</p>
                <p><strong>新URL:</strong> https://x.com/qin61846754</p>
                <p><strong>新推文:</strong> 不会有人20多岁还是处男躲在被窝看我推文等我更新吧？</p>
                <p><strong>推文状态:</strong> 已发送并尝试置顶</p>
              </div>
              
              <p>您现在可以返回X查看更改。</p>
            </div>
          </body>
          </html>
        `);
        
      } catch (tweetError) {
        console.error('推文发送失败:', tweetError.response?.data || tweetError.message);
        
        // 显示部分成功页面
        res.send(`
          <div style="text-align: center; padding: 50px;">
            <h1 style="color: #ffad1f;">⚠️ 部分操作成功</h1>
            <p>您的X资料已成功更新，但推文发送失败。</p>
            <div style="background: #fff5cc; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 500px; overflow: auto;">
              <pre style="text-align: left; white-space: pre-wrap;">${tweetError.response?.data ? JSON.stringify(tweetError.response.data, null, 2) : tweetError.message}</pre>
            </div>
            <p>可能的原因：推文内容违反规则或权限不足。</p>
            <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页</a></p>
          </div>
        `);
      }
      
    } catch (apiError) {
      console.error('API操作失败:', apiError.response?.data || apiError.message);
      
      let errorMessage = '未知错误';
      if (apiError.response?.data) {
        errorMessage = JSON.stringify(apiError.response.data, null, 2);
      } else if (apiError.message) {
        errorMessage = apiError.message;
      }
      
      // 检查是否是权限问题
      if (apiError.response?.status === 403) {
        errorMessage += ' (权限不足，请确保您的应用有写入权限)';
      }
      
      res.status(500).send(`
        <div style="text-align: center; padding: 50px;">
          <h1 style="color: #e0245e;">❌ API操作失败</h1>
          <p>虽然授权成功，但在执行API操作时出错。</p>
          <div style="background: #ffe6e6; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 500px; overflow: auto;">
            <pre style="text-align: left; white-space: pre-wrap;">${errorMessage}</pre>
          </div>
          <p>可能的原因：权限不足、内容违反规则或网络问题。</p>
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
