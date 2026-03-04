import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Users, MapPin } from 'lucide-react';
import { bookingService } from '../services/bookingService';
import { socketService } from '../services/socket';

export default function BookingDetails() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [cancelLoading, setCancelLoading] = useState(false);

    useEffect(() => {
        const loadBooking = async () => {
            try {
                const response = await bookingService.getBookingById(id);
                setBooking(response?.data || response);
            } catch (error) {
                console.error('Failed to load booking', error);
            } finally {
                setLoading(false);
            }
        };
        loadBooking();
    }, [id]);

    useEffect(() => {
        if (!booking?.id) return;
        const handleStatusChange = (payload) => {
            if (!payload || payload.bookingId !== booking.id) return;
            setBooking((prev) => prev ? { ...prev, status: payload.status || prev.status } : prev);
        };

        socketService.joinBooking(booking.id);
        socketService.on('booking_status_changed', handleStatusChange);

        return () => {
            socketService.off('booking_status_changed', handleStatusChange);
            socketService.leaveBooking(booking.id);
        };
    }, [booking?.id]);

    const handleCancel = async () => {
        if (!booking?.id) return;
        const confirmed = window.confirm('Cancel this booking?');
        if (!confirmed) return;

        try {
            setCancelLoading(true);
            await bookingService.cancelBooking(booking.id, 'Cancelled by passenger');
            const refreshed = await bookingService.getBookingById(booking.id);
            setBooking(refreshed?.data || refreshed);
        } catch (error) {
            console.error('Cancel failed', error);
            alert('Failed to cancel booking.');
        } finally {
            setCancelLoading(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-white flex items-center justify-center">Loading...</div>;
    }

    if (!booking) {
        return <div className="min-h-screen bg-white flex items-center justify-center">Booking not found.</div>;
    }

    const canCancel = ['requested', 'confirmed'].includes(booking.status);

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <div className="bg-white sticky top-0 z-10 shadow-sm p-4">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
                        <ArrowLeft size={20} className="text-gray-700" />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">Booking Details</h1>
                </div>
            </div>

            <div className="p-4 space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold text-gray-900">Status</div>
                        <div className="text-xs font-bold uppercase text-blue-700">{booking.status}</div>
                    </div>
                    <div className="text-xs text-gray-500">Booking ID: {booking.id}</div>
                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-gray-700">
                        <MapPin size={16} />
                        <span className="text-sm font-semibold">{booking.ride?.origin?.city || 'Origin'} to {booking.ride?.destination?.city || 'Destination'}</span>
                    </div>
                    {(booking.pickupPoint || booking.dropoffPoint) && (
                        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600">
                            {booking.pickupPoint && (
                                <div>Pickup: <span className="font-medium text-gray-800">{booking.pickupPoint}</span></div>
                            )}
                            {booking.dropoffPoint && (
                                <div>Drop-off: <span className="font-medium text-gray-800">{booking.dropoffPoint}</span></div>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <Calendar size={16} />
                        <span>{booking.ride?.departureDate || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <Clock size={16} />
                        <span>{booking.ride?.departureTime || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <Users size={16} />
                        <span>{booking.seatsBooked} seat(s)</span>
                    </div>
                </div>
                {canCancel && (
                    <button
                        onClick={handleCancel}
                        disabled={cancelLoading}
                        className="w-full bg-red-600 text-white py-3 rounded-xl font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {cancelLoading ? 'Cancelling...' : 'Cancel Booking'}
                    </button>
                )}
            </div>
        </div>
    );
}


