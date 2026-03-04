const dotenv = require('dotenv');
const path = require('path');

// Set this before requiring modules that use logger
process.env.DISABLE_FILE_LOGGING = 'true';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const mapsService = require('./src/utils/maps');

async function testMaps() {
    console.log('Testing MapsService with Ola Maps...');
    console.log('API Key:', process.env.OLA_MAPS_API_KEY ? 'Present' : 'Missing');

    try {
        // Test Geocoding
        console.log('\n--- Testing Geocoding ---');
        const address = 'Pune Airport';
        const geoResult = await mapsService.geocodeAddress(address);
        console.log('Geocoding Result:', JSON.stringify(geoResult, null, 2));

        if (geoResult && geoResult.coordinates) {
            // Test Reverse Geocoding
            console.log('\n--- Testing Reverse Geocoding ---');
            const reverseResult = await mapsService.reverseGeocode(geoResult.coordinates.lat, geoResult.coordinates.lng);
            console.log('Reverse Geocoding Result:', JSON.stringify(reverseResult, null, 2));

            // Test Nearby Places
            console.log('\n--- Testing Nearby Places ---');
            const nearby = await mapsService.getNearbyPlaces(geoResult.coordinates.lat, geoResult.coordinates.lng, 1000, 'airport');
            console.log('Nearby Places Result:', JSON.stringify(nearby ? nearby.slice(0, 2) : nearby, null, 2)); // Show first 2
        }

        // Test Routing
        console.log('\n--- Testing Routing ---');
        const origin = { lat: 18.5204, lng: 73.8567 }; // Pune
        const dest = { lat: 19.0760, lng: 72.8777 }; // Mumbai
        const routeResult = await mapsService.getRoute(origin, dest);
        console.log('Route Result Summary:', routeResult ? {
            distance: routeResult.routes[0].distance,
            duration: routeResult.routes[0].duration,
            stepsCount: routeResult.routes[0].steps.length
        } : routeResult);


        // Test Autocomplete
        console.log('\n--- Testing Autocomplete ---');
        const autoResult = await mapsService.getPlaceAutocomplete('Lohegaon');
        console.log('Autocomplete Result:', JSON.stringify(autoResult ? autoResult.slice(0, 2) : autoResult, null, 2));

    } catch (error) {
        console.error('Test Failed:', error);
    }
}

testMaps();
