const express = require('express');
const router = express.Router();
const externalVehicleService = require('../services/externalVehicleService');
const authMiddleware = require('../middleware/auth');

// Cache simple responses in memory for a minute to avoid hitting API limit
const cache = {};

// GET /api/external-vehicles/makes
router.get('/makes', authMiddleware.authenticateToken, async (req, res) => {
    try {
        const makes = await externalVehicleService.getMakes();
        res.json({ success: true, data: makes });
    } catch (error) {
        console.error('Error fetching makes:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch vehicle makes' });
    }
});

// GET /api/external-vehicles/models/:makeId
router.get('/models/:makeId', authMiddleware.authenticateToken, async (req, res) => {
    try {
        const { makeId } = req.params;
        const year = req.query.year || new Date().getFullYear();

        const models = await externalVehicleService.getModels(makeId, year);
        res.json({ success: true, data: models });
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch vehicle models' });
    }
});

// GET /api/external-vehicles/list/:type
// Provides a flat list for types like '2wheeler' where we might allow simple selection
router.get('/list/:type', authMiddleware.authenticateToken, async (req, res) => {
    try {
        const { type } = req.params;
        const vehicles = await externalVehicleService.getVehiclesByType(type);

        if (vehicles) {
            res.json({ success: true, data: vehicles });
        } else {
            // If null, it means frontend should use makes/models flow
            res.json({ success: true, data: null, useApiFlow: true });
        }
    } catch (error) {
        console.error('Error fetching list:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch vehicle list' });
    }
});

module.exports = router;
