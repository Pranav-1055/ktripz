const axios = require('axios');
const qs = require('qs');

async function testToken() {
    const tokenUrl = 'https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token';
    const clientId = '824014bd-9d09-45ef-a2b8-57aaa9783443';
    const clientSecret = '63b021e9da55486a9ad20f7e3bd1c09e';

    try {
        console.log('Requesting token...');
        const response = await axios.post(tokenUrl, qs.stringify({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'openid'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log('Token Success:', response.status);
        const token = response.data.access_token;
        console.log('Token:', token.substring(0, 50) + '...');

        // Now Try Routing with Token
        console.log('\nTesting Routing with Token...');
        const routeResponse = await axios.post(`https://api.olamaps.io/routing/v1/directions?origin=18.5204,73.8567&destination=19.0760,72.8777`, {}, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json' // Routing API usually expects empty body for GET-like POST? Or query params?
                // Wait, if using Token, do we still pass API Key? Usually not.
                // Does it support POST with body or GET?
            },
            params: {
                origin: '18.5204,73.8567',
                destination: '19.0760,72.8777',
                mode: 'driving'
            }
        });

        console.log('Routing Success:', routeResponse.status);
        console.log(JSON.stringify(routeResponse.data).substring(0, 200));

    } catch (error) {
        console.log('Error:', error.message);
        if (error.response) {
            console.log('Response Status:', error.response.status);
            console.log('Response Data:', JSON.stringify(error.response.data));
        }
    }
}

testToken();
