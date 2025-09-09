const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 首页 - 只有一个按钮
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>我的X应用</title>
        <style>body { font-family: Arial; text-align: center; padding: 50px; } a { background: #1da1f2; color: white; padding: 15px 25px; border-radius: 50px; text-decoration: none; }</style>
    </head>
    <body>
        <h1>我的X应用</h1>
        <p>点击下方按钮连接您的X账号。</p>
        <a href="/auth/x">Login with X</a>
    </body>
    </html>
  `);
});

// 这个路由负责跳转到X去登录
app.get('/auth/x', (req, res) => {
  const clientId = process.env.X_API_KEY; // 从环境变量读取ID
  const redirectUri = process.env.CALLBACK_URL; // 从环境变量读取回调地址

  // 构建X的官方授权网址
  const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=users.read%20tweet.read&state=123&code_challenge=challenge&code_challenge_method=plain`;
  
  res.redirect(authUrl); // 跳转到X官方页面
});

// X授权后会回到这个地址
app.get('/api/callback', (req, res) => {
  // 如果成功跳回到这里，说明授权流程通了！
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>成功!</title><style>body { font-family: Arial; text-align: center; padding: 50px; } h1 { color: green; }</style></head>
    <body>
        <h1>🎉 成功！</h1>
        <p>您已成功完成X授权！</p>
        <p>这意味着您的应用配置是正确的。</p>
    </body>
    </html>
  `);
});

// 让服务器运行起来
module.exports = app;
// 添加这行代码，让Vercel能够正确启动你的应用
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});