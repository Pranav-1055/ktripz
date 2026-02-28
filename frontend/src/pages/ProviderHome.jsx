import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';
import { bookingService } from '../services/bookingService';
import { rideService } from '../services/rideService';
import { socketService } from '../services/socket';
import {
    Bell,
    MapPin,
    User,
    LogOut,
    ChevronDown,
    PlusCircle,
    Clock,
    Users,
    Bus
} from 'lucide-react';
import ProviderBottomNav from '../components/layout/ProviderBottomNav';
import { getAuth } from "firebase/auth";

export default function ProviderHome() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [rides, setRides] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            if (firebaseUser) {
                setUser({
                    displayName: firebaseUser.displayName || 'Provider',
                    photoURL: firebaseUser.photoURL,
                    uid: firebaseUser.uid
                });

                try {
                    // Fetch full profile from backend
                    const response = await authService.getProfile();
                    if (response.data && response.data.user) {
                        setUserProfile(response.data.user);
                        // Update display name if available in profile but not in auth
                        if (!firebaseUser.displayName && response.data.user.profile?.name) {
                            setUser(prev => ({ ...prev, displayName: response.data.user.profile.name }));
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch user profile", err);
                }
            } else {
                navigate('/login');
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        const loadProviderData = async () => {
            try {
                const [ridesList, bookingsRes] = await Promise.all([
                    rideService.getProviderRides(),
                    bookingService.listBookings({ role: 'driver' })
                ]);
                setRides(Array.isArray(ridesList) ? ridesList : []);
                setBookings(bookingsRes?.data?.bookings || []);
            } catch (error) {
                console.error('Failed to load provider data', error);
                setRides([]);
                setBookings([]);
            } finally {
                setLoadingData(false);
            }
        };
        loadProviderData();
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
                const [ridesList, bookingsRes] = await Promise.all([
                    rideService.getProviderRides(),
                    bookingService.listBookings({ role: 'driver' })
                ]);
                setRides(Array.isArray(ridesList) ? ridesList : []);
                setBookings(bookingsRes?.data?.bookings || []);
            } catch (error) {
                console.error('Failed to refresh provider data', error);
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

    const getLocationString = () => {
        if (!userProfile?.location) return 'Pune, India';
        const { city, state } = userProfile.location;
        if (city && state) return `${city}, ${state}`;
        const { district, country } = userProfile.location;
        if (district) return `${district}, ${country || 'India'}`;
        return userProfile.location.address || 'Pune, India';
    };

    const handleLogout = async () => {
        try {
            await authService.logout();
            navigate('/login', { replace: true });
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const handleScheduleRide = () => {
        navigate('/schedule-ride');
    };

    const bookingsByRide = useMemo(() => {
        const map = new Map();
        bookings.forEach((booking) => {
            if (!booking.rideId) return;
            const current = map.get(booking.rideId) || 0;
            map.set(booking.rideId, current + (booking.seatsBooked || 0));
        });
        return map;
    }, [bookings]);

    const upcomingRides = useMemo(() => {
        return rides.filter((ride) => ride.status === 'published');
    }, [rides]);

    const totalPassengers = useMemo(() => {
        return bookings.reduce((sum, booking) => sum + (booking.seatsBooked || 0), 0);
    }, [bookings]);

    const quickStats = [
        { icon: Users, label: 'Passengers', value: String(totalPassengers), color: 'bg-blue-100 text-blue-600' },
        { icon: Bus, label: 'Trips', value: String(rides.length), color: 'bg-green-100 text-green-600' },
        { icon: Clock, label: 'Upcoming', value: String(upcomingRides.length), color: 'bg-purple-100 text-purple-600' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Header */}
            <header className="bg-white p-4 sticky top-0 z-10 shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{user?.displayName || 'Provider'}</h1>
                        <div className="flex items-center text-blue-600 mt-1 cursor-pointer">
                            <MapPin size={16} className="mr-1" />
                            <span className="text-sm font-medium">{getLocationString()}</span>
                            <span className="ml-1">▼</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="p-2 bg-gray-100 rounded-full relative">
                            <Bell size={20} className="text-gray-700" />
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setShowProfileMenu(!showProfileMenu)}
                                className="flex items-center gap-2 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                            >
                                <User size={20} className="text-gray-700" />
                                <ChevronDown size={14} className="text-gray-700" />
                            </button>

                            {showProfileMenu && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-fade-in">
                                    <div className="px-4 py-3 border-b border-gray-100">
                                        <p className="text-sm font-bold text-gray-900">{userProfile?.profile?.name || user?.displayName || 'Provider'}</p>
                                        <p className="text-xs text-gray-500 truncate">{userProfile?.email || 'user@example.com'}</p>
                                        <button
                                            onClick={() => navigate('/profile')}
                                            className="text-xs text-blue-600 font-medium mt-1 hover:underline"
                                        >
                                            View Profile
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        <LogOut size={16} />
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <div className="p-4 space-y-6">

                {/* Introduction / Call to Action */}
                <div className="bg-gradient-to-r from-blue-900 to-blue-700 rounded-2xl p-5 text-white shadow-lg">
                    <h2 className="text-xl font-bold mb-2">Ready to drive?</h2>
                    <p className="text-blue-100 mb-4 text-sm">Schedule your next ride and start earning.</p>
                    <div className="flex gap-3">
                        <button
                            onClick={handleScheduleRide}
                            className="bg-white text-blue-900 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors"
                        >
                            Create New Ride
                        </button>
                        <button
                            onClick={() => navigate('/create-ride-from-route')}
                            className="bg-blue-800 border border-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors"
                        >
                            Create from Route
                        </button>
                    </div>
                </div>

                {/* Quick Stats */}
                <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Dashboard</h2>
                    <div className="grid grid-cols-3 gap-4">
                        {quickStats.map((stat, index) => (
                            <div key={index} className="flex flex-col items-center p-2 bg-white rounded-xl shadow-sm border border-gray-100">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${stat.color}`}>
                                    <stat.icon size={18} />
                                </div>
                                <span className="text-lg font-bold text-gray-900">{stat.value}</span>
                                <span className="text-[10px] font-medium text-gray-500 text-center">{stat.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Upcoming Rides */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-900">Your Upcoming Rides</h2>
                        <button className="text-blue-600 text-sm font-medium" onClick={() => navigate('/my-rides')}>View all</button>
                    </div>

                    <div className="space-y-4">
                        {loadingData && (
                            <div className="text-center py-8 text-gray-500 text-sm bg-white rounded-2xl border border-dashed border-gray-300">
                                Loading rides...
                            </div>
                        )}
                        {!loadingData && upcomingRides.map((ride) => {
                            const seatsBooked = Math.max(0, (ride.totalSeats || 0) - (ride.availableSeats || 0));
                            const bookedFromBookings = bookingsByRide.get(ride.id) || seatsBooked;
                            return (
                                <div key={ride.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-bl-xl">
                                        Scheduled
                                    </div>

                                    <h3 className="text-lg font-bold text-gray-900 mb-1">{ride.origin?.city} → {ride.destination?.city}</h3>
                                    <p className="text-gray-500 text-sm mb-3 flex items-center gap-1">
                                        <Clock size={14} /> {ride.departureDate}, {ride.departureTime}
                                    </p>

                                    <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Users size={16} />
                                            <span>{bookedFromBookings}/{ride.totalSeats || ride.vehicle?.seats || 0} Booked</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {!loadingData && upcomingRides.length === 0 && (
                            <div className="text-center py-8 text-gray-500 text-sm bg-white rounded-2xl border border-dashed border-gray-300">
                                No upcoming rides scheduled.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Floating Action Button for Schedule Ride */}
            <button
                onClick={handleScheduleRide}
                className="fixed bottom-24 right-4 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-all z-20 flex items-center gap-2 group"
            >
                <PlusCircle size={24} />
                <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap font-bold">Schedule Ride</span>
            </button>

            {/* Bottom Navigation */}
            <ProviderBottomNav />
        </div>
    );
}
