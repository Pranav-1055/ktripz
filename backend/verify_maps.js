require('dotenv').config();
const mapsService = require('./src/utils/maps');

async function testRouting() {
    console.log('Testing MapsService.getRoute...');
    try {
        const origin = { lat: 18.5204, lng: 73.8567 }; // Pune
        const destination = { lat: 19.0760, lng: 72.8777 }; // Mumbai

        const route = await mapsService.getRoute(origin, destination);

        if (route && route.status === 'OK') {
            console.log('SUCCESS: Route found!');
            console.log(`Distance: ${route.routes[0].distance.text}`);
            console.log(`Duration: ${route.routes[0].duration.text}`);
        } else {
            console.error('FAILED: No route found or status not OK');
            console.error(JSON.stringify(route, null, 2));
        }
    } catch (error) {
        console.error('CRITICAL ERROR:', error);
    }
}

testRouting();
