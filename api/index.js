const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const fs = require('fs'); // 用于可能的文件操作（如果需要从URL下载图片到临时文件）
const https = require('https'); // 用于直接处理HTTPS请求下载图片

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const STATE_STRING = 'my-uniq-state-123';
const TARGET_IMAGE_URL = 'https://i.postimg.cc/Y0FFjsZ7/GQr-QAj-Jbg-AA-ogm.jpg'; // 目标图片URL

// 首页 - 显示授权按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X API 发布推文工具</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .info { background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left; }
          .warning { background: #fff4e6; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left; }
        </style>
    </head>
    <body>
        <h1>X API 发布推文工具 (第一阶段)</h1>
        
        <div class="info">
          <h3>当前阶段功能说明：</h3>
          <p>此阶段将尝试执行以下操作：</p>
          <ol>
            <li>请求用户授权</li>
            <li>发布推文"你妈死了"并附带指定图片</li>
          </ol>
          <p><strong>图片URL:</strong> ${TARGET_IMAGE_URL}</p>
        </div>

        <div class="warning">
          <h3>⚠️ 注意：</h3>
          <p>这是一个真实操作，会实际修改您的 X 账户。</p>
          <p>请确保您了解此操作的后果。</p>
        </div>

        <a href="/auth/x" style="background: #1da1f2; color: white; padding: 15px 25px; border-radius: 50px; text-decoration: none; display: inline-block; margin: 20px;">
          授权并发布推文
        </a>

        <div style="margin-top: 30px;">
          <h3>调试信息：</h3>
          <p><strong>CLIENT_ID:</strong> ${CLIENT_ID ? '已设置（部分隐藏）' + CLIENT_ID.substring(0, 5) + '...' : '未设置'}</p>
          <p><strong>CLIENT_SECRET:</strong> ${CLIENT_SECRET ? '已设置（部分隐藏）' + CLIENT_SECRET.substring(0, 5) + '...' : '未设置'}</p>
        </div>
    </body>
    </html>
  `);
});

// 启动 OAuth 2.0 授权流程
app.get('/auth/x', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send('服务器配置错误: 缺少 API 密钥或密钥秘密。请检查 Vercel 环境变量设置。');
  }
  
  // 定义权限范围 - 专注于发布推文和媒体上传
  const scopes = [
    'tweet.read',
    'tweet.write',      // 发布推文必需
    'users.read',       // 获取用户信息
    'offline.access'    // 获取刷新令牌，用于长期访问（如果需要）
  ].join(' ');
  
  // 构建授权 URL
  const authUrl = `https://twitter.com/i/oauth2/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: scopes,
    state: STATE_STRING,
    code_challenge: 'challenge', // PKCE 的 code_challenge (简化示例)
    code_challenge_method: 'plain', // PKCE 的 code_challenge_method (简化示例)
  })}`;
  
  console.log("重定向到授权URL: ", authUrl); // 调试日志
  res.redirect(authUrl);
});

/**
 * 下载图片并转换为Base64
 * @param {string} url 图片URL
 * @returns {Promise<string>} Base64编码的图片数据
 */
async function downloadImageToBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = [];
      response.on('data', chunk => data.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(data);
        const base64String = buffer.toString('base64');
        resolve(base64String);
      });
    }).on('error', reject);
  });
}

/**
 * 使用 Twitter API v2 上传媒体（图片）
 * @param {string} accessToken OAuth 2.0 访问令牌
 * @param {string} imageUrl 要上传的图片URL
 * @returns {Promise<string>} 媒体ID (media_id_string)
 */
async function uploadMediaV2(accessToken, imageUrl) {
  try {
    console.log("开始下载图片: ", imageUrl);
    const imageBase64 = await downloadImageToBase64(imageUrl);
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    console.log("图片下载完成，大小: ", imageBuffer.length, "bytes");

    // 1. INIT - 初始化上传
    const initResponse = await axios.post(
      'https://upload.twitter.com/1.1/media/upload.json', // 注意：媒体上传目前通常仍使用v1.1端点
      {
        command: "INIT",
        total_bytes: imageBuffer.length,
        media_type: "image/jpeg",
        media_category: "tweet_image"
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000 // 媒体上传可能需要更长时间
      }
    );

    const mediaId = initResponse.data.media_id_string;
    console.log("媒体上传初始化成功，Media ID: ", mediaId);

    // 2. APPEND - 追加媒体数据
    // 注意：V2媒体上传API的APPEND步骤可能需要将数据分块发送，这里简化处理，假设图片较小
    const appendResponse = await axios.post(
      'https://upload.twitter.com/1.1/media/upload.json',
      {
        command: "APPEND",
        media_id: mediaId,
        media_data: imageBase64, // 直接发送base64编码的数据
        segment_index: 0
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000
      }
    );
    console.log("媒体数据追加成功");

    // 3. FINALIZE - 最终化上传
    const finalizeResponse = await axios.post(
      'https://upload.twitter.com/1.1/media/upload.json',
      {
        command: "FINALIZE",
        media_id: mediaId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000
      }
    );
    console.log("媒体上传最终化成功");

    // 4. 检查媒体处理状态（可选，但对于图片通常很快）
    // 如果需要等待媒体处理完成（例如视频），可以在这里添加状态检查循环
    let mediaStatus = finalizeResponse.data.processing_info ? finalizeResponse.data.processing_info.state : 'succeeded';
    if (mediaStatus === 'pending' || mediaStatus === 'in_progress') {
      console.log("媒体仍在处理中，状态: ", mediaStatus);
      // 可以添加一个循环来等待处理完成，但图片通常很快
    }

    return mediaId;

  } catch (error) {
    console.error('媒体上传失败 - 详细信息:', error.response ? {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data
    } : error.message);
    throw new Error(`媒体上传失败: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
  }
}

// OAuth 2.0 回调处理
app.get('/api/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  console.log("收到回调，参数: ", { code, state, error, error_description }); // 调试日志

  // 处理授权错误
  if (error) {
    const errorHtml = `
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 授权失败</h1>
        <p><strong>错误类型:</strong> ${error}</p>
        <p><strong>详细描述:</strong> ${error_description || '无详细描述'}</p>
        ${error === 'invalid_scope' ? `
          <div style="background: #fff4f4; padding: 15px; border-radius: 8px; margin: 20px;">
            <h3>invalid_scope 错误解决方案：</h3>
            <ol style="text-align: left;">
              <li>登录 <a href="https://developer.twitter.com" target="_blank">X Developer Portal</a></li>
              <li>进入您的应用设置 → "User authentication settings"</li>
              <li>点击 "Edit" 并确保已启用以下权限：
                <ul>
                  <li>Read tweets (tweet.read)</li>
                  <li>Write tweets (tweet.write)</li>
                  <li>Read users (users.read)</li>
                </ul>
              </li>
              <li><strong>应用类型必须设置为 "Read and write"</strong></li>
              <li>保存设置后，可能需要几分钟才能生效</li>
            </ol>
            <p><strong>注意：</strong> 我们当前请求的权限范围为：tweet.read, tweet.write, users.read, offline.access</p>
          </div>
        ` : ''}
        <p><a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1da1f2; color: white; border-radius: 5px; text-decoration: none;">返回首页重试</a></p>
      </div>
    `;
    return res.send(errorHtml);
  }

  // 验证 state 参数防止 CSRF 攻击
  if (state !== STATE_STRING) {
    return res.send('安全验证失败: State 参数不匹配');
  }

  if (!code) {
    return res.send('授权流程异常: 缺少授权码');
  }

  try {
    console.log("尝试使用授权码换取访问令牌...");
    // 使用授权码换取访问令牌
    const tokenResponse = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      querystring.stringify({
        code: code,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: 'challenge', // 必须与授权请求中的 code_challenge 对应
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
    console.log("成功获取访问令牌");

    // 使用获取的访问令牌请求用户信息（获取用户ID）
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
    console.log(`获取用户信息成功: ${username} (ID: ${userId})`);

    // 1. 使用 API 上传图片
    console.log("开始上传媒体...");
    const mediaId = await uploadMediaV2(accessToken, TARGET_IMAGE_URL);
    console.log("媒体上传成功，Media ID: ", mediaId);

    // 2. 发布带图片的推文
    console.log("尝试发布推文...");
    const tweetResponse = await axios.post(
      `https://api.twitter.com/2/users/${userId}/tweets`,
      {
        text: "你妈死了",
        media: { media_ids: [mediaId] }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000
      }
    );

    const tweetId = tweetResponse.data.data.id;
    console.log("推文发布成功! Tweet ID: ", tweetId);

    // 显示成功信息
    const successHtml = `
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #17bf63;">✅ 推文发布成功！</h1>
        
        <div style="background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left;">
          <h3>执行详情：</h3>
          <p><strong>用户:</strong> @${username}</p>
          <p><strong>推文内容:</strong> 你妈死了</p>
          <p><strong>图片URL:</strong> ${TARGET_IMAGE_URL}</p>
          <p><strong>推文ID:</strong> ${tweetId}</p>
          <p><strong>发布时间:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div style="background: #e6f7ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px;">
          <h3>API 响应：</h3>
          <pre style="text-align: left; white-space: pre-wrap; background: white; padding: 15px; border-radius: 5px; max-height: 300px; overflow: auto;">
${JSON.stringify(tweetResponse.data, null, 2)}
          </pre>
        </div>

        <p><a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1da1f2; color: white; border-radius: 5px; text-decoration: none;">返回首页</a></p>
      </div>
    `;
    res.send(successHtml);
    
  } catch (error) {
    // 错误处理
    console.error('API 请求失败 - 详细信息:', error.response ? {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data
    } : error.message);

    let errorMessage = '未知错误';
    if (error.response?.data) {
      errorMessage = JSON.stringify(error.response.data, null, 2);
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    const errorHtml = `
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #e0245e;">❌ 请求失败</h1>
        <p><strong>错误步骤:</strong> ${error.config ? `${error.config.method?.toUpperCase()} ${error.config.url}` : '未知步骤'}</p>
        <pre style="text-align: left; white-space: pre-wrap; background: #f8f8f8; padding: 15px; border-radius: 8px; max-height: 400px; overflow: auto;">${errorMessage}</pre>
        <p><a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1da1f2; color: white; border-radius: 5px; text-decoration: none;">返回首页重试</a></p>
      </div>
    `;
    res.status(500).send(errorHtml);
  }
});

module.exports = app;