const express = require('express');
const router = express.Router();
const { getFirestore } = require('../config/firebase');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Search predefined routes by source and destination
 * GET /api/routes/search?source=Mumbai&destination=Pune
 */
router.get('/search', authMiddleware.authenticateToken, async (req, res) => {
    try {
    const { source, destination, sourceId, destinationId } = req.query;

        if ((!source || !destination) && (!sourceId || !destinationId)) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_PARAMETERS',
                    message: 'Source/Destination names or IDs are required'
                }
            });
        }

        if (sourceId && destinationId && sourceId.toString().trim() === destinationId.toString().trim()) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'SAME_SOURCE_DESTINATION',
                    message: 'Source and destination cannot be the same'
                }
            });
        }

        if (source && destination && source.toLowerCase().trim() === destination.toLowerCase().trim()) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'SAME_SOURCE_DESTINATION',
                    message: 'Source and destination cannot be the same'
                }
            });
        }

        const db = getFirestore();
        const routesSnapshot = await db.collection('routes').get();

        const matchingRoutes = [];
        const searchSourceId = sourceId ? sourceId.toString().trim() : null;
        const searchDestinationId = destinationId ? destinationId.toString().trim() : null;
        const searchSourceName = source ? source.toLowerCase().trim() : null;
        const searchDestinationName = destination ? destination.toLowerCase().trim() : null;

        const isRouteActive = (routeData) => {
            // Backward compatibility with older documents:
            // active: true/false, active: "true"/"false", isActive: boolean, status: "active"/"inactive"
            if (typeof routeData?.active === 'boolean') return routeData.active;
            if (typeof routeData?.active === 'string') return routeData.active.toLowerCase() === 'true';
            if (typeof routeData?.isActive === 'boolean') return routeData.isActive;
            if (typeof routeData?.status === 'string') return routeData.status.toLowerCase() === 'active';
            // Default to active for legacy docs where active flag is missing.
            return true;
        };

        const normalizeId = (value) => {
            if (value === undefined || value === null) return null;
            return value.toString().trim();
        };

        const normalizeName = (value) => {
            if (!value) return null;
            return value.toString().toLowerCase().trim();
        };
        
        routesSnapshot.forEach(doc => {
            const routeData = doc.data();
            if (!isRouteActive(routeData)) return;

            const routeSourceId = normalizeId(routeData.source?.stopId || routeData.source?.id || routeData.sourceId);
            const routeDestinationId = normalizeId(routeData.destination?.stopId || routeData.destination?.id || routeData.destinationId);
            const routeSource = normalizeName(routeData.source?.name || routeData.sourceName);
            const routeDestination = normalizeName(routeData.destination?.name || routeData.destinationName);

            const matchesById = searchSourceId && searchDestinationId
                && routeSourceId === searchSourceId
                && routeDestinationId === searchDestinationId;

            const matchesByName = searchSourceName && searchDestinationName
                && routeSource === searchSourceName
                && routeDestination === searchDestinationName;

            if (matchesById || matchesByName) {
                matchingRoutes.push({
                    id: doc.id,
                    ...routeData
                });
            }
        });

        logger.info(`Route search: ${sourceId || source} -> ${destinationId || destination}, found ${matchingRoutes.length} routes`);

        res.status(200).json({
            success: true,
            data: matchingRoutes,
            message: matchingRoutes.length > 0 
                ? `Found ${matchingRoutes.length} matching route(s)`
                : 'No routes found for the specified source and destination'
        });

    } catch (error) {
        logger.error('Route search error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'SEARCH_ERROR',
                message: 'Failed to search routes'
            }
        });
    }
});

/**
 * Get all active predefined routes
 * GET /api/routes
 */
router.get('/', authMiddleware.authenticateToken, async (req, res) => {
    try {
        const db = getFirestore();
        const snapshot = await db.collection('routes')
            .orderBy('createdAt', 'desc')
            .get();

        const routes = [];
        const isRouteActive = (routeData) => {
            if (typeof routeData?.active === 'boolean') return routeData.active;
            if (typeof routeData?.active === 'string') return routeData.active.toLowerCase() === 'true';
            if (typeof routeData?.isActive === 'boolean') return routeData.isActive;
            if (typeof routeData?.status === 'string') return routeData.status.toLowerCase() === 'active';
            return true;
        };

        snapshot.forEach(doc => {
            const data = doc.data();
            if (!isRouteActive(data)) return;
            routes.push({
                id: doc.id,
                ...data
            });
        });

        res.status(200).json({
            success: true,
            data: routes
        });

    } catch (error) {
        logger.error('Get routes error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'FETCH_ERROR',
                message: 'Failed to fetch routes'
            }
        });
    }
});

/**
 * Get route by ID
 * GET /api/routes/:id
 */
router.get('/:id', authMiddleware.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const db = getFirestore();
        
        const routeDoc = await db.collection('routes').doc(id).get();
        
        if (!routeDoc.exists) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'ROUTE_NOT_FOUND',
                    message: 'Route not found'
                }
            });
        }

        const routeData = routeDoc.data();

        const isRouteActive =
            (typeof routeData?.active === 'boolean' && routeData.active) ||
            (typeof routeData?.active === 'string' && routeData.active.toLowerCase() === 'true') ||
            (typeof routeData?.isActive === 'boolean' && routeData.isActive) ||
            (typeof routeData?.status === 'string' && routeData.status.toLowerCase() === 'active') ||
            (routeData?.active === undefined && routeData?.isActive === undefined && routeData?.status === undefined);

        if (!isRouteActive) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'ROUTE_INACTIVE',
                    message: 'Route is not active'
                }
            });
        }

        res.status(200).json({
            success: true,
            data: {
                id: routeDoc.id,
                ...routeData
            }
        });

    } catch (error) {
        logger.error('Get route by ID error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'FETCH_ERROR',
                message: 'Failed to fetch route'
            }
        });
    }
});

module.exports = router;
