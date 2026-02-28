import { io } from 'socket.io-client';
import { authService } from './auth';

let socketInstance = null;

const getSocketUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';
    try {
        const url = new URL(apiUrl);
        url.pathname = '';
        url.search = '';
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch (e) {
        return apiUrl.replace(/\/api\/?$/, '');
    }
};

export const socketService = {
    async connect() {
        if (socketInstance && socketInstance.connected) return socketInstance;
        const token = await authService.getToken();
        if (!token) return null;

        if (!socketInstance) {
            socketInstance = io(getSocketUrl(), {
                auth: { token },
                transports: ['websocket', 'polling']
            });
        }

        return socketInstance;
    },

    getSocket() {
        return socketInstance;
    },

    async joinRide(rideId) {
        const socket = await this.connect();
        if (socket && rideId) {
            socket.emit('join_ride', rideId);
        }
    },

    async leaveRide(rideId) {
        const socket = await this.connect();
        if (socket && rideId) {
            socket.emit('leave_ride', rideId);
        }
    },

    async joinBooking(bookingId) {
        const socket = await this.connect();
        if (socket && bookingId) {
            socket.emit('join_booking', bookingId);
        }
    },

    async leaveBooking(bookingId) {
        const socket = await this.connect();
        if (socket && bookingId) {
            socket.emit('leave_booking', bookingId);
        }
    },

    on(event, handler) {
        if (!socketInstance) return;
        socketInstance.on(event, handler);
    },

    off(event, handler) {
        if (!socketInstance) return;
        socketInstance.off(event, handler);
    },

    disconnect() {
        if (socketInstance) {
            socketInstance.disconnect();
            socketInstance = null;
        }
    }
};
