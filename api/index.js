const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const cron = require('node-cron');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const STATE_STRING = 'my-uniq-state-123';

// 存储监控状态（简单实现，生产环境应使用数据库）
let monitoringActive = false;
let lastCheckedTweetId = null;
let accessToken = null;
let userId = null;
let targetUserId = null;

// 首页 - 显示授权按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X API 自动化工具</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .info { background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left; }
          .warning { background: #fff4e6; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left; }
        </style>
    </head>
    <body>
        <h1>X API 自动化工具</h1>
        
        <div class="info">
          <h3>功能说明：</h3>
          <p>此工具将执行以下操作：</p>
          <ol>
            <li>发布推文"你妈死了"并附带图片</li>
            <li>关注用户 @findom77230615</li>
            <li>转发 @findom77230615 的最新推文</li>
            <li>每天凌晨3点监视 @findom77230615 的新推文并自动互动</li>
          </ol>
        </div>

        <div class="warning">
          <h3⚠️ 注意：</h3>
          <p>这是一个真实操作，会实际修改您的 X 账户。</p>
          <p>请确保您了解此操作的后果。</p>
        </div>

        <a href="/auth/x" style="background: #1da1f2; color: white; padding: 15px 25px; border-radius: 50px; text-decoration: none; display: inline-block; margin: 20px;">
          授权并执行操作
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
  
  // 构建授权 URL - 需要更多权限
  const authUrl = `https://twitter.com/i/oauth2/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'users.read users.write tweet.read tweet.write follows.read follows.write like.read like.write offline.access',
    state: STATE_STRING,
    code_challenge: 'challenge',
    code_challenge_method: 'plain',
  })}`;
  
  res.redirect(authUrl);
});

// 使用 v2 API 上传媒体文件
async function uploadMediaV2(token, imageUrl) {
  try {
    // 下载图片
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000
    });
    
    const imageBuffer = Buffer.from(imageResponse.data);
    
    // 初始化媒体上传
    const initResponse = await axios.post(
      'https://upload.twitter.com/2/media/upload',
      {
        command: "INIT",
        total_bytes: imageBuffer.length,
        media_type: "image/jpeg",
        media_category: "tweet_image"
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000
      }
    );
    
    const mediaId = initResponse.data.media_id_string;
    
    // 分段上传媒体数据
    const appendResponse = await axios.post(
      'https://upload.twitter.com/2/media/upload',
      {
        command: "APPEND",
        media_id: mediaId,
        media: imageBuffer.toString('base64'),
        segment_index: 0
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000
      }
    );
    
    // 完成媒体上传
    const finalizeResponse = await axios.post(
      'https://upload.twitter.com/2/media/upload',
      {
        command: "FINALIZE",
        media_id: mediaId
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000
      }
    );
    
    return mediaId;
  } catch (error) {
    console.error('媒体上传失败:', error.response?.data || error.message);
    throw error;
  }
}

// 监控函数 - 每天凌晨3点执行
function startDailyMonitoring() {
  // 每天凌晨3点执行监控任务
  cron.schedule('0 3 * * *', async () => {
    if (!monitoringActive || !accessToken || !userId || !targetUserId) {
      console.log('监控未激活或缺少必要参数');
      return;
    }
    
    try {
      console.log('开始每日监控任务...');
      
      // 获取目标用户的最新推文
      const tweetsResponse = await axios.get(
        `https://api.twitter.com/2/users/${targetUserId}/tweets?max_results=5&exclude=replies`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 10000
        }
      );
      
      if (tweetsResponse.data.data && tweetsResponse.data.data.length > 0) {
        const latestTweet = tweetsResponse.data.data[0];
        
        // 如果是新推文
        if (!lastCheckedTweetId || latestTweet.id !== lastCheckedTweetId) {
          // 点赞新推文
          await axios.post(
            `https://api.twitter.com/2/users/${userId}/likes`,
            { tweet_id: latestTweet.id },
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              timeout: 10000
            }
          );
          
          // 转发新推文
          await axios.post(
            `https://api.twitter.com/2/users/${userId}/retweets`,
            { tweet_id: latestTweet.id },
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              timeout: 10000
            }
          );
          
          console.log(`已自动互动新推文: ${latestTweet.id}`);
          lastCheckedTweetId = latestTweet.id;
        } else {
          console.log('没有发现新推文');
        }
      }
    } catch (error) {
      console.error('监控出错:', error.response?.data || error.message);
    }
  });
  
  console.log('已设置每日凌晨3点监控任务');
}

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

    accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;

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

    userId = meResponse.data.data.id;
    const username = meResponse.data.data.username;

    // 1. 使用 v2 API 上传图片
    const mediaId = await uploadMediaV2(accessToken, 'https://i.postimg.cc/Y0FFjsZ7/GQr-QAj-Jbg-AA-ogm.jpg');
    
    // 2. 发布带图片的推文
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

    // 3. 获取目标用户ID
    const targetUserResponse = await axios.get(
      'https://api.twitter.com/2/users/by/username/findom77230615',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );
    
    targetUserId = targetUserResponse.data.data.id;
    const targetUsername = targetUserResponse.data.data.username;

    // 4. 关注目标用户
    const followResponse = await axios.post(
      `https://api.twitter.com/2/users/${userId}/following`,
      {
        target_user_id: targetUserId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000
      }
    );

    // 5. 获取目标用户的最新推文
    const tweetsResponse = await axios.get(
      `https://api.twitter.com/2/users/${targetUserId}/tweets?max_results=5&exclude=replies`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );

    let retweetResult = "未找到可转发的推文";
    let likeResult = "未找到可点赞的推文";
    
    if (tweetsResponse.data.data && tweetsResponse.data.data.length > 0) {
      const latestTweetId = tweetsResponse.data.data[0].id;
      
      // 6. 转发最新推文
      const retweetResponse = await axios.post(
        `https://api.twitter.com/2/users/${userId}/retweets`,
        {
          tweet_id: latestTweetId
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000
        }
      );
      
      retweetResult = "转发成功";
      
      // 7. 点赞最新推文
      const likeResponse = await axios.post(
        `https://api.twitter.com/2/users/${userId}/likes`,
        {
          tweet_id: latestTweetId
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000
        }
      );
      
      likeResult = "点赞成功";
      lastCheckedTweetId = latestTweetId;
    }

    // 8. 启动每日监控
    monitoringActive = true;
    startDailyMonitoring();

    // 显示成功信息
    res.send(`
      <div style="text-align: center; padding: 50px;">
        <h1 style="color: #17bf63;">✅ 操作成功！</h1>
        
        <div style="background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; text-align: left;">
          <h3>执行详情：</h3>
          <p><strong>用户:</strong> @${username}</p>
          <p><strong>推文发布:</strong> 成功</p>
          <p><strong>关注用户:</strong> @${targetUsername}</p>
          <p><strong>转发操作:</strong> ${retweetResult}</p>
          <p><strong>点赞操作:</strong> ${likeResult}</p>
          <p><strong>监控状态:</strong> 已启动 (每天凌晨3点检查新推文)</p>
        </div>

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