import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Truck, Car, FileText, ArrowRight, ArrowLeft, Camera } from 'lucide-react';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { api } from '../services/api';
import { twoWheelers } from '../data/twoWheelers'; // Fallback
import { vehicleData } from '../data/vehicleData';
import { VehicleSelect } from '../components/VehicleSelect';
import { getAuth } from 'firebase/auth';


export default function VehicleInformation() {
    const navigate = useNavigate();
    const location = useLocation();
    const personalDetails = location.state?.personalDetails;

    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = auth.onAuthStateChanged((currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);

            // Only redirect if NOT authenticated AND no personal details (Registration flow check)
            if (!currentUser && !personalDetails) {
                navigate('/service-provider-details', { replace: true });
            }
        });
        return () => unsubscribe();
    }, [personalDetails, navigate]);

    const [formData, setFormData] = useState({
        vehicleType: '',
        vehicleName: '',
        vehicleColor: '',
        numberPlate: '',
        licenseNumber: '',
        licenseIssuedDate: '',
        licenseImage: '',
        vehicleImage: ''
    });
    const [errors, setErrors] = useState({});
    const [uploading, setUploading] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        if (errors.licenseImage) setErrors(prev => ({ ...prev, licenseImage: null }));

        try {
            const uploadFormData = new FormData();
            uploadFormData.append('image', file);

            const response = await api.post('/uploads/license-image', uploadFormData);
            const imageUrl = response.data?.imageUrl || response.imageUrl;

            if (imageUrl) {
                setFormData(prev => ({ ...prev, licenseImage: imageUrl }));
            }
        } catch (error) {
            console.error("License image upload failed:", error);
            setErrors(prev => ({ ...prev, licenseImage: "Failed to upload image. Please try again." }));
        } finally {
            setUploading(false);
        }
    };

    const validate = () => {
        const newErrors = {};
        if (!formData.vehicleType) newErrors.vehicleType = "Vehicle Type is required";
        if (!formData.vehicleName.trim()) newErrors.vehicleName = "Vehicle Name is required";
        if (!formData.vehicleColor.trim()) newErrors.vehicleColor = "Vehicle Color is required";
        if (!formData.numberPlate.trim()) newErrors.numberPlate = "Number Plate is required";
        if (!formData.licenseNumber.trim()) newErrors.licenseNumber = "License Number is required";
        if (!formData.licenseIssuedDate) newErrors.licenseIssuedDate = "License Issue Date is required";
        if (!formData.licenseImage) newErrors.licenseImage = "License Photo is required";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const fourWheelerOptions = vehicleData.four_wheelers?.map(v => ({
        ...v,
        name: `${v.brand} ${v.model}`,
        make: v.brand
    })) || [];

    const twoWheelerOptions = vehicleData.two_wheelers?.map(v => ({
        ...v,
        name: `${v.brand} ${v.model}`,
        make: v.brand
    })) || [];

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (validate()) {
            if (personalDetails) {
                // Registration Flow
                navigate('/register?role=transport_provider', {
                    state: {
                        personalDetails,
                        vehicleDetails: formData
                    }
                });
            } else if (user) {
                // Add Vehicle Flow for Existing User
                try {
                    const auth = getAuth();
                    const token = await auth.currentUser.getIdToken();

                    // Map form data to backend structure
                    const seatsMap = {
                        '2wheeler': 1,
                        '4wheeler': 4,
                        'minivan': 7,
                        'bus': 40,
                        'truck': 2
                    };

                    const vehicleData = {
                        details: {
                            make: formData.vehicleName.split(' ')[0] || 'Unknown',
                            model: formData.vehicleName.substring(formData.vehicleName.indexOf(' ') + 1) || formData.vehicleName,
                            year: new Date().getFullYear(), // Default to current year as it's not in form
                            color: formData.vehicleColor,
                            licensePlate: formData.numberPlate,
                            seats: seatsMap[formData.vehicleType] || 4,
                            fuelType: 'petrol', // Default
                            transmission: 'manual' // Default
                        },
                        // Include the selected vehicle image as a photo if available
                        photos: formData.vehicleImage ? [{
                            url: formData.vehicleImage,
                            type: 'exterior_front',
                            verified: false,
                            uploadedAt: new Date()
                        }] : []
                    };

                    const response = await api.post('/vehicles', vehicleData, token);

                    if (response.success) {
                        // Navigate back or to success page
                        navigate(-1);
                    } else {
                        setErrors(prev => ({ ...prev, submit: response.error?.message || 'Failed to add vehicle' }));
                    }
                } catch (error) {
                    console.error('Error adding vehicle:', error);
                    setErrors(prev => ({ ...prev, submit: 'Failed to add vehicle. Please try again.' }));
                }
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in-up">
                <Card>
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-primary">Vehicle Information</h1>
                        <p className="text-text-soft mt-2">Details about your transport vehicle</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="block text-sm font-bold text-text-dark mb-2 ml-1">Vehicle Type</label>
                            <div className="relative">
                                <select
                                    name="vehicleType"
                                    value={formData.vehicleType}
                                    onChange={handleInputChange}
                                    className={`w-full h-[56px] bg-[#F1F5F9] border-2 border-transparent rounded-xl px-4 pl-12 text-base text-text-dark appearance-none focus:outline-none focus:bg-white focus:border-primary transition-all duration-200 ${errors.vehicleType ? 'border-error bg-error/5' : ''}`}
                                >
                                    <option value="">Select vehicle type</option>
                                    <option value="2wheeler">2 Wheeler</option>
                                    <option value="4wheeler">4 Wheeler</option>
                                    <option value="minivan">Minivan</option>
                                    <option value="bus">Bus</option>
                                    <option value="truck">Truck</option>
                                </select>
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-soft pointer-events-none">
                                    <Truck size={20} />
                                </div>
                            </div>
                            {errors.vehicleType && <p className="mt-2 text-sm text-error font-medium ml-1">{errors.vehicleType}</p>}
                        </div>

                        {formData.vehicleType === '2wheeler' || formData.vehicleType === '4wheeler' ? (
                            <VehicleSelect
                                label="Vehicle Name / Model"
                                name="vehicleName"
                                value={formData.vehicleName}
                                onChange={(e) => {
                                    handleInputChange(e);
                                    // Optionally capture image if available in data
                                    if (e.target.data?.image) {
                                        setFormData(prev => ({ ...prev, vehicleImage: e.target.data.image }));
                                    }
                                }}
                                options={formData.vehicleType === '4wheeler' ? fourWheelerOptions : twoWheelerOptions}
                                placeholder="Select your vehicle"
                                error={errors.vehicleName}
                            />
                        ) : (
                            <Input
                                label="Vehicle Name / Model"
                                name="vehicleName"
                                placeholder="e.g. Maruti Suzuki Swift"
                                icon={Car}
                                value={formData.vehicleName}
                                onChange={handleInputChange}
                                error={errors.vehicleName}
                            />
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Vehicle Color"
                                name="vehicleColor"
                                placeholder="Red"
                                value={formData.vehicleColor}
                                onChange={handleInputChange}
                                error={errors.vehicleColor}
                            />
                            <Input
                                label="Number Plate"
                                name="numberPlate"
                                placeholder="MH 12 AB 1234"
                                value={formData.numberPlate}
                                onChange={handleInputChange}
                                error={errors.numberPlate}
                            />
                        </div>

                        <Input
                            label="Driving License Number"
                            name="licenseNumber"
                            placeholder="DL1234567890"
                            icon={FileText}
                            value={formData.licenseNumber}
                            onChange={handleInputChange}
                            error={errors.licenseNumber}
                        />
                        <Input
                            label="License Issued Date"
                            name="licenseIssuedDate"
                            type="date"
                            value={formData.licenseIssuedDate}
                            onChange={handleInputChange}
                            error={errors.licenseIssuedDate}
                        />

                        <div className="mt-4">
                            <label className="block text-sm font-bold text-text-dark mb-2 ml-1">License Photo</label>
                            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors relative group">
                                {formData.licenseImage ? (
                                    <div className="relative h-48 w-full">
                                        <img
                                            src={formData.licenseImage}
                                            alt="License Preview"
                                            className="w-full h-full object-contain rounded-lg"
                                        />
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setFormData(prev => ({ ...prev, licenseImage: '' }));
                                            }}
                                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-4">
                                        <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3">
                                            <Camera size={24} />
                                        </div>
                                        <p className="text-sm font-medium text-text-dark mb-1">
                                            {uploading ? 'Uploading...' : 'Upload License Photo'}
                                        </p>
                                        <p className="text-xs text-text-soft">
                                            Click to upload or take a photo
                                        </p>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${formData.licenseImage ? 'hidden' : ''}`}
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    disabled={uploading || !!formData.licenseImage}
                                />
                            </div>
                            {errors.licenseImage && <p className="mt-2 text-sm text-error font-medium ml-1">{errors.licenseImage}</p>}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => navigate(-1)}
                                className="flex-1"
                            >
                                <ArrowLeft size={18} className="mr-2" /> Back
                            </Button>
                            <Button type="submit" className="flex-[2]" icon={ArrowRight}>
                                Next
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div >
    );
}
