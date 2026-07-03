const http = require('http');

async function makeRequest(path, method, body, cookie = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  try {
    console.log('1. Testing Login...');
    const loginRes = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@omnidesk.local',
      password: 'password',
    });
    console.log('Login Status:', loginRes.statusCode);
    
    let setCookieHeaders = loginRes.headers['set-cookie'];
    if (!setCookieHeaders) {
      console.log('NO COOKIES RETURNED!');
      return;
    }
    
    let authCookie = setCookieHeaders.find(c => c.startsWith('Authentication=')).split(';')[0];
    let refreshCookie = setCookieHeaders.find(c => c.startsWith('Refresh=')).split(';')[0];
    console.log('Got Auth Cookie:', authCookie.substring(0, 30) + '...');
    console.log('Got Refresh Cookie:', refreshCookie.substring(0, 30) + '...');

    console.log('\n2. Testing Authenticated Endpoint (me)...');
    const meRes = await makeRequest('/api/v1/auth/me', 'GET', null, authCookie);
    console.log('Me Status:', meRes.statusCode);
    console.log('Me Data:', meRes.data);

    console.log('\n3. Testing Refresh Endpoint...');
    const refreshRes = await makeRequest('/api/v1/auth/refresh', 'POST', null, refreshCookie);
    console.log('Refresh Status:', refreshRes.statusCode);
    
    let refreshSetCookieHeaders = refreshRes.headers['set-cookie'];
    if (refreshSetCookieHeaders) {
      console.log('New Cookies Received!');
    } else {
      console.log('No new cookies received on refresh.');
    }

    console.log('\n4. Testing Logout Endpoint...');
    const logoutRes = await makeRequest('/api/v1/auth/logout', 'POST', null, authCookie);
    console.log('Logout Status:', logoutRes.statusCode);
    console.log('Logout Set-Cookie:', logoutRes.headers['set-cookie']);

  } catch (error) {
    console.error('Error:', error);
  }
}

test();
