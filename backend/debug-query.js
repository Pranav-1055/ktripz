require('dotenv').config();
const { getFirestore, initializeFirebase } = require('./src/config/firebase');
const UserService = require('./src/services/userService');
const logger = require('./src/utils/logger');

async function runDebug() {
    await initializeFirebase();
    try {
        console.log('Running debug query...');

        // Simulate the searchRides query from cacheWarmupService
        const filters = {
            status: 'published',
            sortBy: 'publishedAt',
            sortOrder: 'desc',
            limit: 50
        };

        console.log('Testing searchRides with:', filters);
        const SearchService = require('./src/services/searchService');
        const results = await SearchService.searchRides(filters);
        console.log('Query success! Found rides:', results.length);

    } catch (error) {
        console.error('---------------------------------------------------');
        console.error('CAUGHT ERROR:', error.message);
        console.error('FULL ERROR:', JSON.stringify(error, null, 2));
        console.error('---------------------------------------------------');
        if (error.code === 9 || error.message.includes('FAILED_PRECONDITION')) {
            console.log('THIS IS THE MISSING INDEX ERROR.');
        }
    }
}

runDebug();
