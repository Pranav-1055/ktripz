import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Calendar, Users, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProviderBottomNav from '../components/layout/ProviderBottomNav';
import { bookingService } from '../services/bookingService';
import { rideService } from '../services/rideService';
import { socketService } from '../services/socket';

export default function MyRides() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('upcoming');
    const [rides, setRides] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [cancellingRideId, setCancellingRideId] = useState(null);

    const normalizeStatus = (status) => String(status || '').toLowerCase().trim();
    const isUpcoming = (status) => {
        const value = normalizeStatus(status);
        return value === 'published' || value === 'scheduled' || value === 'upcoming';
    };
    const isCompleted = (status) => normalizeStatus(status) === 'completed';
    const isCancelled = (status) => {
        const value = normalizeStatus(status);
        return value === 'cancelled' || value === 'canceled';
    };

    const refreshData = async () => {
        const [ridesList, bookingsRes] = await Promise.all([
            rideService.getProviderRides(),
            bookingService.listBookings({ role: 'driver' })
        ]);
        setRides(Array.isArray(ridesList) ? ridesList : []);
        setBookings(bookingsRes?.data?.bookings || []);
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                await refreshData();
            } catch (error) {
                console.error('Failed to load rides', error);
                setRides([]);
                setBookings([]);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        const handleRideUpdate = (payload) => {
            if (!payload?.rideId || payload.availableSeats === undefined) return;
            setRides((prev) => prev.map((ride) => (
                ride.id === payload.rideId ? { ...ride, availableSeats: payload.availableSeats } : ride
            )));
        };

        const handleBookingStatus = async () => {
            try {
                await refreshData();
            } catch (error) {
                console.error('Failed to refresh rides', error);
            }
        };

        rides.forEach((ride) => socketService.joinRide(ride.id));
        socketService.on('ride_updated', handleRideUpdate);
        socketService.on('booking_status_changed', handleBookingStatus);

        return () => {
            socketService.off('ride_updated', handleRideUpdate);
            socketService.off('booking_status_changed', handleBookingStatus);
            rides.forEach((ride) => socketService.leaveRide(ride.id));
        };
    }, [rides]);

    const bookingsByRide = useMemo(() => {
        const map = new Map();
        bookings.forEach((booking) => {
            if (!booking.rideId) return;
            const current = map.get(booking.rideId) || 0;
            map.set(booking.rideId, current + (booking.seatsBooked || 0));
        });
        return map;
    }, [bookings]);

    const ridesByStatus = {
        upcoming: rides.filter((ride) => isUpcoming(ride.status)),
        completed: rides.filter((ride) => isCompleted(ride.status)),
        cancelled: rides.filter((ride) => isCancelled(ride.status))
    };

    const currentRides = ridesByStatus[activeTab] || [];

    const handleCancelRide = async (rideId) => {
        const confirmed = window.confirm('Cancel this scheduled ride? This will notify passengers that the ride is cancelled.');
        if (!confirmed) return;

        try {
            setCancellingRideId(rideId);
            await rideService.cancelRide(rideId);
            setRides((prev) => prev.map((ride) => (
                ride.id === rideId ? { ...ride, status: 'cancelled' } : ride
            )));
            await refreshData();
        } catch (error) {
            console.error('Failed to cancel ride', error);
            window.alert('Failed to cancel ride. Please try again.');
        } finally {
            setCancellingRideId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Header */}
            <div className="bg-white sticky top-0 z-10 shadow-sm border-b border-gray-100">
                <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
                            <ArrowLeft size={20} className="text-gray-700" />
                        </button>
                        <h1 className="text-xl font-bold text-gray-900">My Rides</h1>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="p-4">
                <div className="flex gap-2">
                    {['upcoming', 'completed', 'cancelled'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold ${activeTab === tab ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {loading && (
                    <div className="text-center py-12 text-gray-500">Loading rides...</div>
                )}

                {!loading && currentRides.length > 0 ? (
                    currentRides.map((ride) => {
                        const seatsBooked = Math.max(0, (ride.totalSeats || 0) - (ride.availableSeats || 0));
                        const bookedFromBookings = bookingsByRide.get(ride.id) || seatsBooked;
                        const rideBookings = bookings.filter((b) => b.rideId === ride.id);
                        return (
                            <div key={ride.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                {/* Ride Header */}
                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                                    <span className="text-xs font-bold px-2 py-1 rounded bg-blue-100 text-blue-700">{ride.status}</span>
                                    <span className="text-sm font-bold text-gray-900">{ride.origin?.city} → {ride.destination?.city}</span>
                                </div>

                                {/* Ride Details */}
                                <div className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                            <Calendar size={14} />
                                            <span>{ride.departureDate || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                            <Clock size={14} />
                                            <span>{ride.departureTime || 'N/A'}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-sm text-gray-600 border-t border-gray-100 pt-3">
                                        <div className="flex items-center gap-1">
                                            <Users size={14} />
                                            <span>{bookedFromBookings}/{ride.totalSeats || ride.vehicle?.seats || 0} Booked</span>
                                        </div>
                                        <div className="text-xs text-gray-500">Ride ID: {ride.id}</div>
                                    </div>

                                    {activeTab === 'upcoming' && (
                                        <div className="mt-3 border-t border-gray-100 pt-3 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => handleCancelRide(ride.id)}
                                                disabled={cancellingRideId === ride.id}
                                                className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-60"
                                            >
                                                {cancellingRideId === ride.id ? 'Cancelling...' : 'Cancel Ride'}
                                            </button>
                                        </div>
                                    )}

                                    {rideBookings.length > 0 && (
                                        <div className="mt-3 border-t border-gray-100 pt-3">
                                            <div className="text-xs font-semibold text-gray-600 mb-2">Bookings</div>
                                            <div className="space-y-2">
                                                {rideBookings.map((booking) => (
                                                    <div key={booking.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                                                        <div>
                                                            <div className="font-semibold text-gray-800">{booking.passenger?.name || 'Passenger'}</div>
                                                            <div className="text-[10px] text-gray-500">{booking.status}</div>
                                                        </div>
                                                        <div className="text-[10px] text-gray-500">{booking.seatsBooked} seat(s)</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : !loading && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                            <List size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">No rides found</h3>
                        <p className="text-gray-500 text-sm mt-1">There are no {activeTab} rides to show.</p>
                    </div>
                )}
            </div>

            <ProviderBottomNav />
        </div>
    );
}
