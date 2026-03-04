const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initializeFirebase, getAuth, getFirestore } = require('../src/config/firebase');

async function clearAllData() {
    try {
        console.log('Initializing Firebase...');
        await initializeFirebase();

        // 1. Clear Firestore
        console.log('Clearing Firestore...');
        const db = getFirestore();
        const collections = await db.listCollections();

        for (const collection of collections) {
            console.log(`Deleting collection: ${collection.id}`);
            await deleteCollection(db, collection.id, 100);
        }
        console.log('Firestore cleared.');

        // 2. Clear Auth (Users)
        console.log('Clearing Auth Users...');
        const auth = getAuth();
        await deleteAllUsers(auth);
        console.log('Auth Users cleared.');

        console.log('All data cleared successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error clearing data:', error);
        process.exit(1);
    }
}

async function deleteCollection(db, collectionPath, batchSize) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(db, query, resolve) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        // When there are no documents left, we are done
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    // Recurse on the next process tick, to avoid
    // exploding the stack.
    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve);
    });
}

async function deleteAllUsers(auth, nextPageToken) {
    const listUsersResult = await auth.listUsers(1000, nextPageToken);

    if (listUsersResult.users.length === 0) {
        return;
    }

    const uids = listUsersResult.users.map((userRecord) => userRecord.uid);
    console.log(`Deleting ${uids.length} users...`);

    await auth.deleteUsers(uids);

    if (listUsersResult.pageToken) {
        await deleteAllUsers(auth, listUsersResult.pageToken);
    }
}

clearAllData();
