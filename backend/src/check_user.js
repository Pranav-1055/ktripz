require('dotenv').config();
const { initializeFirebase, getFirestore } = require('./config/firebase');
const User = require('./models/User');

async function checkUser() {
    try {
        await initializeFirebase();
        const db = getFirestore();

        console.log('Searching for users...');
        const snapshot = await db.collection('users').get();

        let found = false;
        snapshot.forEach(doc => {
            const data = doc.data();
            // Use case-insensitive matching for name or known email if possible
            // Looking for "pranav" based on screenshot
            if (data.displayName?.toLowerCase().includes('pranav') ||
                data.profile?.name?.toLowerCase().includes('pranav')) {
                console.log('------------------------------------------------');
                console.log('Found User:', data.uid);
                console.log('Display Name:', data.displayName);
                console.log('Email:', data.email);
                console.log('Root photoURL:', data.photoURL);
                console.log('Profile Avatar:', data.profile?.avatar);
                console.log('Full Profile:', JSON.stringify(data.profile, null, 2));
                found = true;
            }
        });

        if (!found) {
            console.log('User "pranav" not found in database.');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

checkUser();
