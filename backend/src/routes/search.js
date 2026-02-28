const express = require('express');
const { query, validationResult } = require('express-validator');
const { sendResponse, sendError } = require('../middleware');
const searchService = require('../services/searchService');
const rideService = require('../services/rideService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Validation middleware for advanced search
 */
const validateAdvancedSearch = [
  query('originCity').optional().isString().withMessage('Origin city must be a string'),
  query('destinationCity').optional().isString().withMessage('Destination city must be a string'),
  query('departureDate').optional().isISO8601().withMessage('Valid departure date is required (YYYY-MM-DD)'),
  query('minSeats').optional().isInt({ min: 1 }).withMessage('Minimum seats must be a positive integer'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Maximum price must be a positive number'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Minimum price must be a positive number'),
  query('minRating').optional().isFloat({ min: 0, max: 5 }).withMessage('Minimum rating must be between 0 and 5'),
  query('maxDistance').optional().isFloat({ min: 0 }).withMessage('Maximum distance must be a positive number'),
  query('departureTimeFrom').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid departure time from is required (HH:MM)'),
  query('departureTimeTo').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid departure time to is required (HH:MM)'),
  query('sortBy').optional().isIn(['departureTime', 'price', 'rating', 'availableSeats', 'duration', 'optimization']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('originLat').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid origin latitude is required'),
  query('originLng').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid origin longitude is required'),
  query('destLat').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid destination latitude is required'),
  query('destLng').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid destination longitude is required'),
  query('optimizeRoute').optional().isBoolean().withMessage('Optimize route must be boolean'),
  query('includeAlternatives').optional().isBoolean().withMessage('Include alternatives must be boolean'),
  query('flexibleDates').optional().isBoolean().withMessage('Flexible dates must be boolean'),
  query('flexibleTimes').optional().isBoolean().withMessage('Flexible times must be boolean'),
  query('flexibleDaysBefore').optional().isInt({ min: 0, max: 7 }).withMessage('Flexible days before must be between 0 and 7'),
  query('flexibleDaysAfter').optional().isInt({ min: 0, max: 7 }).withMessage('Flexible days after must be between 0 and 7'),
  query('timeBuffer').optional().isInt({ min: 1, max: 12 }).withMessage('Time buffer must be between 1 and 12 hours'),
];

/**
 * GET /api/search/rides - Advanced ride search with geolocation and filtering
 */
router.get('/rides', validateAdvancedSearch, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid search parameters', errors.array());
    }

    const filters = {
      originCity: req.query.originCity,
      destinationCity: req.query.destinationCity,
      departureDate: req.query.departureDate,
      minSeats: req.query.minSeats,
      maxPrice: req.query.maxPrice,
      minPrice: req.query.minPrice,
      minRating: req.query.minRating,
      maxDistance: req.query.maxDistance,
      departureTimeFrom: req.query.departureTimeFrom,
      departureTimeTo: req.query.departureTimeTo,
      sortBy: req.query.sortBy || 'departureTime',
      sortOrder: req.query.sortOrder || 'asc',
      limit: req.query.limit || 20,
      optimizeRoute: req.query.optimizeRoute === 'true',
      includeAlternatives: req.query.includeAlternatives === 'true',
      flexibleDates: req.query.flexibleDates === 'true',
      flexibleTimes: req.query.flexibleTimes === 'true',
      timeBuffer: req.query.timeBuffer ? parseInt(req.query.timeBuffer) : 2,
    };

    // Add flexible date range if specified
    if (filters.flexibleDates) {
      filters.flexibleDays = {
        before: req.query.flexibleDaysBefore ? parseInt(req.query.flexibleDaysBefore) : 1,
        after: req.query.flexibleDaysAfter ? parseInt(req.query.flexibleDaysAfter) : 1
      };
    }

    // Add geolocation coordinates if provided
    if (req.query.originLat && req.query.originLng) {
      filters.originCoordinates = {
        lat: parseFloat(req.query.originLat),
        lng: parseFloat(req.query.originLng)
      };
    }

    if (req.query.destLat && req.query.destLng) {
      filters.destinationCoordinates = {
        lat: parseFloat(req.query.destLat),
        lng: parseFloat(req.query.destLng)
      };
    }

    // Parse amenities filter
    if (req.query.amenities) {
      filters.amenities = req.query.amenities.split(',').map(a => a.trim());
    }

    // Parse preferences filter
    if (req.query.smoking !== undefined || req.query.pets !== undefined || req.query.music !== undefined) {
      filters.preferences = {};
      if (req.query.smoking !== undefined) {
        filters.preferences.smoking = req.query.smoking === 'true';
      }
      if (req.query.pets !== undefined) {
        filters.preferences.pets = req.query.pets === 'true';
      }
      if (req.query.music !== undefined) {
        filters.preferences.music = req.query.music === 'true';
      }
    }

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    let results;
    try {
      results = await searchService.searchRides(filters);
    } catch (error) {
      const isIndexError = error?.code === 9 || (error?.message || '').toLowerCase().includes('requires an index');
      if (!isIndexError) {
        throw error;
      }

      // Fallback to RTDB search to avoid Firestore index dependency in dev
      const fallbackFilters = {
        origin: filters.originCity,
        destination: filters.destinationCity,
        date: filters.departureDate,
        passengers: filters.minSeats,
        maxPrice: filters.maxPrice
      };

      const fallback = await rideService.searchRides(fallbackFilters);
      results = {
        rides: fallback?.rides || [],
        total: fallback?.rides?.length || 0,
        filters,
        timestamp: new Date().toISOString(),
        alternativeRoutes: null,
        fallback: true
      };
    }

    sendResponse(res, 200, results, 'Advanced search completed successfully');

  } catch (error) {
    logger.error('Error in advanced search:', error);
    sendError(res, 500, 'SEARCH_ERROR', 'Failed to perform advanced search');
  }
});

/**
 * GET /api/search/popular-routes - Get popular routes
 */
router.get('/popular-routes', 
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid parameters', errors.array());
      }

      const limit = parseInt(req.query.limit) || 10;
      const popularRoutes = await searchService.getPopularRoutes(limit);

      sendResponse(res, 200, {
        routes: popularRoutes,
        total: popularRoutes.length
      }, 'Popular routes retrieved successfully');

    } catch (error) {
      logger.error('Error getting popular routes:', error);
      sendError(res, 500, 'FETCH_ERROR', 'Failed to get popular routes');
    }
  }
);

/**
 * GET /api/search/suggestions - Get search suggestions
 */
router.get('/suggestions',
  query('q').notEmpty().withMessage('Query parameter is required'),
  query('type').optional().isIn(['city', 'address']).withMessage('Type must be city or address'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid parameters', errors.array());
      }

      const query = req.query.q;
      const type = req.query.type || 'city';

      const suggestions = await searchService.getSearchSuggestions(query, type);

      sendResponse(res, 200, {
        suggestions,
        query,
        type
      }, 'Search suggestions retrieved successfully');

    } catch (error) {
      logger.error('Error getting search suggestions:', error);
      sendError(res, 500, 'FETCH_ERROR', 'Failed to get search suggestions');
    }
  }
);

/**
 * GET /api/search/nearby - Find rides near specific coordinates
 */
router.get('/nearby',
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  query('radius').optional().isFloat({ min: 0, max: 100 }).withMessage('Radius must be between 0 and 100 km'),
  query('type').optional().isIn(['origin', 'destination', 'both']).withMessage('Type must be origin, destination, or both'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid parameters', errors.array());
      }

      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const radius = parseFloat(req.query.radius) || 10; // Default 10km
      const type = req.query.type || 'both';

      const filters = {
        maxDistance: radius,
        limit: parseInt(req.query.limit) || 20,
        sortBy: 'departureTime',
        sortOrder: 'asc'
      };

      // Set coordinates based on type
      if (type === 'origin' || type === 'both') {
        filters.originCoordinates = { lat, lng };
      }
      if (type === 'destination' || type === 'both') {
        filters.destinationCoordinates = { lat, lng };
      }

      const results = await searchService.searchRides(filters);

      sendResponse(res, 200, {
        ...results,
        searchLocation: { lat, lng },
        radius,
        type
      }, 'Nearby rides retrieved successfully');

    } catch (error) {
      logger.error('Error finding nearby rides:', error);
      sendError(res, 500, 'SEARCH_ERROR', 'Failed to find nearby rides');
    }
  }
);

/**
 * GET /api/search/optimize-pickup - Get optimized pickup points
 */
router.get('/optimize-pickup',
  query('originLat').isFloat({ min: -90, max: 90 }).withMessage('Valid origin latitude is required'),
  query('originLng').isFloat({ min: -180, max: 180 }).withMessage('Valid origin longitude is required'),
  query('destLat').isFloat({ min: -90, max: 90 }).withMessage('Valid destination latitude is required'),
  query('destLng').isFloat({ min: -180, max: 180 }).withMessage('Valid destination longitude is required'),
  query('radius').optional().isFloat({ min: 0, max: 50 }).withMessage('Radius must be between 0 and 50 km'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid parameters', errors.array());
      }

      const originCoords = {
        lat: parseFloat(req.query.originLat),
        lng: parseFloat(req.query.originLng)
      };

      const destCoords = {
        lat: parseFloat(req.query.destLat),
        lng: parseFloat(req.query.destLng)
      };

      const radius = parseFloat(req.query.radius) || 10;

      // Find rides and optimize pickup points
      const filters = {
        originCoordinates: originCoords,
        destinationCoordinates: destCoords,
        maxDistance: radius,
        optimizeRoute: true,
        limit: 20
      };

      const results = await searchService.searchRides(filters);

      // Extract optimized pickup suggestions
      const pickupSuggestions = results.rides
        .filter(ride => ride.routeEfficiency)
        .map(ride => ({
          rideId: ride.id,
          pickupPoint: ride.origin,
          dropoffPoint: ride.destination,
          efficiency: ride.routeEfficiency,
          optimizationScore: ride.optimizationScore,
          walkingDistance: {
            toPickup: ride.routeEfficiency.pickupDistance,
            fromDropoff: ride.routeEfficiency.dropoffDistance
          }
        }))
        .slice(0, 10);

      sendResponse(res, 200, {
        pickupSuggestions,
        searchArea: { origin: originCoords, destination: destCoords, radius },
        totalOptions: pickupSuggestions.length
      }, 'Optimized pickup points retrieved successfully');

    } catch (error) {
      logger.error('Error optimizing pickup points:', error);
      sendError(res, 500, 'OPTIMIZATION_ERROR', 'Failed to optimize pickup points');
    }
  }
);

/**
 * GET /api/search/flexible - Flexible date and time search
 */
router.get('/flexible',
  query('originCity').optional().isString().withMessage('Origin city must be a string'),
  query('destinationCity').optional().isString().withMessage('Destination city must be a string'),
  query('baseDate').isISO8601().withMessage('Valid base date is required (YYYY-MM-DD)'),
  query('baseTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid base time is required (HH:MM)'),
  query('daysBefore').optional().isInt({ min: 0, max: 7 }).withMessage('Days before must be between 0 and 7'),
  query('daysAfter').optional().isInt({ min: 0, max: 7 }).withMessage('Days after must be between 0 and 7'),
  query('timeBuffer').optional().isInt({ min: 1, max: 12 }).withMessage('Time buffer must be between 1 and 12 hours'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid parameters', errors.array());
      }

      const filters = {
        originCity: req.query.originCity,
        destinationCity: req.query.destinationCity,
        departureDate: req.query.baseDate,
        departureTimeFrom: req.query.baseTime,
        flexibleDates: true,
        flexibleTimes: !!req.query.baseTime,
        flexibleDays: {
          before: parseInt(req.query.daysBefore) || 1,
          after: parseInt(req.query.daysAfter) || 1
        },
        timeBuffer: parseInt(req.query.timeBuffer) || 2,
        limit: parseInt(req.query.limit) || 50
      };

      const results = await searchService.searchRides(filters);

      // Group results by date for better presentation
      const groupedResults = {};
      results.rides.forEach(ride => {
        const date = ride.departureDate;
        if (!groupedResults[date]) {
          groupedResults[date] = [];
        }
        groupedResults[date].push(ride);
      });

      sendResponse(res, 200, {
        baseSearch: { date: req.query.baseDate, time: req.query.baseTime },
        flexibilityOptions: filters.flexibleDays,
        groupedResults,
        totalRides: results.total,
        searchSummary: {
          exactMatches: results.rides.filter(r => !r.isFlexibleResult).length,
          flexibleMatches: results.rides.filter(r => r.isFlexibleResult).length
        }
      }, 'Flexible search completed successfully');

    } catch (error) {
      logger.error('Error in flexible search:', error);
      sendError(res, 500, 'SEARCH_ERROR', 'Failed to perform flexible search');
    }
  }
);

module.exports = router;
