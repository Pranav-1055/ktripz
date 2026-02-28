require('dotenv').config();
const { initializeFirebase, getFirestore } = require('./src/config/firebase');

async function testFirestore() {
    console.log("Initializing Firebase...");
    try {
        const app = await initializeFirebase();
        console.log("Firebase App initialized:", app ? (app.name || 'Yes') : 'No');

        try {
            const db = getFirestore();
            console.log("Firestore instance obtained.");

            console.log("Fetching stops...");
            // Add timeout to fetch to prevent hanging
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore fetch timed out')), 5000));
            const fetchPromise = db.collection('stops').get();

            const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

            if (snapshot.empty) {
                console.log('No matching documents in "stops" collection.');
            } else {
                console.log(`Found ${snapshot.size} stops.`);
                snapshot.forEach(doc => {
                    console.log(doc.id, '=>', doc.data());
                });
            }
        } catch (dbError) {
            console.error("Error during Firestore usage:", dbError);
        }

    } catch (error) {
        console.error("Critical Firestore Initialization Error:", error);
    }
}

testFirestore();
