const express = require('express');
const { body, validationResult } = require('express-validator');
const vehicleService = require('../services/vehicleService');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// GET /api/vehicles - Get user's vehicles
router.get('/', authMiddleware.authenticateToken, authMiddleware.requireProvider, async (req, res) => {
    try {
        const vehicles = await vehicleService.getVehiclesByOwner(req.user.uid);
        
        res.json({
            success: true,
            data: vehicles
        });
    } catch (error) {
        console.error('Error fetching vehicles:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// POST /api/vehicles - Add new vehicle
router.post('/', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    body('details.make').notEmpty().trim().withMessage('Vehicle make is required'),
    body('details.model').notEmpty().trim().withMessage('Vehicle model is required'),
    body('details.year').isInt({ min: 1990, max: new Date().getFullYear() + 1 }).withMessage('Valid year is required'),
    body('details.color').notEmpty().trim().withMessage('Vehicle color is required'),
    body('details.licensePlate').notEmpty().trim().withMessage('License plate is required'),
    body('details.seats').isInt({ min: 1, max: 50 }).withMessage('Number of seats must be between 1 and 50'),
    body('amenities').optional().isArray().withMessage('Amenities must be an array'),
    body('details.fuelType').optional().isIn(['petrol', 'diesel', 'electric', 'hybrid']).withMessage('Invalid fuel type'),
    body('details.transmission').optional().isIn(['manual', 'automatic']).withMessage('Invalid transmission type')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const vehicle = await vehicleService.createVehicle(req.user.uid, req.body);

        res.status(201).json({
            success: true,
            data: vehicle,
            message: 'Vehicle registered successfully'
        });
    } catch (error) {
        console.error('Error creating vehicle:', error);
        
        if (error.message.includes('license plate already exists')) {
            return res.status(400).json({ 
                success: false,
                error: error.message 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/vehicles/:id - Get specific vehicle
router.get('/:id', authMiddleware.authenticateToken, authMiddleware.requireProvider, async (req, res) => {
    try {
        const vehicle = await vehicleService.getVehicleById(req.params.id, req.user.uid);
        
        res.json({
            success: true,
            data: vehicle
        });
    } catch (error) {
        console.error('Error fetching vehicle:', error);
        
        if (error.message === 'Vehicle not found') {
            return res.status(404).json({ 
                success: false,
                error: error.message 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// PUT /api/vehicles/:id - Update vehicle
router.put('/:id', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    body('details.make').optional().notEmpty().trim(),
    body('details.model').optional().notEmpty().trim(),
    body('details.year').optional().isInt({ min: 1990, max: new Date().getFullYear() + 1 }),
    body('details.color').optional().notEmpty().trim(),
    body('details.licensePlate').optional().notEmpty().trim(),
    body('details.seats').optional().isInt({ min: 1, max: 50 }),
    body('amenities').optional().isArray(),
    body('details.fuelType').optional().isIn(['petrol', 'diesel', 'electric', 'hybrid']),
    body('details.transmission').optional().isIn(['manual', 'automatic'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const vehicle = await vehicleService.updateVehicle(req.params.id, req.user.uid, req.body);

        res.json({
            success: true,
            data: vehicle,
            message: 'Vehicle updated successfully'
        });
    } catch (error) {
        console.error('Error updating vehicle:', error);
        
        if (error.message === 'Vehicle not found') {
            return res.status(404).json({ 
                success: false,
                error: error.message 
            });
        }
        
        if (error.message.includes('license plate already exists')) {
            return res.status(400).json({ 
                success: false,
                error: error.message 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// DELETE /api/vehicles/:id - Delete vehicle
router.delete('/:id', authMiddleware.authenticateToken, authMiddleware.requireProvider, async (req, res) => {
    try {
        const result = await vehicleService.deleteVehicle(req.params.id, req.user.uid);
        
        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        
        if (error.message === 'Vehicle not found') {
            return res.status(404).json({ 
                success: false,
                error: error.message 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// POST /api/vehicles/:id/documents - Upload vehicle documents
router.post('/:id/documents', authMiddleware.authenticateToken, authMiddleware.requireProvider, 
    vehicleService.upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No file uploaded' 
            });
        }

        const { documentType } = req.body;
        if (!documentType) {
            return res.status(400).json({ 
                success: false,
                error: 'Document type is required' 
            });
        }

        const result = await vehicleService.uploadDocument(
            req.params.id, 
            req.user.uid, 
            documentType, 
            req.file
        );

        res.json({
            success: true,
            data: result,
            message: 'Document uploaded successfully'
        });
    } catch (error) {
        console.error('Error uploading document:', error);
        
        if (error.message === 'Vehicle not found') {
            return res.status(404).json({ 
                success: false,
                error: error.message 
            });
        }
        
        if (error.message === 'Invalid document type') {
            return res.status(400).json({ 
                success: false,
                error: error.message 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// POST /api/vehicles/:id/photos - Upload vehicle photos
router.post('/:id/photos', authMiddleware.authenticateToken, authMiddleware.requireProvider,
    vehicleService.upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No photo uploaded' 
            });
        }

        const { photoType } = req.body;
        if (!photoType) {
            return res.status(400).json({ 
                success: false,
                error: 'Photo type is required' 
            });
        }

        const result = await vehicleService.uploadVehiclePhoto(
            req.params.id, 
            req.user.uid, 
            photoType, 
            req.file
        );

        res.json({
            success: true,
            data: result,
            message: 'Photo uploaded successfully'
        });
    } catch (error) {
        console.error('Error uploading photo:', error);
        
        if (error.message === 'Vehicle not found') {
            return res.status(404).json({ 
                success: false,
                error: error.message 
            });
        }
        
        if (error.message === 'Invalid photo type') {
            return res.status(400).json({ 
                success: false,
                error: error.message 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// POST /api/vehicles/:id/submit-verification - Submit vehicle for verification
router.post('/:id/submit-verification', authMiddleware.authenticateToken, authMiddleware.requireProvider, async (req, res) => {
    try {
        const result = await vehicleService.submitForVerification(req.params.id, req.user.uid);
        
        res.json({
            success: true,
            data: result,
            message: result.message
        });
    } catch (error) {
        console.error('Error submitting for verification:', error);
        
        if (error.message === 'Vehicle not found') {
            return res.status(404).json({ 
                success: false,
                error: error.message 
            });
        }
        
        if (error.message.includes('Missing required documents')) {
            return res.status(400).json({ 
                success: false,
                error: error.message 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/vehicles/stats/overview - Get vehicle statistics
router.get('/stats/overview', authMiddleware.authenticateToken, authMiddleware.requireProvider, async (req, res) => {
    try {
        const stats = await vehicleService.getVehicleStats(req.user.uid);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching vehicle stats:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/vehicles/expiring-documents - Get expiring documents
router.get('/expiring-documents', authMiddleware.authenticateToken, authMiddleware.requireProvider, async (req, res) => {
    try {
        const daysAhead = parseInt(req.query.days) || 30;
        const expiringDocs = await vehicleService.getExpiringDocuments(req.user.uid, daysAhead);
        
        res.json({
            success: true,
            data: expiringDocs
        });
    } catch (error) {
        console.error('Error fetching expiring documents:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// Admin routes for verification workflow
// POST /api/vehicles/:id/verify - Admin endpoint to verify vehicle
router.post('/:id/verify', authMiddleware.authenticateToken, authMiddleware.requireAdmin, [
    body('status').isIn(['verified', 'rejected']).withMessage('Status must be verified or rejected'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
    body('documentVerifications').optional().isObject().withMessage('Document verifications must be an object')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const vehicle = await vehicleService.verifyVehicle(req.params.id, req.user.uid, req.body);
        
        res.json({
            success: true,
            data: vehicle,
            message: `Vehicle ${req.body.status} successfully`
        });
    } catch (error) {
        console.error('Error verifying vehicle:', error);
        
        if (error.message === 'Vehicle not found') {
            return res.status(404).json({ 
                success: false,
                error: error.message 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/vehicles/admin/pending-verifications - Admin endpoint to get pending verifications
router.get('/admin/pending-verifications', authMiddleware.authenticateToken, authMiddleware.requireAdmin, async (req, res) => {
    try {
        const pendingVehicles = await vehicleService.getPendingVerifications();
        
        res.json({
            success: true,
            data: pendingVehicles
        });
    } catch (error) {
        console.error('Error fetching pending verifications:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

module.exports = router;