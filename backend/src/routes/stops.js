const express = require('express');
const router = express.Router();
const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

// GET /api/stops - Get all admin-defined stops (Public)
router.get('/', async (req, res) => {
    try {
        const db = getFirestore();
        if (!db) {
            throw new Error("Firestore not initialized");
        }

        const snapshot = await db.collection('stops').orderBy('created_at', 'asc').get();
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
                lat: data.lat,
                lng: data.lng
            });
        });

        res.status(200).json({
            success: true,
            data: stops
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
