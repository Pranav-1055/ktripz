const http = require('http');

// Dynamic import for node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

console.log('Sending request to localhost:3002...');

(async () => {
    try {
        const response = await fetch('http://localhost:3002/api/auth/initiate-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test_crash@example.com',
                uid: 'test_uid_123',
                userType: 'passenger'
            })
        });

        console.log('Response status:', response.status);
        const text = await response.text();
        console.log('Response body:', text);
    } catch (error) {
        console.error('Request failed:', error);
    }
})();
