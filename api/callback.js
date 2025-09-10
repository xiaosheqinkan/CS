const { createHmac } = require('crypto');
const oauth = require('oauth-1.0a');
const axios = require('axios');

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
  const { oauth_token, oauth_verifier } = req.query;
  
  // 从cookie获取oauth_token_secret
  const oauthTokenSecret = req.cookies?.oauth_token_secret;
  
  if (!oauthTokenSecret) {
    return res.status(400).send('Invalid session');
  }
  
  try {
    // 获取access token
    const requestData = {
      url: 'https://api.twitter.com/oauth/access_token',
      method: 'POST',
      data: {
        oauth_token,
        oauth_verifier
      }
    };
    
    const oauthHelper = getOAuth();
    const authHeader = oauthHelper.toHeader(oauthHelper.authorize(requestData));
    
    const tokenResponse = await fetch(requestData.url, {
      method: requestData.method,
      headers: {
        Authorization: authHeader['Authorization']
      }
    });
    
    const tokenText = await tokenResponse.text();
    const tokenParams = new URLSearchParams(tokenText);
    const accessToken = tokenParams.get('oauth_token');
    const accessTokenSecret = tokenParams.get('oauth_token_secret');
    const userId = tokenParams.get('user_id');
    const screenName = tokenParams.get('screen_name');
    
    // 使用API v2更新用户资料
    const updateData = {
      url: 'https://api.twitter.com/2/users/' + userId,
      method: 'PATCH',
      data: {
        location: '你妈头上'
      }
    };
    
    const updateAuthHeader = oauthHelper.toHeader(oauthHelper.authorize(updateData, {
      key: accessToken,
      secret: accessTokenSecret
    }));
    
    const updateResponse = await fetch(updateData.url, {
      method: updateData.method,
      headers: {
        'Authorization': updateAuthHeader['Authorization'],
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData.data)
    });
    
    if (updateResponse.ok) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Twitter Location Updated</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: green; }
          </style>
        </head>
        <body>
          <h1 class="success">成功!</h1>
          <p>你的Twitter位置已更新为"你妈头上"</p>
          <p>@${screenName}，刷新你的Twitter个人资料查看更改。</p>
        </body>
        </html>
      `);
    } else {
      const errorText = await updateResponse.text();
      console.error('Error updating profile:', errorText);
      res.status(500).send('Failed to update profile');
    }
  } catch (error) {
    console.error('Error in callback:', error);
    res.status(500).send('An error occurred');
  }
};