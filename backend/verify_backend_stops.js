const fetch = require('node-fetch');

async function verifyBackend() {
    try {
        console.log('Checking /api/stops...');
        const response = await fetch('http://localhost:3000/api/stops');
        console.log(`Status: ${response.status}`);
        if (response.ok) {
            const data = await response.json();
            console.log('Data:', JSON.stringify(data, null, 2));
        } else {
            console.error('Error:', await response.text());
        }
    } catch (error) {
        console.error('Fetch Error:', error.message);
    }
}

// Retry logic to wait for server start
async function run() {
    for (let i = 0; i < 10; i++) {
        try {
            await verifyBackend();
            break;
        } catch (e) {
            console.log('Waiting for server...');
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

run();
