const http = require('http');

const data = JSON.stringify({
    token: '837fdd1fca6678a4281e65719a4ff795303a739883343751051a5fe1ed2f02a9',
    uid: '5OheSZKXbJNj3RYMcTsBmjiZ1In1'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/confirm-verification',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('Sending verification request...');

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);

    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
    });

    res.on('end', () => {
        console.log('Response body:', body);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
