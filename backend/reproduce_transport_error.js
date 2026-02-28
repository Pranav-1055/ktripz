require('dotenv').config();
const firebase = require('./src/config/firebase');

// Mock getUserByUid to bypass actual Firebase call
firebase.getUserByUid = async (uid) => {
    console.log('Mock getUserByUid called for:', uid);
    return {
        uid: uid,
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        phoneNumber: null,
        photoURL: null
    };
};

const { initializeFirebase } = firebase;
const TransportProviderService = require('./src/services/transportProviderService');

async function run() {
    try {
        console.log('Initializing Firebase...');
        await initializeFirebase();

        // Mock a firebase UID (use 'mock-user-id' which is returned by mock auth verify)
        // Or we can mock what verifyIdToken returns.
        // The route calls:
        // const decodedToken = await verifyIdToken(token);
        // const provider = await TransportProviderService.createProvider(decodedToken.uid, additionalData);

        const mockUid = 'test-transport-uid-' + Date.now();

        console.log('Attempting to create provider for UID:', mockUid);
        const provider = await TransportProviderService.createProvider(mockUid, {
            businessInfo: { businessName: 'Test Business' },
            fleetInfo: { vehicleTypes: ['car'] }
        });

        console.log('Provider created successfully:', provider.toJSON());

    } catch (error) {
        console.error('Reproduction failed with error:', error);
        // Print full stack
        console.error(error.stack);
    }
}

run();
