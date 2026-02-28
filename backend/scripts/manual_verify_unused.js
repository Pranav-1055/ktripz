const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/auth/confirm-verification';
const TOKEN = '837fdd1fca6678a4281e65719a4ff795303a739883343751051a5fe1ed2f02a9';
const UID = '5OheSZKXbJNj3RYMcTsBmjiZ1In1';

async function verify() {
    console.log(`Verifying token...`);
    console.log(`URL: ${API_URL}`);
    console.log(`Token: ${TOKEN}`);
    console.log(`UID: ${UID}`);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: TOKEN, uid: UID })
        });

        const data = await response.json();
        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

verify();
