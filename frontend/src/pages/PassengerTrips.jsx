import React from 'react';
import { ArrowLeft, Clock, MapPin, Search, Filter, Calendar, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PassengerBottomNav from '../components/layout/PassengerBottomNav';

export default function PassengerTrips() {
    const navigate = useNavigate();

    // Static data for past trips
    const trips = [
        { id: 101, from: 'Pune', to: 'Mumbai', date: '10 Jan 2024', time: '08:00 AM', cost: 450, rating: 5, status: 'Completed', type: 'Bus' },
        { id: 102, from: 'Mumbai', to: 'Pune', date: '05 Jan 2024', time: '06:30 PM', cost: 1200, rating: 4, status: 'Completed', type: 'Cab' },
        { id: 103, from: 'Pune', to: 'Lonavala', date: '20 Dec 2023', time: '09:00 AM', cost: 300, rating: 5, status: 'Completed', type: 'Shared' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Header */}
            <div className="bg-white sticky top-0 z-10 shadow-sm p-4">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
                        <ArrowLeft size={20} className="text-gray-700" />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">Ride History</h1>
                </div>
            </div>

            {/* Ride List */}
            <div className="p-4 space-y-4">
                {trips.length > 0 ? (
                    trips.map((trip) => (
                        <div key={trip.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-gray-900">{trip.date}</span>
                                        <span className="text-sm text-gray-500">• {trip.time}</span>
                                    </div>
                                    <span className="text-lg font-bold text-gray-900">₹{trip.cost}</span>
                                </div>

                                <div className="flex items-center gap-4 mb-3">
                                    <div className="flex flex-col items-center">
                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                                        <div className="w-0.5 h-6 bg-gray-200 my-1"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{trip.from}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{trip.to}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                                    <span className={`text-xs font-bold px-2 py-1 rounded bg-green-100 text-green-700`}>
                                        {trip.status}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star
                                                key={i}
                                                size={14}
                                                className={`${i < trip.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-12 text-gray-500">
                        No previous trips found.
                    </div>
                )}
            </div>

            <PassengerBottomNav />
        </div>
    );
}
