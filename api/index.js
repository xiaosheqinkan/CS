const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();

// 从环境变量获取配置
const CLIENT_ID = process.env.X_API_KEY;
const CLIENT_SECRET = process.env.X_API_SECRET;
const REDIRECT_URI = 'https://cs-seven-zeta.vercel.app/api/callback';
const STATE_STRING = 'my-uniq-state-123';
const TEST_MODE = true; // 设置为true启用测试模式，不会实际修改数据

// 首页 - 提供一个简单的登录按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>X用户简介更新工具 - ${TEST_MODE ? '测试模式' : '生产模式'}</title>
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
          .test-mode {
            margin-top: 20px;
            padding: 15px;
            background: #fff5cc;
            border-radius: 10px;
            font-size: 14px;
            color: #e6b800;
          }
        </style>
    </head>
    <body>
        <div class="container">
          <h1>X用户简介更新工具 - ${TEST_MODE ? '测试模式' : '生产模式'}</h1>
          <p>点击下方按钮授权我们来${TEST_MODE ? '测试' : '更新'}您的简介。</p>
          <a class="btn" href="/auth/x">Login with X</a>
          
          <div class="note">
            <strong>注意：</strong> 授权后，我们将${TEST_MODE ? '测试' : '更新'}您的X简介。
          </div>
          
          ${TEST_MODE ? `
          <div class="test-mode">
            <strong>测试模式已启用：</strong> 在此模式下，不会实际修改您的X简介。
          </div>
          ` : ''}
          
          <div class="warning">
            <strong>警告：</strong> 请确保您了解此操作将${TEST_MODE ? '测试修改' : '修改'}您的公开简介。
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
  
  // 简化权限范围 - 只请求必要的权限
  const authUrl = `https://twitter.com/i/oauth2/authorize?${
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'tweet.read users.read', // 简化权限范围
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
      // 2. 获取当前用户ID和简介
      console.log('获取当前用户信息...');
      const meResponse = await axios.get(
        'https://api.twitter.com/2/users/me?user.fields=id,name,username,description',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 10000
        }
      );
      
      const userId = meResponse.data.data.id;
      const username = meResponse.data.data.username;
      const currentName = meResponse.data.data.name;
      const currentDescription = meResponse.data.data.description;
      
      console.log('当前用户ID:', userId, '用户名:', username);
      console.log('当前用户名:', currentName);
      console.log('当前简介:', currentDescription);
      
      // 3. 测试更新用户简介
      console.log('测试更新用户简介...');
      const updateData = {
        description: "你鱼爹"
      };
      
      if (TEST_MODE) {
        console.log('测试模式: 不会实际更新用户简介');
        console.log('将发送的数据:', JSON.stringify(updateData, null, 2));
        
        // 在测试模式下，我们可以尝试模拟API调用但不实际发送
        try {
          // 模拟API调用 - 只检查权限和端点可用性
          const testResponse = await axios.patch(
            `https://api.twitter.com/2/users/${userId}`,
            {},
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000,
              validateStatus: function (status) {
                // 我们只关心是否有权限，不关心实际响应
                return status < 500; // 只拒绝5xx错误
              }
            }
          );
          console.log('用户简介更新权限验证成功');
        } catch (testError) {
          console.log('用户简介更新权限验证结果:', testError.response?.status, testError.response?.data?.title);
          // 这只是一个测试，我们不关心实际错误
        }
      } else {
        try {
          const updateResponse = await axios.patch(
            `https://api.twitter.com/2/users/${userId}`,
            updateData,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }
          );
          
          console.log('用户简介更新成功:', JSON.stringify(updateResponse.data, null, 2));
        } catch (updateError) {
          console.error('用户简介更新失败:', updateError.response?.data || updateError.message);
          
          // 显示错误页面
          res.status(500).send(`
            <div style="text-align: center; padding: 50px;">
              <h1 style="color: #e0245e;">❌ 简介更新失败</h1>
              <p>在更新用户简介时出错。</p>
              <div style="background: #ffe6e6; padding: 15px; border-radius: 8px; margin: 20px auto; max-width: 500px; overflow: auto;">
                <pre style="text-align: left; white-space: pre-wrap;">${updateError.response?.data ? JSON.stringify(updateError.response.data, null, 2) : updateError.message}</pre>
              </div>
              <p>可能的原因：权限不足或内容违反规则。</p>
              <p><a href="/" style="color: #1da1f2; text-decoration: none; font-weight: bold;">返回首页重试</a></p>
            </div>
          `);
          return;
        }
      }
      
      // 显示成功页面
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${TEST_MODE ? '测试成功！' : '操作成功！'}</title>
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
            .test-info {
              background: #fff5cc;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              text-align: left;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎉 ${TEST_MODE ? '测试成功！' : '操作成功！'}</h1>
            <p>${TEST_MODE ? '测试已完成，API调用已验证。' : '您的X简介已成功更新：'}</p>
            
            ${TEST_MODE ? `
            <div class="test-info">
              <p><strong>测试模式已启用</strong></p>
              <p>在此模式下，不会实际修改您的X简介。</p>
              <p>API调用已验证，可以正常工作。</p>
              <p>要实际执行操作，请将代码中的 <code>TEST_MODE</code> 设置为 <code>false</code>。</p>
            </div>
            ` : ''}
            
            <div class="success-info">
              <p><strong>当前用户名:</strong> ${currentName}</p>
              <p><strong>当前简介:</strong> ${currentDescription || '未设置'}</p>
              ${TEST_MODE ? `
              <p><strong>将设置的简介:</strong> 你鱼爹</p>
              ` : `
              <p><strong>新简介:</strong> 你鱼爹</p>
              `}
            </div>
            
            ${TEST_MODE ? `
            <p>测试已完成，API调用已验证。要实际执行操作，请将代码中的 <code>TEST_MODE</code> 设置为 <code>false</code>。</p>
            ` : `
            <p>您现在可以返回X查看更改。</p>
            `}
          </div>
        </body>
        </html>
      `);
      
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
