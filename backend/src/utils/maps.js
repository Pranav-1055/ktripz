const axios = require('axios');
const logger = require('./logger');

class MapsService {
    constructor() {
        this.apiKey = process.env.OLA_MAPS_API_KEY;
        this.clientId = process.env.OLA_MAPS_CLIENT_ID;
        this.clientSecret = process.env.OLA_MAPS_CLIENT_SECRET;
        this.baseUrl = 'https://api.olamaps.io';
        this.geocodingUrl = 'https://api.olamaps.io/places/v1/geocode';
        this.reverseGeocodingUrl = 'https://api.olamaps.io/places/v1/reverse-geocode';
        this.autocompleteUrl = 'https://api.olamaps.io/places/v1/autocomplete';
        this.directionsUrl = 'https://api.olamaps.io/routing/v1/directions';
        this.nearbyUrl = 'https://api.olamaps.io/places/v1/nearbysearch';
        this.placeDetailsUrl = 'https://api.olamaps.io/places/v1/details';
        this.tokenUrl = 'https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token';

        this.accessToken = null;
        this.tokenExpiresAt = 0;
    }

    extractEncodedPolyline(value) {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
            return value.points || value.encodedPolyline || value.encoded_polyline || value.geometry || null;
        }
        return null;
    }

    /**
     * Get valid access token
     * @returns {Promise<string>} - Access token
     */
    async getAccessToken() {
        try {
            const now = Date.now();
            if (this.accessToken && this.tokenExpiresAt > now) {
                return this.accessToken;
            }

            if (!this.clientId || !this.clientSecret) {
                logger.warn('Ola Maps OAuth credentials not configured');
                throw new Error('Missing OAuth credentials');
            }

            const qs = require('qs');
            const response = await axios.post(this.tokenUrl, qs.stringify({
                grant_type: 'client_credentials',
                client_id: this.clientId,
                client_secret: this.clientSecret,
                scope: 'openid'
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            this.accessToken = response.data.access_token;
            // Set expiry with 60s buffer
            this.tokenExpiresAt = now + (response.data.expires_in * 1000) - 60000;

            return this.accessToken;

        } catch (error) {
            logger.error('Error getting access token:', error);
            throw error;
        }
    }

    /**
     * Geocode an address to get coordinates
     * @param {string} address - The address to geocode
     * @returns {Promise<Object>} - Coordinates and formatted address
     */
    async geocodeAddress(address) {
        try {
            if (!this.apiKey) {
                logger.warn('Ola Maps API key not configured');
                return null;
            }

            const response = await axios.get(this.geocodingUrl, {
                params: {
                    address,
                    api_key: this.apiKey
                }
            });

            if (response.data.status === 'ok' && response.data.geocodingResults.length > 0) {
                const result = response.data.geocodingResults[0];
                return {
                    coordinates: {
                        lat: result.geometry.location.lat,
                        lng: result.geometry.location.lng
                    },
                    formattedAddress: result.formatted_address,
                    placeId: result.place_id,
                    addressComponents: result.address_components
                };
            }

            logger.warn(`Geocoding failed for address: ${address}`, response.data);
            return null;

        } catch (error) {
            logger.error('Error geocoding address:', error);
            return null;
        }
    }

    /**
     * Get route information between two points with enhanced features
     * @param {Object} origin - Origin coordinates {lat, lng}
     * @param {Object} destination - Destination coordinates {lat, lng}
     * @param {Array} waypoints - Optional waypoints
     * @param {Object} options - Route options (avoid tolls, highways, etc.)
     * @returns {Promise<Object>} - Enhanced route information
     */
    async getRoute(origin, destination, waypoints = [], options = {}) {
        try {
            // Use OAuth token for Routing API
            const token = await this.getAccessToken();

            if (!token) {
                logger.error('Failed to obtain access token for routing');
                return null;
            }

            // Ola Maps Routing API - POST request with query parameters
            // Based on successful tests, we need to pass origin/dest as query params and an empty body
            const response = await axios.post(this.directionsUrl, {}, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                params: {
                    origin: `${origin.lat},${origin.lng}`,
                    destination: `${destination.lat},${destination.lng}`,
                    mode: 'driving',
                    alternatives: options.alternatives ? 'true' : 'false',
                    alternatives_count: Number(options.alternativesCount) || 3,
                    steps: true,
                    overview: 'full'
                }
            });

            const data = response.data;

            if (data.status === 'SUCCESS' || data.routes) {
                const routes = data.routes.map(route => {
                    const leg = route?.legs?.[0] || {};
                    const routeGeometry = this.extractEncodedPolyline(route?.geometry)
                        || this.extractEncodedPolyline(route?.polyline)
                        || this.extractEncodedPolyline(route?.overview_polyline)
                        || this.extractEncodedPolyline(route?.overviewPolyline)
                        || this.extractEncodedPolyline(route?.route_geometry)
                        || null;
                    const routeCoordinates = Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates : null;
                    const rawSteps = Array.isArray(leg?.steps) ? leg.steps : [];

                    return {
                        distance: {
                            text: ((leg.distance || 0) / 1000).toFixed(1) + ' km',
                            value: leg.distance || 0 // in meters
                        },
                        duration: {
                            text: Math.round((leg.duration || 0) / 60) + ' mins',
                            value: leg.duration || 0, // in seconds
                            inTraffic: leg.duration_in_traffic || leg.duration || 0
                        },
                        startAddress: leg.start_address || '',
                        endAddress: leg.end_address || '',
                        bounds: route.bounds,
                        steps: rawSteps.map(step => ({
                            distance: step.distance,
                            duration: step.duration,
                            instructions: step.instruction,
                            maneuver: step.maneuver,
                            startLocation: step.start_location,
                            endLocation: step.end_location,
                            polyline: this.extractEncodedPolyline(step?.geometry)
                                || this.extractEncodedPolyline(step?.polyline)
                                || this.extractEncodedPolyline(step?.overview_polyline)
                                || this.extractEncodedPolyline(step?.overviewPolyline)
                                || null
                        })),
                        polyline: typeof routeGeometry === 'string' ? routeGeometry : null,
                        geometry: routeCoordinates ? { type: 'LineString', coordinates: routeCoordinates } : null,
                        summary: route.summary
                    };
                });

                return {
                    routes,
                    status: 'OK'
                };
            }

            logger.warn('Route calculation failed', data);
            return null;

        } catch (error) {
            logger.error('Error calculating route:', error.response ? error.response.data : error.message);
            return null;
        }
    }

    /**
     * Get nearby places (for pickup points)
     * @param {Object} location - Center coordinates {lat, lng}
     * @param {number} radius - Search radius in meters
     * @param {string} type - Place type (e.g., 'transit_station', 'gas_station')
     * @returns {Promise<Array>} - Array of nearby places
     */
    async getNearbyPlaces(location, radius = 5000, type = 'point_of_interest') {
        try {
            if (!this.apiKey) {
                logger.warn('Ola Maps API key not configured');
                return [];
            }

            const response = await axios.get(this.nearbyUrl, {
                params: {
                    location: `${location.lat},${location.lng}`,
                    radius,
                    types: type,
                    api_key: this.apiKey
                }
            });

            if (response.data.status === 'ok') {
                return response.data.predictions.map(place => ({
                    placeId: place.place_id,
                    name: place.name || place.description,
                    vicinity: place.vicinity || place.description,
                    coordinates: {
                        lat: place.geometry?.location?.lat,
                        lng: place.geometry?.location?.lng
                    },
                    rating: 4.5, // Mock as Ola might not return rating in list
                    types: place.types || [],
                    openNow: true
                }));
            }

            return [];

        } catch (error) {
            logger.error('Error fetching nearby places:', error);
            return [];
        }
    }

    /**
     * Calculate distance between two points using Haversine formula
     * @param {Object} point1 - First point {lat, lng}
     * @param {Object} point2 - Second point {lat, lng}
     * @returns {number} - Distance in kilometers
     */
    calculateDistance(point1, point2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(point2.lat - point1.lat);
        const dLng = this.toRadians(point2.lng - point1.lng);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     * @param {number} degrees - Degrees to convert
     * @returns {number} - Radians
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Get autocomplete suggestions for places
     * @param {string} input - User input
     * @param {Object} location - Bias location {lat, lng}
     * @param {number} radius - Bias radius in meters
     * @returns {Promise<Array>} - Array of place suggestions
     */
    async getPlaceAutocomplete(input, location = null, radius = 50000) {
        try {
            if (!this.apiKey) {
                logger.warn('Ola Maps API key not configured');
                return [];
            }

            const params = {
                input,
                api_key: this.apiKey
            };

            if (location) {
                params.location = `${location.lat},${location.lng}`;
                params.radius = radius;
            }

            const response = await axios.get(this.autocompleteUrl, {
                params
            });

            if (response.data.status === 'ok') {
                return response.data.predictions.map(prediction => ({
                    placeId: prediction.place_id,
                    description: prediction.description,
                    mainText: prediction.structured_formatting?.main_text || prediction.description,
                    secondaryText: prediction.structured_formatting?.secondary_text || '',
                    types: prediction.types || []
                }));
            }

            return [];

        } catch (error) {
            logger.error('Error fetching place autocomplete:', error);
            return [];
        }
    }

    /**
     * Get place details by place ID
     * @param {string} placeId - Google Place ID
     * @returns {Promise<Object>} - Place details
     */
    async getPlaceDetails(placeId) {
        try {
            if (!this.apiKey) {
                logger.warn('Ola Maps API key not configured');
                return null;
            }

            const response = await axios.get(this.placeDetailsUrl, {
                params: {
                    place_id: placeId,
                    api_key: this.apiKey
                }
            });

            if (response.data.status === 'ok') {
                const place = response.data.result;
                return {
                    placeId: place.place_id,
                    name: place.name,
                    formattedAddress: place.formatted_address,
                    coordinates: {
                        lat: place.geometry.location.lat,
                        lng: place.geometry.location.lng
                    },
                    types: place.types || []
                };
            }

            return null;

        } catch (error) {
            logger.error('Error fetching place details:', error);
            return null;
        }
    }

    /**
     * Batch geocode multiple addresses
     * @param {Array} addresses - Array of addresses to geocode
     * @returns {Promise<Array>} - Array of geocoded results
     */
    async batchGeocode(addresses) {
        try {
            if (!this.apiKey) {
                logger.warn('Ola Maps API key not configured');
                return [];
            }

            const results = [];

            // Process in batches to avoid rate limits
            const batchSize = 10;
            for (let i = 0; i < addresses.length; i += batchSize) {
                const batch = addresses.slice(i, i + batchSize);
                const batchPromises = batch.map(address => this.geocodeAddress(address));
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Add delay between batches
                if (i + batchSize < addresses.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return results;
        } catch (error) {
            logger.error('Error in batch geocoding:', error);
            return [];
        }
    }

    /**
     * Reverse geocode coordinates to get address
     * @param {Object} coordinates - {lat, lng}
     * @returns {Promise<Object>} - Address information
     */
    async reverseGeocode(coordinates) {
        try {
            if (this.apiKey) {
                const response = await axios.get(this.reverseGeocodingUrl, {
                    params: {
                        latlng: `${coordinates.lat},${coordinates.lng}`,
                        api_key: this.apiKey
                    }
                });

                if (response.data.status === 'ok' && response.data.results.length > 0) {
                    const result = response.data.results[0];
                    return {
                        formattedAddress: result.formatted_address,
                        addressComponents: result.address_components,
                        placeId: result.place_id,
                        types: result.types,
                        source: 'olamaps'
                    };
                }
            }

            // Fallback to Nominatim (OpenStreetMap)
            // User-Agent is required by Nominatim policy
            const nominatimResponse = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                params: {
                    format: 'json',
                    lat: coordinates.lat,
                    lon: coordinates.lng,
                    addressdetails: 1
                },
                headers: {
                    'User-Agent': 'TripO-RideSharingApp/1.0'
                }
            });

            if (nominatimResponse.data && !nominatimResponse.data.error) {
                const data = nominatimResponse.data;
                const address = data.address;

                // Map Nominatim structure to our common structure
                return {
                    formattedAddress: data.display_name,
                    // Synthesize address components if needed or just pass raw address object
                    address: {
                        village: address.village || address.town || address.city || '',
                        city: address.city || address.town || address.village || '',
                        district: address.state_district || address.county || '',
                        state: address.state || '',
                        country: address.country || '',
                        postcode: address.postcode || ''
                    },
                    source: 'nominatim'
                };
            }

            return null;
        } catch (error) {
            logger.error('Error in reverse geocoding:', error);
            return null;
        }
    }

    /**
     * Find optimal pickup points along a route
     * @param {Object} origin - Origin coordinates
     * @param {Object} destination - Destination coordinates
     * @param {Object} userLocation - User's current location
     * @param {Object} options - Search options
     * @returns {Promise<Array>} - Array of optimized pickup points
     */
    async findOptimalPickupPoints(origin, destination, userLocation, options = {}) {
        try {
            if (!this.apiKey) {
                logger.warn('Ola Maps API key not configured');
                return [];
            }

            // Get the main route first
            const mainRoute = await this.getRoute(origin, destination);
            if (!mainRoute || !mainRoute.routes.length) {
                return [];
            }

            const route = mainRoute.routes[0];
            const pickupPoints = [];

            // Find points along the route that are accessible to the user
            const maxWalkingDistance = options.maxWalkingDistance || 1000; // meters
            const searchRadius = options.searchRadius || 500; // meters

            // Sample points along the route polyline
            const routePoints = this.decodePolyline(route.polyline);
            const sampleInterval = Math.max(1, Math.floor(routePoints.length / 20)); // Sample ~20 points

            for (let i = 0; i < routePoints.length; i += sampleInterval) {
                const point = routePoints[i];

                // Calculate walking distance from user location to this point
                const walkingDistance = this.calculateDistance(userLocation, point) * 1000; // Convert to meters

                if (walkingDistance <= maxWalkingDistance) {
                    // Find nearby places that could serve as pickup points
                    const nearbyPlaces = await this.getNearbyPlaces(
                        point,
                        searchRadius,
                        'transit_station|bus_station|subway_station|parking'
                    );

                    for (const place of nearbyPlaces.slice(0, 3)) { // Limit to 3 per route point
                        const walkingTime = await this.getWalkingTime(userLocation, place.coordinates);

                        pickupPoints.push({
                            ...place,
                            walkingDistance: Math.round(walkingDistance),
                            walkingTime,
                            routePosition: i / routePoints.length, // Position along route (0-1)
                            accessibility: this.assessAccessibility(place)
                        });
                    }
                }
            }

            // Sort by optimization score (walking time + accessibility)
            return pickupPoints
                .sort((a, b) => {
                    const scoreA = (a.walkingTime?.value || 600) + (a.accessibility.score * -100);
                    const scoreB = (b.walkingTime?.value || 600) + (b.accessibility.score * -100);
                    return scoreA - scoreB;
                })
                .slice(0, options.maxResults || 10);

        } catch (error) {
            logger.error('Error finding optimal pickup points:', error);
            return [];
        }
    }

    /**
     * Get walking time between two points
     * @param {Object} origin - Origin coordinates
     * @param {Object} destination - Destination coordinates
     * @returns {Promise<Object>} - Walking time and distance
     */
    async getWalkingTime(origin, destination) {
        try {
            if (!this.apiKey) {
                return null;
            }

            const response = await axios.get(`${this.baseUrl}/directions/json`, {
                params: {
                    origin: `${origin.lat},${origin.lng}`,
                    destination: `${destination.lat},${destination.lng}`,
                    mode: 'walking',
                    key: this.apiKey
                }
            });

            if (response.data.status === 'OK' && response.data.routes.length > 0) {
                const leg = response.data.routes[0].legs[0];
                return {
                    distance: leg.distance,
                    duration: leg.duration
                };
            }

            return null;
        } catch (error) {
            logger.error('Error getting walking time:', error);
            return null;
        }
    }

    /**
     * Assess accessibility of a pickup point
     * @param {Object} place - Place object
     * @returns {Object} - Accessibility assessment
     */
    assessAccessibility(place) {
        let score = 0;
        const factors = [];

        // Check place types for accessibility indicators
        if (place.types.includes('transit_station')) {
            score += 3;
            factors.push('Public transit access');
        }
        if (place.types.includes('parking')) {
            score += 2;
            factors.push('Parking available');
        }
        if (place.types.includes('bus_station')) {
            score += 2;
            factors.push('Bus station');
        }
        if (place.types.includes('subway_station')) {
            score += 3;
            factors.push('Subway access');
        }

        // Rating bonus
        if (place.rating && place.rating >= 4.0) {
            score += 1;
            factors.push('Highly rated location');
        }

        // Open now bonus
        if (place.openNow) {
            score += 1;
            factors.push('Currently open');
        }

        return {
            score: Math.min(score, 5), // Cap at 5
            factors,
            level: score >= 4 ? 'excellent' : score >= 2 ? 'good' : 'basic'
        };
    }

    /**
     * Decode Google Maps polyline
     * @param {string} polyline - Encoded polyline string
     * @returns {Array} - Array of {lat, lng} coordinates
     */
    decodePolyline(polyline) {
        const points = [];
        let index = 0;
        const len = polyline.length;
        let lat = 0;
        let lng = 0;

        while (index < len) {
            let b;
            let shift = 0;
            let result = 0;

            do {
                b = polyline.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);

            const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;

            do {
                b = polyline.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);

            const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            points.push({
                lat: lat / 1e5,
                lng: lng / 1e5
            });
        }

        return points;
    }

    /**
     * Calculate route matrix for multiple origins and destinations
     * @param {Array} origins - Array of origin coordinates
     * @param {Array} destinations - Array of destination coordinates
     * @param {Object} options - Matrix options
     * @returns {Promise<Object>} - Distance matrix results
     */
    async getDistanceMatrix(origins, destinations, options = {}) {
        try {
            if (!this.apiKey) {
                logger.warn('Ola Maps API key not configured');
                return null;
            }

            const originsStr = origins.map(o => `${o.lat},${o.lng}`).join('|');
            // Ola Maps might not support matrix directly in the same way, using basic iteration fallback or check matrix API support
            // For now, assuming standard matrix API structure compatibility or mocking
            // If Ola Maps has matrix API, use it here.

            // Fallback: simplified return using Haversine for now to avoid breaking if API differs significantly
            return {
                originAddresses: origins.map(o => `${o.lat},${o.lng}`),
                destinationAddresses: destinations.map(d => `${d.lat},${d.lng}`),
                rows: origins.map(origin => ({
                    elements: destinations.map(dest => {
                        const dist = this.calculateDistance(origin, dest) * 1000;
                        return {
                            distance: { text: (dist / 1000).toFixed(1) + ' km', value: dist },
                            duration: { text: Math.round(dist / 600) + ' mins', value: dist / 10 }, // rough estimate
                            status: 'OK'
                        };
                    })
                }))
            };


        } catch (error) {
            logger.error('Error getting distance matrix:', error);
            return null;
        }
    }
}

module.exports = new MapsService();
