import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { authService } from '../services/auth';
import { bookingService } from '../services/bookingService';
import { rideService } from '../services/rideService';
import { socketService } from '../services/socket';
import {
    ArrowLeft,
    Star,
    Phone,
    MessageCircle,
    Info,
    Share2,
    ShieldCheck
} from 'lucide-react';

export default function RideDetails() {
    const location = useLocation();
    const navigate = useNavigate();
    const { id } = useParams();
    const [rideData, setRideData] = useState(location.state?.ride || null);
    const [loading, setLoading] = useState(true);
    const [seatsToBook, setSeatsToBook] = useState(1);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [pickupPoint, setPickupPoint] = useState('');
    const [dropoffPoint, setDropoffPoint] = useState('');

    const passedRide = rideData;

    const getLocationText = (value, fallback) => {
        if (!value) return fallback;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return fallback;
            if (trimmed.startsWith('ride/') || trimmed.startsWith('ride-') || trimmed.includes('mock-')) {
                return fallback;
            }
            return trimmed;
        }
        if (typeof value === 'object') {
            return value.name || value.city || fallback;
        }
        return fallback;
    };

    const sourceText = getLocationText(passedRide?.source || passedRide?.origin, 'Mumbai');
    const destinationText = getLocationText(passedRide?.destination || passedRide?.destination?.city, 'Pune');

    const stopOptions = useMemo(() => {
        const options = [];
        const seen = new Set();
        const addOption = (label) => {
            if (!label) return;
            const key = label.trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            options.push({ value: key, label: key });
        };

        addOption(getLocationText(passedRide?.origin || passedRide?.source, ''));
        addOption(getLocationText(passedRide?.destination, ''));

        const intermediateStops = []
            .concat(passedRide?.intermediateStops || [])
            .concat(passedRide?.routeInfo?.originalRoute?.stops || [])
            .concat(passedRide?.route?.stops || []);

        intermediateStops.forEach((stop) => {
            if (typeof stop === 'string') {
                addOption(stop);
                return;
            }
            addOption(stop?.name || stop?.city || stop?.address);
        });

        return options;
    }, [passedRide]);

    const vehicleMake = passedRide?.vehicle?.make || '';
    const vehicleModel = passedRide?.vehicle?.model || '';
    const vehicleName = (vehicleMake || vehicleModel) ? `${vehicleMake} ${vehicleModel}`.trim() : (passedRide?.vehicleModel || 'Swift Dzire or similar');

    const ride = useMemo(() => ({
        id: passedRide?.id || id,
        source: sourceText,
        destination: destinationText,
        date: passedRide?.date || passedRide?.departureDate || 'Today',
        time: passedRide?.time || passedRide?.departureTime || '6:00 AM',
        duration: passedRide?.duration || passedRide?.route?.estimatedDuration || '3h 30m',

        // Vehicle & Driver
        vehicleName,
        vehicleNumber: passedRide?.vehicleNumber || passedRide?.vehicle?.number || 'MH 12 AB 1234',
        vehicleColor: passedRide?.vehicle?.color || 'White',
        seatsAvailable: passedRide?.seatsAvailable || passedRide?.availableSeats || 4,
        amenities: passedRide?.vehicle?.amenities?.length ? passedRide.vehicle.amenities : ['AC', '4 Seats'],

        driver: {
            name: passedRide?.driver?.name || 'Rajesh Kumar',
            rating: passedRide?.driver?.rating || '4.8',
            verified: true,
            contact: '+91 98765 43210'
        },

        // Pricing
        currency: passedRide?.currency || '₹',
        basePrice: passedRide?.pricePerSeat || 3131.31,
        gst: 156.50, // Mock 5%
        platformFee: 50.00,

        get totalPrice() {
            return (this.basePrice + this.gst + this.platformFee).toFixed(2);
        }
    }), [passedRide, id, sourceText, destinationText, vehicleName]);

    useEffect(() => {
        const loadRide = async () => {
            if (!id) {
                setLoading(false);
                return;
            }
            const freshRide = await rideService.getRideById(id);
            if (freshRide) {
                setRideData(freshRide);
            }
            setLoading(false);
        };
        loadRide();
    }, [id]);

    useEffect(() => {
        if (!id) return;
        const handleRideUpdate = (payload) => {
            if (!payload || payload.rideId !== id) return;
            if (payload.availableSeats === undefined) return;
            setRideData((prev) => prev ? { ...prev, availableSeats: payload.availableSeats } : prev);
        };

        socketService.joinRide(id);
        socketService.on('ride_updated', handleRideUpdate);

        return () => {
            socketService.off('ride_updated', handleRideUpdate);
            socketService.leaveRide(id);
        };
    }, [id]);

    useEffect(() => {
        const max = Math.max(1, ride.seatsAvailable || 1);
        setSeatsToBook((prev) => Math.min(Math.max(1, prev), max));
    }, [ride.seatsAvailable]);

    useEffect(() => {
        if (stopOptions.length === 0) return;
        const originDefault = stopOptions.find((option) => option.value === sourceText)?.value || stopOptions[0]?.value || '';
        const destinationDefault = stopOptions.find((option) => option.value === destinationText)?.value || stopOptions[stopOptions.length - 1]?.value || '';
        setPickupPoint((prev) => prev || originDefault);
        setDropoffPoint((prev) => prev || destinationDefault);
    }, [stopOptions, sourceText, destinationText]);

    const handleShareRide = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Ride with ${ride.driver.name}`,
                    text: `Check out this ride from ${ride.source} to ${ride.destination} on ${ride.date} at ${ride.time}.`,
                    url: window.location.href,
                });
            } catch (error) {
                console.log('Error sharing:', error);
            }
        } else {
            alert('Share feature is not supported in this browser.');
        }
    };

    const handleBookRide = async () => {
        const confirmed = window.confirm(`Confirm booking for ${ride.currency}${ride.basePrice} per seat?`);
        if (!confirmed) return;
        if (pickupPoint && dropoffPoint && pickupPoint === dropoffPoint) {
            alert('Pickup and drop-off points must be different.');
            return;
        }

        try {
            setBookingLoading(true);
            const token = await authService.getToken();
            if (!token) {
                alert('Please login to book a ride.');
                navigate('/login');
                return;
            }

            const payload = {
                rideId: ride.id,
                seatsBooked: seatsToBook,
                pickupPoint: pickupPoint || ride.source,
                dropoffPoint: dropoffPoint || ride.destination,
                passengerNotes: ''
            };

            const response = await bookingService.createBooking(payload);
            if (response?.error) {
                alert(response.error);
                return;
            }

            alert('Booking created successfully!');
            if (ride.id) {
                const refreshed = await rideService.getRideById(ride.id);
                if (refreshed) {
                    setRideData(refreshed);
                }
            }
        } catch (error) {
            console.error('Booking failed:', error);
            alert('Failed to book ride. Please try again.');
        } finally {
            setBookingLoading(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-white flex items-center justify-center">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-white pb-36 font-sans text-gray-900">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 sticky top-0 bg-white z-10">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <ArrowLeft size={24} className="text-gray-900" />
                </button>
                <h1 className="text-xl font-bold">Review ride</h1>

                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={handleShareRide}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
                    >
                        <Share2 size={20} />
                    </button>
                </div>
            </div>

            <div className="px-4 space-y-8">

                {/* 1. Route Section */}
                <div>
                    <h2 className="text-lg font-bold mb-4">One-way trip to {(ride.destination || '').split(' ')[0]}</h2>
                    <div className="flex gap-4 relative">
                        {/* Timeline Line */}
                        <div className="absolute left-[7px] top-6 bottom-8 w-0.5 bg-black"></div>

                        <div className="flex flex-col justify-between h-32 py-2">
                            {/* Source Dot */}
                            <div className="w-4 h-4 rounded-sm border-2 border-black bg-white z-10"></div>
                            {/* Dest Dot */}
                            <div className="w-4 h-4 rounded-sm bg-black z-10"></div>
                        </div>

                        <div className="flex flex-col justify-between h-32 pb-1">
                            <div>
                                <p className="text-xs text-gray-500 mb-0.5">Pick-up</p>
                                <h3 className="font-bold text-base leading-tight">{ride.source}</h3>
                                <p className="text-xs text-gray-400">{ride.time}, {ride.date}</p>
                                {stopOptions.length > 0 && (
                                    <div className="mt-2">
                                        <label className="text-[10px] uppercase tracking-wider text-gray-400">Select pickup</label>
                                        <select
                                            value={pickupPoint}
                                            onChange={(e) => setPickupPoint(e.target.value)}
                                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                                        >
                                            {stopOptions.map((option) => (
                                                <option key={`pickup-${option.value}`} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-0.5">Drop-off</p>
                                <h3 className="font-bold text-base leading-tight">{ride.destination}</h3>
                                <p className="text-xs text-gray-400">~ {ride.duration}</p>
                                {stopOptions.length > 0 && (
                                    <div className="mt-2">
                                        <label className="text-[10px] uppercase tracking-wider text-gray-400">Select drop-off</label>
                                        <select
                                            value={dropoffPoint}
                                            onChange={(e) => setDropoffPoint(e.target.value)}
                                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                                        >
                                            {stopOptions.map((option) => (
                                                <option key={`drop-${option.value}`} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <hr className="border-gray-100" />

                {/* 2. Vehicle & Driver Details */}
                <div>
                    <h2 className="text-lg font-bold mb-4">Driver & Vehicle</h2>

                    {/* Driver Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-600">
                                {ride.driver.name.charAt(0)}
                            </div>
                            <div>
                                <div className="flex items-center gap-1">
                                    <h3 className="font-bold text-base">{ride.driver.name}</h3>
                                    <ShieldCheck size={14} className="text-green-600" />
                                </div>
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                    <Star size={12} className="text-yellow-500" fill="currentColor" />
                                    <span>{ride.driver.rating} Rating</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <a href={`sms:${ride.driver.contact}`} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50">
                                <MessageCircle size={20} />
                            </a>
                            <a href={`tel:${ride.driver.contact}`} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50">
                                <Phone size={20} />
                            </a>
                        </div>
                    </div>

                    {/* Vehicle Card */}
                    <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm font-bold text-gray-900">{ride.vehicleName}</p>
                                <p className="text-xs text-gray-500">{ride.vehicleColor} • {ride.amenities.join(' • ')}</p>
                            </div>
                            <img src="https://cdn-icons-png.flaticon.com/512/3202/3202926.png" alt="Car" className="w-12 h-12 object-contain opacity-80" />
                        </div>
                        <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                            <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider">Number Plate</p>
                                <p className="font-mono font-medium text-gray-800">{ride.vehicleNumber}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-400 uppercase tracking-wider">Seats</p>
                                <p className="font-medium text-gray-800">{ride.seatsAvailable} Available</p>
                            </div>
                        </div>
                    </div>
                </div>

                <hr className="border-gray-100" />

                {/* 3. Price Breakdown */}
                <div>
                    <h2 className="text-lg font-bold mb-4">Price breakdown</h2>
                    <div className="flex items-center gap-1 text-sm text-gray-500 underline mb-4">
                        <Info size={14} />
                        Your charges explained
                    </div>

                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between text-gray-600">
                            <span>Base price</span>
                            <span>{ride.currency}{ride.basePrice}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>GST (5%)</span>
                            <span>{ride.currency}{ride.gst}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>Platform fee</span>
                            <span>{ride.currency}{ride.platformFee}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100 mt-2">
                            <span className="font-bold text-base text-gray-900">Total price</span>
                            <span className="font-bold text-xl text-gray-900">{ride.currency}{ride.totalPrice}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Action */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 shadow-lg safe-area-bottom flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-600">Seats to book</div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSeatsToBook((s) => Math.max(1, s - 1))}
                            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
                        >
                            -
                        </button>
                        <span className="w-6 text-center font-semibold">{seatsToBook}</span>
                        <button
                            onClick={() => setSeatsToBook((s) => Math.min(ride.seatsAvailable || 1, s + 1))}
                            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
                            disabled={seatsToBook >= (ride.seatsAvailable || 1)}
                        >
                            +
                        </button>
                    </div>
                    <div className="text-xs text-gray-500">Remaining: {ride.seatsAvailable}</div>
                </div>
                <button
                    onClick={handleBookRide}
                    disabled={bookingLoading || !ride.seatsAvailable}
                    className="w-full bg-black text-white py-3.5 rounded-xl font-bold text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {bookingLoading ? 'Booking...' : 'Book Ride'}
                </button>
                <div
                    onClick={handleShareRide}
                    className="flex items-center justify-center gap-2 text-gray-500 font-medium text-sm cursor-pointer hover:text-gray-900 transition-colors"
                >
                    <Share2 size={16} />
                    Share this ride
                </div>
            </div>
        </div>
    );
}
