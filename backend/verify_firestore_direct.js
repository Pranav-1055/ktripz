require('dotenv').config();
const admin = require('firebase-admin');

// Manually construct service account from env vars
const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
};

console.log('Project ID:', serviceAccount.project_id);
console.log('Client Email:', serviceAccount.client_email);
console.log('Private Key Exists:', !!serviceAccount.private_key);

if (!serviceAccount.private_key) {
    console.error('ERROR: Missing Private Key');
    process.exit(1);
}

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase initialized directly.');

    const db = admin.firestore();
    db.collection('stops').get().then(snapshot => {
        if (snapshot.empty) {
            console.log('No stops found.');
        } else {
            console.log(`Found ${snapshot.size} stops.`);
            snapshot.forEach(doc => console.log(doc.id));
        }
    }).catch(err => {
        console.error('Firestore Error:', err);
    });

} catch (error) {
    console.error('Init Error:', error);
}
