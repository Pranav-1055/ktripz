import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User,
    ChevronRight,
    PlusCircle,
    CheckCircle,
    ShieldCheck,
    Car,
    AlertCircle,
    Hourglass,
    MapPin,
    Briefcase,
    FileText
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { api } from '../services/api';
import PassengerBottomNav from '../components/layout/PassengerBottomNav';
import ProviderBottomNav from '../components/layout/ProviderBottomNav';

export default function Profile() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('about');
    const [user, setUser] = useState(null);
    const [providerData, setProviderData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
            if (currentUser) {
                try {
                    // 1. Get token
                    const token = await currentUser.getIdToken();

                    // 2. Fetch full profile from backend (includes location)
                    const response = await api.get('/auth/profile', token);

                    const backendUser = response.data.user;
                    const role = (backendUser.role || 'passenger').toLowerCase();
                    const isProviderRole = role === 'transport_provider' || role === 'provider' || role === 'both';

                    setUser({
                        ...backendUser, // Use backend data as primary
                        displayName: backendUser.displayName || backendUser.profile?.name || currentUser.displayName || 'Traveler',
                        email: backendUser.email || currentUser.email,
                        phoneNumber: backendUser.phoneNumber || backendUser.profile?.phone || currentUser.phoneNumber || 'Not linked',
                        photoURL: backendUser.photoURL || backendUser.profile?.avatar || currentUser.photoURL,
                        role,
                        isEmailVerified: currentUser.emailVerified,
                        isPhoneVerified: !!(backendUser.phone || currentUser.phoneNumber),
                        isIdVerified: backendUser.verification?.identity || false,
                        uid: currentUser.uid,
                        // Location will directly come from backendUser.location
                        location: backendUser.location
                    });

                    // 3. If Provider, Fetch Provider Details
                    if (isProviderRole) {
                        try {
                            const providerResponse = await api.get('/transport-providers/profile', token);
                            if (providerResponse.data && providerResponse.data.provider) {
                                setProviderData(providerResponse.data.provider);
                            }
                        } catch (providerError) {
                            console.error("Failed to fetch provider details:", providerError);
                        }
                    }

                } catch (error) {
                    console.error("Failed to fetch backend profile:", error);
                    // Fallback to basic auth data
                    setUser({
                        displayName: currentUser.displayName || 'Traveler',
                        email: currentUser.email,
                        uid: currentUser.uid,
                        // ... other defaults
                    });
                }
            } else {
                setUser(null);
                setProviderData(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [navigate]);

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const auth = getAuth();
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

            const formData = new FormData();
            formData.append('image', file);

            // 1. Upload image to backend
            const uploadResponse = await api.post('/uploads/profile-image', formData, token);

            // Check if structure is success: true, data: { imageUrl: ... }
            const imageUrl = uploadResponse.data?.imageUrl || uploadResponse.imageUrl;

            if (!imageUrl) {
                throw new Error("Failed to get image URL from response");
            }

            // 2. Update user profile with new image URL
            if (auth.currentUser) {
                // Update Backend Profile
                await api.put('/auth/profile', { avatar: imageUrl }, token);

                // Update local state
                setUser(prev => ({ ...prev, photoURL: imageUrl }));
            }
            setUploading(false);

        } catch (error) {
            console.error("Error uploading image:", error);
            setUploading(false);
            // Optionally add error toast here
        }
    };

    if (loading) return <div className="min-h-screen bg-white flex items-center justify-center">Loading...</div>;

    const ProgressBar = ({ current, total }) => {
        const percentage = (current / total) * 100;
        return (
            <div className="h-1.5 w-full bg-gray-200 rounded-full mt-3 mb-4 overflow-hidden">
                <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
        );
    };

    const isProviderRole = user?.role === 'transport_provider' || user?.role === 'provider' || user?.role === 'both';

    return (
        <div className="min-h-screen bg-white pb-24 font-sans text-gray-900">
            {/* Top Tabs */}
            <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
                <button
                    onClick={() => setActiveTab('about')}
                    className={`flex-1 py-4 text-sm font-semibold relative ${activeTab === 'about' ? 'text-blue-900' : 'text-gray-500'
                        }`}
                >
                    About you
                    {activeTab === 'about' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-900 rounded-t-full"></div>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('account')}
                    className={`flex-1 py-4 text-sm font-semibold relative ${activeTab === 'account' ? 'text-blue-900' : 'text-gray-500'
                        }`}
                >
                    Account
                    {activeTab === 'account' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-900 rounded-t-full"></div>
                    )}
                </button>
            </div>

            <div className="px-4 py-6 space-y-8">
                {activeTab === 'about' ? (
                    <>
                        {/* Profile Header */}
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-full bg-gray-200 overflow-hidden shrink-0 border-2 border-white shadow-sm">
                                    {user?.photoURL ? (
                                        <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-full h-full p-4 text-gray-400 bg-gray-100" />
                                    )}
                                </div>
                                <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-1.5 rounded-full cursor-pointer shadow-md hover:bg-blue-700 transition-colors">
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                    />
                                    {/* <camera> tag removed as it is not a valid HTML/React element */}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                </label>
                            </div>
                            <div className="flex-1">
                                <h1 className="text-2xl font-bold text-gray-900">{user?.displayName}</h1>
                                <p className="text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
                            </div>
                            <ChevronRight className="text-gray-400" />
                        </div>

                        <hr className="border-gray-100" />

                        {/* Verify your profile */}
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 mb-6">Verify your profile</h2>
                            <div className="space-y-6">


                                {/* Email */}
                                <div className="flex items-start gap-3">
                                    {user?.isEmailVerified ? (
                                        <CheckCircle className="text-blue-500" size={24} />
                                    ) : (
                                        <PlusCircle className="text-blue-500 mt-0.5" size={24} />
                                    )}
                                    <div className="flex-1">
                                        <p className={user?.isEmailVerified ? "text-gray-900" : "text-blue-600 font-medium"}>
                                            Confirm email
                                        </p>
                                        <p className="text-blue-600 text-sm">{user?.email}</p>
                                    </div>
                                </div>

                                {/* Phone */}
                                <div className="flex items-center gap-3">
                                    {user?.isPhoneVerified ? (
                                        <CheckCircle className="text-blue-500" size={24} />
                                    ) : (
                                        <PlusCircle className="text-blue-500" size={24} />
                                    )}
                                    <div className="flex-1">
                                        <span className="text-gray-500">{user?.phoneNumber}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <hr className="border-gray-100" />

                        {/* Address Details */}
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 mb-6">Address Details</h2>
                            {user?.location ? (
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                                            <MapPin size={16} />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400">Current Address</p>
                                            <p className="text-sm font-medium text-gray-700 mt-1 leading-relaxed">
                                                {[
                                                    user.location.street,
                                                    user.location.wb_wadi, // Assuming 'wadi' might be stored
                                                    user.location.village,
                                                    user.location.city,
                                                    user.location.district,
                                                    user.location.state,
                                                    user.location.country,
                                                    user.location.zipCode
                                                ]
                                                    .filter(Boolean)
                                                    .join(', ') || 'No address details provided'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-gray-500 italic flex items-center gap-2">
                                    <PlusCircle size={16} className="text-blue-500" />
                                    <span className="text-blue-600 font-medium">Add address details</span>
                                </div>
                            )}
                        </div>

                        {/* Provider Specific Details */}
                        {providerData && (
                            <>
                                <hr className="border-gray-100" />
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 mb-6">Provider Details</h2>
                                    <div className="space-y-6">

                                        {/* Business Info */}
                                        {providerData.businessInfo && (
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                                                    <Briefcase size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-400">Business</p>
                                                    <p className="text-sm font-medium text-gray-900 mt-1">{providerData.businessInfo.businessName || 'Business Name Not Set'}</p>
                                                    {providerData.businessInfo.licenseNumber && (
                                                        <p className="text-xs text-gray-500 mt-1">License: {providerData.businessInfo.licenseNumber}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Fleet Info (Showing first vehicle for now) */}
                                        {providerData.fleetInfo && providerData.fleetInfo.vehicles && providerData.fleetInfo.vehicles.length > 0 && (
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                                                    <Car size={16} />
                                                </div>
                                                <div className="w-full">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className="text-xs text-gray-400">Primary Vehicle</p>
                                                            <p className="text-sm font-medium text-gray-900 mt-1">
                                                                {providerData.fleetInfo.vehicles[0].name}
                                                                <span className="text-gray-400 font-normal ml-2">({providerData.fleetInfo.vehicles[0].color})</span>
                                                            </p>
                                                            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide bg-gray-100 inline-block px-1.5 py-0.5 rounded">
                                                                {providerData.fleetInfo.vehicles[0].plate}
                                                            </p>
                                                        </div>
                                                        <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-full capitalize">
                                                            {providerData.fleetInfo.vehicles[0].type?.replace('_', ' ')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Documents */}
                                        {providerData.verification && providerData.verification.documents && (
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                                                    <FileText size={16} />
                                                </div>
                                                <div className="w-full">
                                                    <p className="text-xs text-gray-400">Documents</p>
                                                    {providerData.verification.documents.drivingLicense && (
                                                        <div className="mt-2 border border-gray-100 rounded-lg p-3 bg-gray-50">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-sm font-medium text-gray-700">Driving License</span>
                                                                {providerData.verification.documents.drivingLicense.verified ? (
                                                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                        <CheckCircle size={10} /> Verified
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                        <Hourglass size={10} /> Pending
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {providerData.verification.documents.drivingLicense.url && (
                                                                <div className="mt-2 h-32 w-full rounded-md overflow-hidden border border-gray-200 bg-white">
                                                                    <img
                                                                        src={providerData.verification.documents.drivingLicense.url}
                                                                        alt="Driving License"
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                    </>
                ) : (
                    <div className="text-center py-10 text-gray-500">
                        <p>Account settings coming soon...</p>
                    </div>
                )}
            </div>

            {isProviderRole ? <ProviderBottomNav /> : <PassengerBottomNav />}
        </div>
    );
}
