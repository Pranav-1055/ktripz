require('dotenv').config();
const admin = require('firebase-admin');

const key = process.env.FIREBASE_PRIVATE_KEY;

console.log('--- Firebase Key Verification ---');
if (!key) {
    console.error('ERROR: FIREBASE_PRIVATE_KEY is missing from .env');
    process.exit(1);
}

console.log(`Key Length: ${key.length}`);
console.log(`Contains literal "\\n": ${key.includes('\\n')}`);
console.log(`Contains actual newline: ${key.includes('\n')}`);
console.log(`First 30 chars: ${key.substring(0, 30)}...`);
console.log(`Last 30 chars: ...${key.substring(key.length - 30)}`);

try {
    const formattedKey = key.replace(/\\n/g, '\n');
    console.log('--- Attempting to parse with admin.credential.cert ---');

    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedKey
    };

    const cert = admin.credential.cert(serviceAccount);
    console.log('SUCCESS: admin.credential.cert() accepted the key.');
    console.log(`Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
    console.log(`Client Email: ${process.env.FIREBASE_CLIENT_EMAIL}`);

    // Initialize app and test connection
    admin.initializeApp({
        credential: cert
    });

    const db = admin.firestore();
    console.log('Attempting to write to Firestore...');

    db.collection('test_connection').doc('verify-script').set({
        timestamp: new Date().toISOString(),
        test: 'auth_verification'
    }).then(() => {
        console.log('SUCCESS: Successfully wrote to Firestore! Credentials are working.');
        process.exit(0);
    }).catch((err) => {
        console.error('FAILURE: Firestore write failed:');
        console.error(err);
        process.exit(1);
    });

} catch (error) {
    console.error('FAILURE: Unexpected error:');
    console.error(error);
}
