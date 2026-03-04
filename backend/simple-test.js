const axios = require('axios');

async function testRouting() {
    const apiKey = 'FAiv9fHfmCyfGpJVjjmVXlPYhOMzO9VfK3CcTubL';
    const url = 'https://api.olamaps.io/routing/v1/directions';

    // Test Case 1: POST
    try {
        console.log('Testing POST...');
        const response = await axios.post(`${url}?api_key=${apiKey}`, {
            origin: [18.5204, 73.8567], // Pune [lat, lng]
            destination: [19.0760, 72.8777], // Mumbai [lat, lng]
            mode: 'driving',
            alternatives: false,
            steps: true,
            overview: 'full'
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('POST Success:', response.data ? 'OK' : 'No Data');
        console.log(JSON.stringify(response.data, null, 2).substring(0, 200));
    } catch (error) {
        console.log('POST Failed:', error.response ? error.response.data : error.message);
    }

    // Test Case 2: GET with lat,lng
    try {
        console.log('\nTesting GET (lat,lng)...');
        const response = await axios.get(url, {
            params: {
                origin: '18.5204,73.8567',
                destination: '19.0760,72.8777',
                mode: 'driving',
                api_key: apiKey
            }
        });
        console.log('GET (lat,lng) Success:', response.data ? 'OK' : 'No Data');
        console.log(JSON.stringify(response.data, null, 2).substring(0, 200));
    } catch (error) {
        console.log('GET (lat,lng) Failed:', error.response ? error.response.data : error.message);
    }

    // Test Case 3: GET with lng,lat
    try {
        console.log('\nTesting GET (lng,lat)...');
        const response = await axios.get(url, {
            params: {
                origin: '73.8567,18.5204',
                destination: '72.8777,19.0760',
                mode: 'driving',
                api_key: apiKey
            }
        });
        console.log('GET (lng,lat) Success:', response.data ? 'OK' : 'No Data');
        console.log(JSON.stringify(response.data, null, 2).substring(0, 200));
    } catch (error) {
        console.log('GET (lng,lat) Failed:', error.response ? error.response.data : error.message);
    }
}

testRouting();
