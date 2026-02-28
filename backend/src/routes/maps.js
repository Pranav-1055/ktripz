const express = require('express');
const { query, validationResult } = require('express-validator');
const mapsService = require('../utils/maps');
const router = express.Router();

// GET /api/maps/geocode - Geocode an address
router.get('/geocode', [
    query('address').notEmpty().trim().withMessage('Address is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { address } = req.query;
        const result = await mapsService.geocodeAddress(address);

        if (result) {
            res.json({
                success: true,
                data: result
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Address not found'
            });
        }

    } catch (error) {
        console.error('Error geocoding address:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/maps/route - Calculate route between two points
router.get('/route', [
    query('origin').notEmpty().withMessage('Origin is required'),
    query('destination').notEmpty().withMessage('Destination is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { origin, destination, waypoints } = req.query;

        // Parse coordinates
        const [originLat, originLng] = origin.split(',').map(Number);
        const [destLat, destLng] = destination.split(',').map(Number);

        if (isNaN(originLat) || isNaN(originLng) || isNaN(destLat) || isNaN(destLng)) {
            return res.status(400).json({
                error: 'Invalid coordinates format. Use: lat,lng'
            });
        }

        const originCoords = { lat: originLat, lng: originLng };
        const destCoords = { lat: destLat, lng: destLng };

        // Parse waypoints if provided
        let waypointCoords = [];
        if (waypoints) {
            try {
                waypointCoords = waypoints.split('|').map(wp => {
                    const [lat, lng] = wp.split(',').map(Number);
                    return { lat, lng };
                });
            } catch (error) {
                return res.status(400).json({
                    error: 'Invalid waypoints format. Use: lat1,lng1|lat2,lng2'
                });
            }
        }

        const route = await mapsService.getRoute(originCoords, destCoords, waypointCoords);

        if (route) {
            res.json({
                success: true,
                data: route
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Route not found'
            });
        }

    } catch (error) {
        console.error('Error calculating route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/maps/places/autocomplete - Get place autocomplete suggestions
router.get('/places/autocomplete', [
    query('input').notEmpty().trim().withMessage('Input is required'),
    query('location').optional().matches(/^-?\d+\.?\d*,-?\d+\.?\d*$/).withMessage('Invalid location format'),
    query('radius').optional().isInt({ min: 1, max: 50000 }).withMessage('Radius must be between 1 and 50000 meters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { input, location, radius } = req.query;

        let locationCoords = null;
        if (location) {
            const [lat, lng] = location.split(',').map(Number);
            locationCoords = { lat, lng };
        }

        const suggestions = await mapsService.getPlaceAutocomplete(
            input, 
            locationCoords, 
            radius ? parseInt(radius) : undefined
        );

        res.json({
            success: true,
            data: suggestions
        });

    } catch (error) {
        console.error('Error fetching autocomplete suggestions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/maps/places/:placeId - Get place details
router.get('/places/:placeId', async (req, res) => {
    try {
        const { placeId } = req.params;

        const placeDetails = await mapsService.getPlaceDetails(placeId);

        if (placeDetails) {
            res.json({
                success: true,
                data: placeDetails
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Place not found'
            });
        }

    } catch (error) {
        console.error('Error fetching place details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/maps/places/nearby - Get nearby places
router.get('/places/nearby', [
    query('location').notEmpty().matches(/^-?\d+\.?\d*,-?\d+\.?\d*$/).withMessage('Valid location is required'),
    query('radius').optional().isInt({ min: 1, max: 50000 }).withMessage('Radius must be between 1 and 50000 meters'),
    query('type').optional().isString().withMessage('Type must be a string')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { location, radius, type } = req.query;

        const [lat, lng] = location.split(',').map(Number);
        const locationCoords = { lat, lng };

        const places = await mapsService.getNearbyPlaces(
            locationCoords,
            radius ? parseInt(radius) : undefined,
            type
        );

        res.json({
            success: true,
            data: places
        });

    } catch (error) {
        console.error('Error fetching nearby places:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/maps/distance - Calculate distance between two points
router.get('/distance', [
    query('origin').notEmpty().matches(/^-?\d+\.?\d*,-?\d+\.?\d*$/).withMessage('Valid origin coordinates required'),
    query('destination').notEmpty().matches(/^-?\d+\.?\d*,-?\d+\.?\d*$/).withMessage('Valid destination coordinates required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { origin, destination } = req.query;

        const [originLat, originLng] = origin.split(',').map(Number);
        const [destLat, destLng] = destination.split(',').map(Number);

        const originCoords = { lat: originLat, lng: originLng };
        const destCoords = { lat: destLat, lng: destLng };

        const distance = mapsService.calculateDistance(originCoords, destCoords);

        res.json({
            success: true,
            data: {
                distance: {
                    kilometers: Math.round(distance * 100) / 100,
                    miles: Math.round(distance * 0.621371 * 100) / 100
                },
                origin: originCoords,
                destination: destCoords
            }
        });

    } catch (error) {
        console.error('Error calculating distance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/maps/batch-geocode - Batch geocode multiple addresses
router.post('/batch-geocode', async (req, res) => {
    try {
        const { addresses } = req.body;

        if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Addresses array is required'
            });
        }

        if (addresses.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 50 addresses allowed per batch'
            });
        }

        const results = await mapsService.batchGeocode(addresses);

        res.json({
            success: true,
            data: {
                results,
                processed: addresses.length,
                successful: results.filter(r => r !== null).length
            }
        });

    } catch (error) {
        console.error('Error in batch geocoding:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/maps/reverse-geocode - Reverse geocode coordinates to address
router.get('/reverse-geocode', [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { lat, lng } = req.query;
        const coordinates = { lat: parseFloat(lat), lng: parseFloat(lng) };

        const result = await mapsService.reverseGeocode(coordinates);

        if (result) {
            res.json({
                success: true,
                data: result
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Address not found for coordinates'
            });
        }

    } catch (error) {
        console.error('Error in reverse geocoding:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/maps/optimal-pickup - Find optimal pickup points
router.get('/optimal-pickup', [
    query('originLat').isFloat({ min: -90, max: 90 }).withMessage('Valid origin latitude required'),
    query('originLng').isFloat({ min: -180, max: 180 }).withMessage('Valid origin longitude required'),
    query('destLat').isFloat({ min: -90, max: 90 }).withMessage('Valid destination latitude required'),
    query('destLng').isFloat({ min: -180, max: 180 }).withMessage('Valid destination longitude required'),
    query('userLat').isFloat({ min: -90, max: 90 }).withMessage('Valid user latitude required'),
    query('userLng').isFloat({ min: -180, max: 180 }).withMessage('Valid user longitude required'),
    query('maxWalkingDistance').optional().isInt({ min: 100, max: 5000 }).withMessage('Max walking distance must be between 100-5000 meters'),
    query('maxResults').optional().isInt({ min: 1, max: 20 }).withMessage('Max results must be between 1-20')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const origin = { lat: parseFloat(req.query.originLat), lng: parseFloat(req.query.originLng) };
        const destination = { lat: parseFloat(req.query.destLat), lng: parseFloat(req.query.destLng) };
        const userLocation = { lat: parseFloat(req.query.userLat), lng: parseFloat(req.query.userLng) };

        const options = {
            maxWalkingDistance: req.query.maxWalkingDistance ? parseInt(req.query.maxWalkingDistance) : 1000,
            maxResults: req.query.maxResults ? parseInt(req.query.maxResults) : 10,
            searchRadius: 500
        };

        const pickupPoints = await mapsService.findOptimalPickupPoints(
            origin, 
            destination, 
            userLocation, 
            options
        );

        res.json({
            success: true,
            data: {
                pickupPoints,
                searchCriteria: {
                    route: { origin, destination },
                    userLocation,
                    options
                },
                totalFound: pickupPoints.length
            }
        });

    } catch (error) {
        console.error('Error finding optimal pickup points:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/maps/distance-matrix - Calculate distance matrix
router.post('/distance-matrix', async (req, res) => {
    try {
        const { origins, destinations, options = {} } = req.body;

        if (!origins || !destinations || !Array.isArray(origins) || !Array.isArray(destinations)) {
            return res.status(400).json({
                success: false,
                error: 'Origins and destinations arrays are required'
            });
        }

        if (origins.length > 25 || destinations.length > 25) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 25 origins and 25 destinations allowed'
            });
        }

        // Validate coordinate format
        const validateCoords = (coords) => {
            return coords.every(coord => 
                coord.lat !== undefined && coord.lng !== undefined &&
                coord.lat >= -90 && coord.lat <= 90 &&
                coord.lng >= -180 && coord.lng <= 180
            );
        };

        if (!validateCoords(origins) || !validateCoords(destinations)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid coordinate format. Use {lat, lng} objects'
            });
        }

        const matrix = await mapsService.getDistanceMatrix(origins, destinations, options);

        if (matrix) {
            res.json({
                success: true,
                data: matrix
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to calculate distance matrix'
            });
        }

    } catch (error) {
        console.error('Error calculating distance matrix:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/maps/walking-time - Get walking time between two points
router.get('/walking-time', [
    query('originLat').isFloat({ min: -90, max: 90 }).withMessage('Valid origin latitude required'),
    query('originLng').isFloat({ min: -180, max: 180 }).withMessage('Valid origin longitude required'),
    query('destLat').isFloat({ min: -90, max: 90 }).withMessage('Valid destination latitude required'),
    query('destLng').isFloat({ min: -180, max: 180 }).withMessage('Valid destination longitude required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const origin = { lat: parseFloat(req.query.originLat), lng: parseFloat(req.query.originLng) };
        const destination = { lat: parseFloat(req.query.destLat), lng: parseFloat(req.query.destLng) };

        const walkingInfo = await mapsService.getWalkingTime(origin, destination);

        if (walkingInfo) {
            res.json({
                success: true,
                data: walkingInfo
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Walking route not found'
            });
        }

    } catch (error) {
        console.error('Error getting walking time:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;