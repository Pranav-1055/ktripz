import { api } from './api';
import { authService } from './auth';

export const bookingService = {
    async createBooking(payload) {
        const token = await authService.getToken();
        return api.post('/bookings', payload, token);
    },

    async listBookings({ role = 'passenger', status, limit = 50, offset = 0 } = {}) {
        const token = await authService.getToken();
        const params = new URLSearchParams();
        if (role) params.append('role', role);
        if (status) params.append('status', status);
        if (limit) params.append('limit', String(limit));
        if (offset) params.append('offset', String(offset));
        return api.get(`/bookings?${params.toString()}`, token);
    },

    async getBookingById(id) {
        const token = await authService.getToken();
        return api.get(`/bookings/${id}`, token);
    },

    async cancelBooking(id, reason = '') {
        const token = await authService.getToken();
        return api.put(`/bookings/${id}/cancel`, { reason }, token);
    }
};
