const axios = require('axios');

async function testRouting() {
    const apiKey = 'FAiv9fHfmCyfGpJVjjmVXlPYhOMzO9VfK3CcTubL';
    const url = 'https://api.olamaps.io/routing/v1/directions';

    // Short route: Pune Station to Shivajinagar
    // Pune Station: 18.5284, 73.8739
    // Shivajinagar: 18.5314, 73.8446

    // Test 1: POST with standard params (Short Route)
    try {
        console.log('Test 1: POST Short Route (standard)...');
        const response = await axios.post(`${url}?api_key=${apiKey}`, {
            origin: [18.5284, 73.8739],
            destination: [18.5314, 73.8446]
        });
        console.log('Test 1 Success:', response.data.status);
    } catch (e) { console.log('Test 1 Failed:', e.response?.data || e.message); }

    // Test 2: POST with [lng, lat] (Short Route)
    try {
        console.log('\nTest 2: POST Short Route [lng, lat]...');
        const response = await axios.post(`${url}?api_key=${apiKey}`, {
            origin: [73.8739, 18.5284],
            destination: [73.8446, 18.5314]
        });
        console.log('Test 2 Success:', response.data.status);
    } catch (e) { console.log('Test 2 Failed:', e.response?.data || e.message); }

    // Test 3: POST OSRM style (coordinates)
    try {
        console.log('\nTest 3: POST OSRM style...');
        const response = await axios.post(`${url}?api_key=${apiKey}`, {
            coordinates: [[73.8739, 18.5284], [73.8446, 18.5314]]
        });
        console.log('Test 3 Success:', response.data.status);
    } catch (e) { console.log('Test 3 Failed:', e.response?.data || e.message); }

    // Test 4: GET with query params (Short Route)
    try {
        console.log('\nTest 4: GET Short Route...');
        const response = await axios.get(url, {
            params: {
                origin: '18.5284,73.8739',
                destination: '18.5314,73.8446',
                api_key: apiKey
            }
        });
        console.log('Test 4 Success:', response.data.status);
    } catch (e) { console.log('Test 4 Failed:', e.response?.data || e.message); }
    // Test 5: GET Bangalore Route
    try {
        console.log('\nTest 5: GET Bangalore Route...');
        const response = await axios.get(url, {
            params: {
                origin: '12.9716,77.5946',
                destination: '12.2958,76.6394',
                api_key: apiKey
            }
        });
        console.log('Test 5 Success:', response.data.status);
    } catch (e) { console.log('Test 5 Failed:', e.response?.data || e.message); }
    // Test 6: OSRM Style URL (driving/lng,lat;lng,lat)
    try {
        console.log('\nTest 6: OSRM Style URL...');
        // Pune (73.8567, 18.5204) to Mumbai (72.8777, 19.0760)
        const osrmUrl = `https://api.olamaps.io/routing/v1/directions/driving/73.8567,18.5204;72.8777,19.0760`;
        const response = await axios.get(osrmUrl, {
            params: {
                api_key: apiKey,
                overview: 'full',
                steps: true,
                alternatives: true
            }
        });
        console.log('Test 6 Success:', response.data.status || response.data.code);
        console.log(JSON.stringify(response.data).substring(0, 200));
    } catch (e) {
        console.log('Test 6 Failed status:', e.response?.status);
        console.log('Test 6 Failed data:', e.response?.data || e.message);
    }
}

testRouting();
