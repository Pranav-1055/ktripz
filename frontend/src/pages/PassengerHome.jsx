import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Input } from '../components/Input';
import { authService } from '../services/auth';
import { rideService } from '../services/rideService';
import { socketService } from '../services/socket';
import {
    Search,
    Bell,
    MapPin,
    Users,
    ChevronDown,
    ChevronUp,
    LogOut,
    User,
    Clock,
    Calendar,
    Star,
    Bus,
    Car
} from 'lucide-react';
import PassengerBottomNav from '../components/layout/PassengerBottomNav';

export default function PassengerHome() {
    const navigate = useNavigate();
    const [showOptions, setShowOptions] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [searchParams, setSearchParams] = useState({
        from: '',
        to: '',
        date: '',
        time: ''
    });
    const [fromCoords, setFromCoords] = useState(null);
    const [toCoords, setToCoords] = useState(null);
    const [fromSuggestions, setFromSuggestions] = useState([]);
    const [toSuggestions, setToSuggestions] = useState([]);

    const [activeTab, setActiveTab] = useState('recommended'); // 'recommended' | 'all'
    const [allRides, setAllRides] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Initial load: Profile & Default "All Rides" (for the tab)
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Profile
                const profileRes = await authService.getProfile();
                if (profileRes.data && profileRes.data.user) {
                    setUser(profileRes.data.user);
                }

                // Initial fill for "All Rides" (empty search = getAll)
                const rides = await rideService.searchRides({});
                setAllRides(rides);
            } catch (error) {
                console.error('Failed to fetch initial data', error);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, []);

    const handleSearch = async () => {
        setIsSearching(true);
        // Switch to "All Rides" tab implicitly when searching
        setActiveTab('all');
        try {
            const results = await rideService.searchRides({
                ...searchParams,
                originCoords: fromCoords,
                destinationCoords: toCoords,
                optimizeRoute: Boolean(fromCoords && toCoords)
            });
            setAllRides(results);
        } catch (error) {
            console.error('Search failed', error);
        } finally {
            setIsSearching(false);
        }
    };

    const searchAddress = async (query, setSuggestions) => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }
        try {
            const response = await fetch(`https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(query)}&api_key=${import.meta.env.VITE_OLA_MAPS_API_KEY}`);
            const data = await response.json();
            if (data.status === 'ok') {
                const results = data.predictions.map(p => ({
                    name: p.description,
                    placeId: p.place_id
                }));
                setSuggestions(results);
            } else {
                setSuggestions([]);
            }
        } catch (e) {
            console.error('Autocomplete error', e);
            setSuggestions([]);
        }
    };

    const handleSelectLocation = async (item, type) => {
        try {
            const response = await fetch(`https://api.olamaps.io/places/v1/details?place_id=${item.placeId}&api_key=${import.meta.env.VITE_OLA_MAPS_API_KEY}`);
            const data = await response.json();
            if (data.status !== 'ok') return;

            const location = data.result.geometry.location;
            const coords = { lat: location.lat, lng: location.lng };
            const addressName = data.result.name || data.result.formatted_address || item.name;

            if (type === 'from') {
                setSearchParams(prev => ({ ...prev, from: addressName }));
                setFromCoords(coords);
                setFromSuggestions([]);
            } else {
                setSearchParams(prev => ({ ...prev, to: addressName }));
                setToCoords(coords);
                setToSuggestions([]);
            }
        } catch (e) {
            console.error('Place Details error', e);
        }
    };

    const recommendedRides = useMemo(() => allRides.slice(0, 3), [allRides]);

    const getUserName = () => {
        if (user?.displayName) return user.displayName.split(' ')[0];
        if (user?.profile?.name) return user.profile.name.split(' ')[0];
        if (user?.email) return user.email.split('@')[0];
        return 'Traveler';
    };

    const getLocationString = () => {
        if (!user?.location) return 'Pune, India';
        const { city, state } = user.location;
        if (city && state) return `${city}, ${state}`;
        return user.location.address || 'Pune, India';
    };

    const handleLogout = async () => {
        try {
            await authService.logout();
            navigate('/login', { replace: true });
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const RideCard = ({ ride }) => (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        {ride.type === 'Bus' || ride.vehicle?.category === 'Bus' ? <Bus size={20} /> : <Car size={20} />}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 leading-tight">
                            {typeof ride.source === 'object' ? ride.source.city : ride.source || ride.origin?.city} →
                            {typeof ride.destination === 'object' ? ride.destination.city : ride.destination || ride.destination?.city}
                        </h3>
                        <div className="flex items-center gap-1 text-sm text-yellow-500">
                            <Star size={14} fill="currentColor" />
                            <span className="font-medium text-gray-700">{ride.rating || ride.driver?.rating || 'New'}</span>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-md">
                        {ride.type || ride.vehicle?.category || 'Ride'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
                <div>
                    <p className="text-xs text-gray-400">Number Plate</p>
                    <p className="text-sm font-medium text-gray-700">{ride.vehicleNumber || ride.vehicle?.number || 'N/A'}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-400">Date & Time</p>
                    <p className="text-sm font-medium text-gray-700">{ride.date || ride.departureDate}, {ride.time || ride.departureTime}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-400">Price/KM</p>
                    <p className="text-sm font-bold text-gray-900">{ride.currency || '₹'}{ride.pricePerKm || ride.pricePerSeat}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-400">Seats Available</p>
                    <p className="text-sm font-medium text-gray-700">
                        <span className="text-green-600 font-bold">{ride.seatsAvailable || ride.availableSeats}</span>
                        <span className="text-gray-400"> / {ride.totalSeats || ride.vehicle?.seats}</span>
                    </p>
                </div>
                <div className="col-span-2 flex justify-end pt-1 border-t border-gray-200 mt-1">
                    <div className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12} /> Duration: {ride.duration || 'Flexible'}</div>
                </div>
            </div>

            <button
                onClick={() => navigate(`/ride/${ride.id}`, { state: { ride } })}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-blue-200 shadow-lg"
            >
                View Details
            </button>
        </div>
    );

    useEffect(() => {
        const rideIds = allRides.map(r => r.id).filter(Boolean);
        if (rideIds.length === 0) return;

        const handleRideUpdate = (payload) => {
            if (!payload?.rideId || payload.availableSeats === undefined) return;
            setAllRides((prev) => prev.map((ride) => (
                ride.id === payload.rideId ? { ...ride, availableSeats: payload.availableSeats } : ride
            )));
        };

        rideIds.forEach((rideId) => socketService.joinRide(rideId));
        socketService.on('ride_updated', handleRideUpdate);

        return () => {
            socketService.off('ride_updated', handleRideUpdate);
            rideIds.forEach((rideId) => socketService.leaveRide(rideId));
        };
    }, [allRides]);

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <header className="bg-white p-4 sticky top-0 z-10 transition-shadow shadow-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Hello, {getUserName()}</h1>
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
                                {user?.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                    <User size={20} className="text-gray-700" />
                                )}
                                <ChevronDown size={14} className="text-gray-700" />
                            </button>

                            {showProfileMenu && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-fade-in">
                                    <div className="px-4 py-3 border-b border-gray-100">
                                        <p className="text-sm font-bold text-gray-900">{user?.displayName || 'User'}</p>
                                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
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

            <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
                {/* Search Bar */}
                <div className="bg-white p-4 rounded-2xl shadow-sm transition-all duration-300">
                    {!showOptions ? (
                        <div
                            className="bg-gray-100 p-3 rounded-xl flex items-center text-gray-500 mb-4 cursor-pointer"
                            onClick={() => setShowOptions(true)}
                        >
                            <Search size={20} className="mr-3" />
                            <span className="text-base">Where do you want to go?</span>
                        </div>
                    ) : (
                        <div className="space-y-3 mb-4 animate-fade-in">
                            <div className="relative mb-3">
                                <div className="relative">
                                    <input
                                        className="w-full h-10 bg-[#F1F5F9] border-2 border-transparent rounded-xl px-4 text-sm text-text-dark transition-all duration-200 focus:outline-none focus:bg-white focus:border-primary focus:shadow-[0_0_0_4px_rgba(13,59,120,0.1)] placeholder:text-text-soft/50 pl-12"
                                        placeholder="From location"
                                        value={searchParams.from}
                                        onChange={(e) => {
                                            setSearchParams({ ...searchParams, from: e.target.value });
                                            setFromCoords(null);
                                            searchAddress(e.target.value, setFromSuggestions);
                                        }}
                                    />
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-soft pointer-events-none">
                                        <MapPin size={20} />
                                    </div>
                                </div>
                                <div className="mt-1 text-[10px] text-gray-400">Select a suggestion to confirm location.</div>
                                {fromSuggestions.length > 0 && (
                                    <div className="absolute z-50 w-full bg-white shadow-xl rounded-xl mt-1 border border-gray-100 max-h-48 overflow-y-auto">
                                        {fromSuggestions.map((item, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => handleSelectLocation(item, 'from')}
                                                className="p-3 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-50 last:border-0"
                                            >
                                                {item.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="relative mb-3">
                                <div className="relative">
                                    <input
                                        className="w-full h-10 bg-[#F1F5F9] border-2 border-transparent rounded-xl px-4 text-sm text-text-dark transition-all duration-200 focus:outline-none focus:bg-white focus:border-primary focus:shadow-[0_0_0_4px_rgba(13,59,120,0.1)] placeholder:text-text-soft/50 pl-12"
                                        placeholder="To location"
                                        value={searchParams.to}
                                        onChange={(e) => {
                                            setSearchParams({ ...searchParams, to: e.target.value });
                                            setToCoords(null);
                                            searchAddress(e.target.value, setToSuggestions);
                                        }}
                                    />
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-soft pointer-events-none">
                                        <MapPin size={20} />
                                    </div>
                                </div>
                                <div className="mt-1 text-[10px] text-gray-400">Select a suggestion to confirm location.</div>
                                {toSuggestions.length > 0 && (
                                    <div className="absolute z-50 w-full bg-white shadow-xl rounded-xl mt-1 border border-gray-100 max-h-48 overflow-y-auto">
                                        {toSuggestions.map((item, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => handleSelectLocation(item, 'to')}
                                                className="p-3 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-50 last:border-0"
                                            >
                                                {item.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Input
                                    type="date"
                                    icon={Calendar}
                                    value={searchParams.date}
                                    onChange={(e) => setSearchParams({ ...searchParams, date: e.target.value })}
                                    className="h-10 text-sm"
                                    containerClassName="mb-0 w-full"
                                />
                                <Input
                                    type="time"
                                    icon={Clock}
                                    value={searchParams.time}
                                    onChange={(e) => setSearchParams({ ...searchParams, time: e.target.value })}
                                    className="h-10 text-sm"
                                    containerClassName="mb-0 w-full"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-0">
                        <div
                            className="flex items-center text-gray-500 text-sm cursor-pointer select-none w-full sm:w-auto"
                            onClick={() => setShowOptions(!showOptions)}
                        >
                            {showOptions ? (
                                <>
                                    <ChevronUp size={16} className="mr-2" /> Less options
                                </>
                            ) : (
                                <>
                                    <ChevronDown size={16} className="mr-2" /> More options
                                </>
                            )}
                        </div>
                        <button
                            className="w-full sm:w-auto bg-blue-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-blue-800 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-70"
                            onClick={handleSearch}
                            disabled={isSearching}
                        >
                            {isSearching ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('recommended')}
                        className={`pb-2 font-semibold text-sm transition-colors relative ${activeTab === 'recommended' ? 'text-blue-900' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Recommended for you
                        {activeTab === 'recommended' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-900 rounded-t-full"></div>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`pb-2 font-semibold text-sm transition-colors relative ${activeTab === 'all' ? 'text-blue-900' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        All Rides
                        {activeTab === 'all' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-900 rounded-t-full"></div>
                        )}
                    </button>
                </div>

                {/* Content */}
                <div className="space-y-4">
                    {activeTab === 'recommended' ? (
                        <>
                            {recommendedRides.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    <Car size={48} className="mx-auto text-gray-300 mb-2" />
                                    <p>No recommended rides yet.</p>
                                </div>
                            )}
                            {recommendedRides.map((ride, index) => (
                                <RideCard key={`rec-${index}`} ride={ride} />
                            ))}
                        </>
                    ) : (
                        <>
                            {isSearching && <div className="text-center py-4">Searching...</div>}
                            {!isSearching && allRides.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    <Car size={48} className="mx-auto text-gray-300 mb-2" />
                                    <p>No rides found matching your criteria.</p>
                                </div>
                            )}
                            {allRides.map((ride, index) => (
                                <RideCard key={`all-${index}`} ride={ride} />
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* Bottom Navigation */}
            <PassengerBottomNav />
        </div>
    );
}

