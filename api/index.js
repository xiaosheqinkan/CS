const express = require('express');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const axios = require('axios');

const app = express();

// 从环境变量获取配置
const CONSUMER_KEY = process.env.X_API_KEY;
const CONSUMER_SECRET = process.env.X_API_SECRET;
const ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

// OAuth 1.0a 配置
const oauth = OAuth({
  consumer: {
    key: CONSUMER_KEY,
    secret: CONSUMER_SECRET
  },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto
      .createHmac('sha1', key)
      .update(base_string)
      .digest('base64');
  }
});

// 首页
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X用户简介更新工具 (API 1.1)</title>
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
        </style>
    </head>
    <body>
        <div class="container">
          <h1>X用户简介更新工具 (API 1.1)</h1>
          <p>点击下方按钮更新您的X简介。</p>
          <a class="btn" href="/update-profile">更新简介为"你鱼爹"</a>
        </div>
    </body>
    </html>
  `);
});

// 更新简介端点
app.get('/update-profile', async (req, res) => {
  try {
    // 检查必要的环境变量
    if (!CONSUMER_KEY || !CONSUMER_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET) {
      throw new Error('缺少必要的API配置，请检查环境变量设置');
    }

    // 准备API请求
    const request_data = {
      url: 'https://api.twitter.com/1.1/account/update_profile.json',
      method: 'POST',
      data: {
        description: '你鱼爹'
      }
    };

    // 生成OAuth 1.0a签名
    const token = {
      key: ACCESS_TOKEN,
      secret: ACCESS_TOKEN_SECRET
    };

    const authHeader = oauth.toHeader(oauth.authorize(request_data, token));
    
    // 发送请求到X API
    const response = await axios.post(
      request_data.url,
      new URLSearchParams(request_data.data),
      {
        headers: {
          'Authorization': authHeader.Authorization,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // 显示成功页面
    res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #17bf63;">🎉 操作成功！</h1>
        <p>您的X简介已成功更新为"你鱼爹"。</p>
        <p><strong>用户名:</strong> ${response.data.screen_name}</p>
        <p><strong>名称:</strong> ${response.data.name}</p>
        <p><a href="https://x.com/${response.data.screen_name}" target="_blank">查看我的X主页</a></p>
        <p><a href="/">返回首页</a></p>
      </div>
    `);

  } catch (error) {
    console.error('更新失败:', error.response?.data || error.message);
    
    let errorMessage = '未知错误';
    if (error.response?.data) {
      errorMessage = JSON.stringify(error.response.data, null, 2);
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 更新失败</h1>
        <pre style="text-align: left; white-space: pre-wrap;">${errorMessage}</pre>
        <p><a href="/">返回首页重试</a></p>
      </div>
    `);
  }
});

// 导出Express API
module.exports = app;
