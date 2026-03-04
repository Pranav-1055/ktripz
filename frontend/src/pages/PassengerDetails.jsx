import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Calendar, Phone, MapPin, ArrowRight, Upload, Home, Map as MapIcon } from 'lucide-react';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { api } from '../services/api';

export default function PassengerDetails() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        dob: '',
        gender: '',
        phone: '',
        profilePic: null,
        street: '',
        city: '',
        district: '',
        state: '',
        country: 'India',
        latitude: null,
        longitude: null
    });
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [errors, setErrors] = useState({});

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        // Clear error when user types
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
    };

    const handleGenderSelect = (gender) => {
        setFormData(prev => ({ ...prev, gender }));
        if (errors.gender) setErrors(prev => ({ ...prev, gender: null }));
    };

    const fetchLiveLocation = () => {
        setIsLoadingLocation(true);
        if (!navigator.geolocation) {
            setErrors(prev => ({ ...prev, location: "Geolocation is not supported by your browser" }));
            setIsLoadingLocation(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    // Use backend proxy to avoid CORS and get accurate location
                    const response = await api.get(`/maps/reverse-geocode?lat=${latitude}&lng=${longitude}`);

                    if (response && response.success && response.data) {
                        const locationData = response.data;
                        const address = locationData.address || {};

                        setFormData(prev => ({
                            ...prev,
                            street: address.road || locationData.formattedAddress.split(',')[0] || '',
                            city: address.city || address.town || address.village || '',
                            district: address.district || address.state_district || address.county || '',
                            state: address.state || '',
                            country: address.country || 'India',
                            latitude,
                            longitude
                        }));

                        setErrors(prev => ({
                            ...prev,
                            location: null,
                            street: null,
                            city: null,
                            district: null,
                            state: null
                        }));
                    } else {
                        throw new Error("Location not found");
                    }
                } catch (error) {
                    console.error("Error fetching address:", error);
                    setErrors(prev => ({ ...prev, location: "Failed to fetch address details. Please fill manually." }));
                } finally {
                    setIsLoadingLocation(false);
                }
            },
            (error) => {
                console.error("Geolocation error:", error);
                let errorMessage = "Failed to get location.";
                if (error.code === 1) errorMessage = "Location permission denied.";
                else if (error.code === 2) errorMessage = "Location unavailable.";
                else if (error.code === 3) errorMessage = "Location request timed out.";
                setErrors(prev => ({ ...prev, location: errorMessage }));
                setIsLoadingLocation(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    };

    const validate = () => {
        const newErrors = {};
        if (!formData.name.trim()) newErrors.name = "Name is required";
        if (!formData.dob) newErrors.dob = "Date of Birth is required";
        if (!formData.gender) newErrors.gender = "Gender is required";
        if (!formData.phone.trim()) newErrors.phone = "Mobile number is required";
        else if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) newErrors.phone = "Invalid mobile number";

        // Address validation
        if (!formData.street.trim()) newErrors.street = "Street address is required";
        if (!formData.city.trim()) newErrors.city = "City is required";
        if (!formData.state.trim()) newErrors.state = "State is required";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validate()) {
            // Navigate to Register page with data
            navigate('/register', {
                state: {
                    passengerDetails: {
                        ...formData,
                        location: {
                            fullAddress: `${formData.street}, ${formData.city}, ${formData.district}, ${formData.state}, ${formData.country}`,
                            city: formData.city,
                            state: formData.state,
                            district: formData.district,
                            coordinates: {
                                latitude: formData.latitude,
                                longitude: formData.longitude
                            }
                        }
                    }
                }
            });
        }
    };

    const [uploading, setUploading] = useState(false);

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const uploadFormData = new FormData();
            uploadFormData.append('image', file);

            const response = await api.post('/uploads/profile-image', uploadFormData);
            // Check success and extract URL
            const imageUrl = response.data?.imageUrl || response.imageUrl;

            if (imageUrl) {
                setFormData(prev => ({ ...prev, profilePic: imageUrl }));
                if (errors.profilePic) setErrors(prev => ({ ...prev, profilePic: null }));
            }
        } catch (error) {
            console.error("Image upload failed:", error);
            setErrors(prev => ({ ...prev, profilePic: "Failed to upload image" }));
        } finally {
            setUploading(false);
        }
    };

    // ... existing code ...

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in-up">
                <Card>
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-primary">Details</h1>
                        <p className="text-text-soft mt-2">Tell us a bit about yourself</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Profile Pic Placeholder */}
                        <div className="flex justify-center mb-6">
                            <label className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors relative overflow-hidden group">
                                {formData.profilePic ? (
                                    <img src={formData.profilePic} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <>
                                        <Upload className={`text-gray-400 group-hover:text-primary transition-colors ${uploading ? 'animate-bounce' : ''}`} size={24} />
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                                            {uploading ? 'Uploading...' : 'Upload Photo'}
                                        </div>
                                    </>
                                )}
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    disabled={uploading}
                                />
                            </label>
                        </div>

                        <Input
                            label="Full Name"
                            name="name"
                            placeholder="John Doe"
                            icon={User}
                            value={formData.name}
                            onChange={handleInputChange}
                            error={errors.name}
                        />

                        <Input
                            label="Date of Birth"
                            name="dob"
                            type="date"
                            icon={Calendar}
                            value={formData.dob}
                            onChange={handleInputChange}
                            error={errors.dob}
                        />

                        <Input
                            label="Mobile Number"
                            name="phone"
                            type="tel"
                            placeholder="9876543210"
                            icon={Phone}
                            value={formData.phone}
                            onChange={handleInputChange}
                            error={errors.phone}
                        />

                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-text-primary">Gender</label>
                            <div className="flex gap-4">
                                {['Male', 'Female', 'Other'].map(g => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => handleGenderSelect(g)}
                                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${formData.gender === g
                                            ? 'bg-primary text-white border-primary shadow-lg shadow-primary/30'
                                            : 'bg-white text-text-soft border-gray-200 hover:border-primary/50'
                                            }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                            {errors.gender && <p className="text-error text-xs mt-1">{errors.gender}</p>}
                        </div>

                        <div className="pt-4 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-text-primary">Address Details</label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={fetchLiveLocation}
                                    isLoading={isLoadingLocation}
                                    icon={MapPin}
                                    className="text-xs text-primary hover:bg-primary/5 px-2 py-1 h-auto"
                                >
                                    Auto-Fill Location
                                </Button>
                            </div>
                            {errors.location && <p className="text-error text-xs mb-2">{errors.location}</p>}

                            <div className="space-y-3">
                                <Input
                                    label="Street / Area"
                                    name="street"
                                    placeholder="e.g. Apartment, Road, Area"
                                    icon={Home}
                                    value={formData.street}
                                    onChange={handleInputChange}
                                    error={errors.street}
                                />

                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="City"
                                        name="city"
                                        placeholder="City"
                                        value={formData.city}
                                        onChange={handleInputChange}
                                        error={errors.city}
                                    />
                                    <Input
                                        label="District"
                                        name="district"
                                        placeholder="District"
                                        value={formData.district}
                                        onChange={handleInputChange}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="State"
                                        name="state"
                                        placeholder="State"
                                        value={formData.state}
                                        onChange={handleInputChange}
                                        error={errors.state}
                                    />
                                    <Input
                                        label="Country"
                                        name="country"
                                        value={formData.country}
                                        onChange={handleInputChange}
                                        disabled
                                        className="bg-gray-50"
                                    />
                                </div>
                            </div>
                        </div>

                        <Button type="submit" className="w-full mt-6" icon={ArrowRight}>
                            Continue to Sign Up
                        </Button>
                    </form>
                    <div className="text-center mt-6 text-sm text-text-soft">
                        Already have an account?{' '}
                        <button
                            type="button"
                            onClick={() => navigate('/login/passenger')}
                            className="text-primary font-bold hover:underline"
                        >
                            Log In
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
