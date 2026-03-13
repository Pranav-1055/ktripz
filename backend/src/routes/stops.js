const express = require('express');
const router = express.Router();
const { initializeFirebase, getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

// GET /api/stops - Get all admin-defined stops (Public)
router.get('/', async (req, res) => {
    try {
        await initializeFirebase();
        const db = getFirestore();
        if (!db) {
            throw new Error("Firestore not initialized");
        }

        const snapshot = await db.collection('stops').get();
        if (snapshot.empty) {
            console.log("No stops found in Firestore.");
            return res.status(200).json({ success: true, data: [] });
        }

        const stops = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            stops.push({
                id: doc.id,
                name: data.name,
                lat: typeof data.lat === 'number' ? data.lat : parseFloat(data.lat),
                lng: typeof data.lng === 'number' ? data.lng : parseFloat(data.lng),
                created_at: data.created_at || null
            });
        });

        stops.sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return aTime - bTime;
        });

        res.status(200).json({
            success: true,
            data: stops.map(({ created_at, ...stop }) => stop)
        });

    } catch (error) {
        logger.error('Error fetching public stops:', error);
        console.error('Detailed Stops Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch stops',
            details: error.message
        });
    }
});

module.exports = router;
