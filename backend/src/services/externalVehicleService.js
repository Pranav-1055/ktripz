const axios = require('axios');
const logger = require('../utils/logger');
const { twoWheelers } = require('../data/twoWheelersMock'); // We'll create this for fallback

class ExternalVehicleService {
    constructor() {
        this.baseUrl = 'https://carapi.app/api';
        this.token = process.env.CARAPI_TOKEN;
        this.secret = process.env.CARAPI_SECRET;
        this.jwt = null;
        this.jwtExpiresAt = null;

        // Simple in-memory cache
        this.cache = {
            makes: null,
            models: {} // Key: makeId, Value: models list
        };
    }

    /**
     * Authenticate with CarAPI to get JWT
     */
    async authenticate() {
        // Return existing valid token
        if (this.jwt && this.jwtExpiresAt && new Date() < this.jwtExpiresAt) {
            return this.jwt;
        }

        try {
            const response = await axios.post(`${this.baseUrl}/auth/login`, {
                api_token: this.token,
                api_secret: this.secret
            });

            this.jwt = response.data; // The response body IS the token string directly

            // Token usually lasts 24h, set expiry to 23h to be safe
            const expiry = new Date();
            expiry.setHours(expiry.getHours() + 23);
            this.jwtExpiresAt = expiry;

            return this.jwt;
        } catch (error) {
            logger.error('CarAPI authentication failed:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with vehicle database');
        }
    }

    /**
     * Get axios config with auth header
     */
    async getConfig() {
        const token = await this.authenticate();
        return {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        };
    }

    /**
     * Get all vehicle makes
     */
    async getMakes() {
        if (this.cache.makes) return this.cache.makes;

        try {
            const config = await this.getConfig();
            const response = await axios.get(`${this.baseUrl}/makes`, config);

            this.cache.makes = response.data.data.map(make => ({
                id: make.id,
                name: make.name
            })).sort((a, b) => a.name.localeCompare(b.name));

            return this.cache.makes;
        } catch (error) {
            logger.error('Failed to fetch makes:', error.response?.data || error.message);
            // Fallback for demo if API fails
            return [];
        }
    }

    /**
     * Get models for a specific make
     * @param {string} makeId 
     * @param {string} year - optional
     */
    async getModels(makeId, year = new Date().getFullYear()) {
        const cacheKey = `${makeId}-${year}`;
        if (this.cache.models[cacheKey]) return this.cache.models[cacheKey];

        try {
            const config = await this.getConfig();
            // CarAPI models endpoint: /makes/{make_id}/models?year={year}
            const url = `${this.baseUrl}/makes/${makeId}/models?year=${year}`;

            const response = await axios.get(url, config);

            const models = response.data.data.map(model => ({
                id: model.id,
                name: model.name,
                makeId: model.make_id
            })).sort((a, b) => a.name.localeCompare(b.name));

            this.cache.models[cacheKey] = models;
            return models;
        } catch (error) {
            logger.error(`Failed to fetch models for make ${makeId}:`, error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Get trims/details which usually include images
     * Note: CarAPI structure is Make -> Model -> Year -> Trims
     */
    async getTrims(makeId, modelId, year) {
        try {
            const config = await this.getConfig();
            // Endpoint: /makes/{make_id}/models/{model_id}/years/{year}/trims
            const url = `${this.baseUrl}/makes/${makeId}/models/${modelId}/years/${year}/trims`;

            const response = await axios.get(url, config);

            // CarAPI free/basic tier might not return image URLs directly in the list
            // We often need to assume a placeholder or check specific fields
            // For this implementation, we'll try to find an image or return a high-quality placeholder

            return response.data.data.map(trim => ({
                id: trim.id,
                name: trim.description || trim.name,
                // Mock image if API doesn't return one (common in basic tiers)
                image: `https://cdn.imagin.studio/getImage?customer=img&make=${trim.make_model_trim.make_model.make.name}&modelFamily=${trim.make_model_trim.make_model.name}&modelYear=${year}&angle=01`
            }));
        } catch (error) {
            logger.error('Failed to fetch trims:', error.message);
            return [];
        }
    }

    /**
     * Unified method to get vehicle data for frontend
     * Handles the "2wheeler" vs "4wheeler" logic internally
     */
    async getVehiclesByType(type) {
        // For 2-wheelers, CarAPI might be limited. 
        // We'll return our internal curated list for 2-wheelers if requested
        if (type === '2wheeler') {
            return twoWheelers;
        }

        // For 4-wheelers, strictly return Makes first
        // The frontend will have to handle the Make -> Model flow
        // This method might just return null to signal "use API flow"
        return null;
    }
}

module.exports = new ExternalVehicleService();
