const axios = require('axios');

async function probeTokenUrl(url) {
    try {
        console.log(`Probing: ${url}`);
        const response = await axios.post(url, {
            grant_type: 'client_credentials',
            client_id: 'test',
            client_secret: 'test'
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            validateStatus: () => true // Accept all status codes
        });
        console.log(`Status: ${response.status}`);
        console.log(`Data:`, JSON.stringify(response.data).substring(0, 200));
        return response.status !== 404;
    } catch (error) {
        console.log(`Error: ${error.message}`);
        return false;
    }
}

async function run() {
    const candidates = [
        'https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token',
        'https://api.olamaps.io/oauth2/token',
        'https://api.olamaps.io/v1/oauth/token',
        'https://api.olamaps.io/auth/token',
        'https://account.olacabs.com/connect/token'
    ];

    for (const url of candidates) {
        if (await probeTokenUrl(url)) {
            console.log(`\n!!! POTENTIAL MATCH: ${url} !!!\n`);
        }
    }
}

run();
