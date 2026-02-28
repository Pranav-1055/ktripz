import { api } from './api';
import { authService } from './auth';

export const rideService = {
    isRealRideId(id) {
        return !!id && typeof id === 'string' && !id.startsWith('mock-');
    },

    filterRealRides(rides) {
        return (Array.isArray(rides) ? rides : []).filter((ride) => this.isRealRideId(ride?.id));
    },

    async searchRides(filters = {}) {
        try {
            const params = new URLSearchParams();
            if (filters.from) params.append('originCity', filters.from);
            if (filters.to) params.append('destinationCity', filters.to);
            if (filters.date) params.append('departureDate', filters.date);
            if (filters.originCoords?.lat && filters.originCoords?.lng) {
                params.append('originLat', String(filters.originCoords.lat));
                params.append('originLng', String(filters.originCoords.lng));
            }
            if (filters.destinationCoords?.lat && filters.destinationCoords?.lng) {
                params.append('destLat', String(filters.destinationCoords.lat));
                params.append('destLng', String(filters.destinationCoords.lng));
            }
            if (filters.optimizeRoute) params.append('optimizeRoute', 'true');

            const response = await api.get(`/search/rides?${params.toString()}`);

            if (!response.data || !Array.isArray(response.data.rides)) {
                return [];
            }

            return response.data.rides;
        } catch (error) {
            console.error('Search API failed:', error);
            return [];
        }
    },

    async getRideById(id) {
        if (!id) return null;
        try {
            const response = await api.get(`/rides/${id}`);
            return response.data || response;
        } catch (error) {
            console.error('Failed to fetch ride:', error);
            return null;
        }
    },

    async getProviderRides() {
        try {
            const token = await authService.getToken();
            const response = await api.get('/rides/provider/my-rides', token);
            if (Array.isArray(response?.data?.rides)) return this.filterRealRides(response.data.rides);
            if (Array.isArray(response?.data?.data?.rides)) return this.filterRealRides(response.data.data.rides);
            if (Array.isArray(response?.rides)) return this.filterRealRides(response.rides);
            return [];
        } catch (error) {
            console.error('Failed to fetch provider rides:', error);
            return [];
        }
    },

    async cancelRide(id) {
        if (!id) {
            throw new Error('Ride ID is required');
        }
        const token = await authService.getToken();
        return api.delete(`/rides/${id}`, token);
    }
};
