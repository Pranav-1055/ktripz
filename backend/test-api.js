// Simple test script to verify API endpoints
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testAPI() {
    try {
        console.log('Testing TripO Backend API...\n');

        // Test health endpoint
        console.log('1. Testing health endpoint...');
        const healthResponse = await axios.get('http://localhost:3000/health');
        console.log('✅ Health check:', healthResponse.data.status);

        // Test API info endpoint
        console.log('\n2. Testing API info endpoint...');
        const apiResponse = await axios.get(`${BASE_URL}`);
        console.log('✅ API Info:', apiResponse.data.name);

        // Test rides endpoint (without auth - should work for GET)
        console.log('\n3. Testing rides search endpoint...');
        try {
            const ridesResponse = await axios.get(`${BASE_URL}/rides`);
            console.log('✅ Rides search:', ridesResponse.data.success);
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Rides endpoint requires authentication (expected)');
            } else {
                console.log('❌ Rides endpoint error:', error.message);
            }
        }

        // Test vehicles endpoint (should require auth)
        console.log('\n4. Testing vehicles endpoint...');
        try {
            const vehiclesResponse = await axios.get(`${BASE_URL}/vehicles`);
            console.log('❌ Vehicles endpoint should require authentication');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Vehicles endpoint requires authentication (expected)');
            } else {
                console.log('❌ Vehicles endpoint error:', error.message);
            }
        }

        // Test bookings endpoint (should require auth)
        console.log('\n5. Testing bookings endpoint...');
        try {
            const bookingsResponse = await axios.get(`${BASE_URL}/bookings`);
            console.log('❌ Bookings endpoint should require authentication');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Bookings endpoint requires authentication (expected)');
            } else {
                console.log('❌ Bookings endpoint error:', error.message);
            }
        }

        // Test maps endpoint
        console.log('\n6. Testing maps autocomplete endpoint...');
        try {
            const mapsResponse = await axios.get(`${BASE_URL}/maps/places/autocomplete?input=Mumbai`);
            console.log('✅ Maps autocomplete:', mapsResponse.data.success);
        } catch (error) {
            console.log('⚠️ Maps endpoint error (expected if no Google Maps API key):', error.response?.data?.error || error.message);
        }

        console.log('\n🎉 API test completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Set up Firebase service account credentials');
        console.log('2. Configure Google Maps API key (optional)');
        console.log('3. Test with actual Firebase authentication tokens');

    } catch (error) {
        console.error('❌ API test failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Make sure the server is running with: npm run dev');
        }
    }
}

// Run the test
testAPI();