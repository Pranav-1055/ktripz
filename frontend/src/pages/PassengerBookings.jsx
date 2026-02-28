import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Calendar, Bus, Car, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import PassengerBottomNav from '../components/layout/PassengerBottomNav';

export default function PassengerBookings() {
    const navigate = useNavigate();
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadBookings = async () => {
            try {
                const response = await bookingService.listBookings({ role: 'passenger' });
                const list = response?.data?.bookings || [];
                setBookings(list);
            } catch (error) {
                console.error('Failed to load bookings', error);
                setBookings([]);
            } finally {
                setLoading(false);
            }
        };
        loadBookings();
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Header */}
            <div className="bg-white sticky top-0 z-10 shadow-sm p-4">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
                        <ArrowLeft size={20} className="text-gray-700" />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">Upcoming Bookings</h1>
                </div>
            </div>

            {/* Bookings List */}
            <div className="p-4 space-y-4">
                {loading && (
                    <div className="text-center py-12 text-gray-500">
                        Loading bookings...
                    </div>
                )}
                {!loading && bookings.length > 0 ? (
                    bookings.map((booking) => (
                        <div
                            key={booking.id}
                            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative cursor-pointer"
                            onClick={() => navigate(`/booking/${booking.id}`)}
                        >
                            <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold rounded-bl-xl ${booking.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                {booking.status}
                            </div>

                            <div className="p-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                        {booking.ride?.vehicle?.type === 'bus' ? <Bus size={20} /> : booking.ride?.vehicle?.type === 'car' ? <Car size={20} /> : <Users size={20} />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{booking.ride?.vehicle?.make || 'Ride'}</p>
                                        <p className="text-xs text-gray-500">Booking ID: {booking.id}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 mb-4">
                                    <div className="flex flex-col items-center">
                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                                        <div className="w-0.5 h-8 bg-gray-200 my-1"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                                    </div>
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{booking.ride?.origin?.city || 'Origin'}</p>
                                            {booking.pickupPoint && (
                                                <p className="text-xs text-gray-500">Pickup: {booking.pickupPoint}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{booking.ride?.destination?.city || 'Destination'}</p>
                                            {booking.dropoffPoint && (
                                                <p className="text-xs text-gray-500">Drop-off: {booking.dropoffPoint}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 text-sm text-gray-600 border-t border-gray-100 pt-3">
                                    <div className="flex items-center gap-1">
                                        <Calendar size={16} />
                                        <span>{booking.ride?.departureDate || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock size={16} />
                                        <span>{booking.ride?.departureTime || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : !loading && (
                    <div className="text-center py-12 text-gray-500">
                        No upcoming bookings.
                    </div>
                )}
            </div>

            <PassengerBottomNav />
        </div>
    );
}
