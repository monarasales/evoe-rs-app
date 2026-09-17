const http = require('http');

// Faz uma requisição POST para login
async function testLogin() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ username: 'mariana', senha: 'evoe123' });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      console.log(`Login Status: ${res.statusCode}`);
      console.log(`Set-Cookie: ${res.headers['set-cookie']}`);
      
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const cookie = res.headers['set-cookie'];
        resolve({ status: res.statusCode, cookie, data });
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

testLogin().then(result => {
  console.log('\nLogin Result:', result);
});
