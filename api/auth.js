const { createHmac } = require('crypto');
const oauth = require('oauth-1.0a');

// OAuth 1.0a 工具函数
function getOAuth() {
  return oauth({
    consumer: {
      key: process.env.X_API_KEY,
      secret: process.env.X_API_SECRET
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return createHmac('sha1', key)
        .update(base_string)
        .digest('base64');
    }
  });
}

module.exports = async (req, res) => {
  // 生成请求token
  const requestData = {
    url: 'https://api.twitter.com/oauth/request_token',
    method: 'POST',
    data: {
      oauth_callback: process.env.CALLBACK_URL
    }
  };
  
  const oauthHelper = getOAuth();
  const authHeader = oauthHelper.toHeader(oauthHelper.authorize(requestData));
  
  try {
    const response = await fetch(requestData.url, {
      method: requestData.method,
      headers: {
        Authorization: authHeader['Authorization']
      }
    });
    
    const text = await response.text();
    const params = new URLSearchParams(text);
    const oauthToken = params.get('oauth_token');
    const oauthTokenSecret = params.get('oauth_token_secret');
    
    // 存储oauth_token_secret在cookie中（实际应用中应使用更安全的方式）
    res.setHeader('Set-Cookie', `oauth_token_secret=${oauthTokenSecret}; HttpOnly; Path=/; Secure; SameSite=Lax`);
    
    // 重定向到Twitter授权页面
    res.writeHead(302, {
      Location: `https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`
    });
    res.end();
  } catch (error) {
    console.error('Error getting request token:', error);
    res.status(500).json({ error: 'Failed to get request token' });
  }
};