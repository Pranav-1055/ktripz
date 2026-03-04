import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, ArrowLeft } from 'lucide-react';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { authService } from '../services/auth';

export default function Register() {
    const [searchParams] = useSearchParams();
    const role = searchParams.get('role') || 'passenger';
    const navigate = useNavigate();
    const location = useLocation();
    const passengerDetails = location.state?.passengerDetails;
    const personalDetails = location.state?.personalDetails;
    const vehicleDetails = location.state?.vehicleDetails;

    useEffect(() => {
        if (role === 'passenger' && !passengerDetails) {
            navigate('/passenger-details', { replace: true });
        }
        if (role === 'transport_provider' && (!personalDetails || !vehicleDetails)) {
            navigate('/service-provider-details', { replace: true });
        }
    }, [role, location.state, navigate, passengerDetails, personalDetails, vehicleDetails]);

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [alreadyVerified, setAlreadyVerified] = useState(false);

    const validate = () => {
        const newErrors = {};
        if (!formData.email) newErrors.email = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email address';

        if (!formData.password) newErrors.password = 'Password is required';
        else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setIsLoading(true);
        setErrors({});

        try {
            // ... (existing preparation code) ...
            // Prepare additional data from passenger details
            // Prepare additional data based on role
            let additionalData = {};

            if (role === 'passenger' && passengerDetails) {
                additionalData = {
                    profile: {
                        name: passengerDetails.name,
                        dateOfBirth: passengerDetails.dob,
                        gender: passengerDetails.gender,
                        phone: passengerDetails.phone,
                        avatar: passengerDetails.profilePic // Include avatar
                    },
                    location: passengerDetails.location,
                    onboardingCompleted: true
                };
            } else if (role === 'transport_provider' && personalDetails && vehicleDetails) {
                additionalData = {
                    businessInfo: {
                        businessName: personalDetails.name + "'s Transport", // Default business name from personal name
                        licenseNumber: vehicleDetails.licenseNumber
                    },
                    verification: {
                        documents: {
                            drivingLicense: {
                                url: vehicleDetails.licenseImage,
                                verified: false,
                                uploadedAt: new Date().toISOString()
                            }
                        }
                    },
                    personalInfo: {
                        fullName: personalDetails.name,
                        dateOfBirth: personalDetails.dob,
                        gender: personalDetails.gender,
                        phone: personalDetails.phone
                    },
                    fleetInfo: {
                        vehicleTypes: [vehicleDetails.vehicleType],
                        vehicles: [{
                            name: vehicleDetails.vehicleName,
                            type: vehicleDetails.vehicleType,
                            color: vehicleDetails.vehicleColor,
                            plate: vehicleDetails.numberPlate,
                            licenseIssued: vehicleDetails.licenseIssuedDate
                        }]
                    },
                    location: personalDetails.location,
                    onboardingCompleted: true,
                    // Map basic profile fields from personal info for consistency
                    profile: {
                        name: personalDetails.name,
                        dateOfBirth: personalDetails.dob,
                        gender: personalDetails.gender,
                        phone: personalDetails.phone,
                        avatar: personalDetails.profilePic // Include avatar
                    }
                };
            }

            console.log('--------------------------------');
            console.log('REGISTERING WITH DATA:', additionalData);
            console.log('--------------------------------');

            const user = await authService.register(formData.email, formData.password, role, additionalData);

            if (user.emailVerified) {
                setAlreadyVerified(true);
            }
            setSuccess(true);
        } catch (error) {
            console.error(error);
            let msg = 'Registration failed. Please try again.';

            if (error.message.includes('email is already registered') || error.code === 'auth/email-already-in-use') {
                msg = 'Account exists with this email. Please enter your existing password to add this profile.';
            } else if (error.code === 'auth/weak-password') {
                msg = 'Password is too weak.';
            } else if (error.message) {
                msg = error.message;
            }

            setErrors({ form: msg });
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        if (alreadyVerified) {
            return (
                <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in-up">
                    <Card className="w-full max-w-md text-center">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Mail size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-primary mb-3">Account Updated!</h2>
                        <p className="text-text-soft mb-8">
                            Your account has been successfully registered as a {role === 'transport_provider' ? 'Transport Provider' : 'Passenger'}.<br />
                            Please log in to continue.

                        </p>
                        <Button variant="outline" onClick={() => navigate(role === 'transport_provider' ? '/login/provider' : '/login/passenger')}>
                            Go to Login
                        </Button>
                    </Card>
                </div >
            );
        }

        return (
            <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in-up">
                <Card className="w-full max-w-md text-center">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Mail size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-primary mb-3">Check your email</h2>
                    <p className="text-text-soft mb-8">
                        We've sent a verification link to <strong>{formData.email}</strong>.<br />
                        Please verify your email to continue.
                    </p>
                    <Button variant="outline" onClick={() => navigate(role === 'transport_provider' ? '/login/provider' : '/login/passenger')}>
                        Go to Login
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in-up">
                <Link to="/" className="inline-flex items-center text-text-soft hover:text-primary mb-6 font-medium transition-colors">
                    <ArrowLeft size={20} className="mr-2" /> Back
                </Link>

                <Card>
                    <div className="text-center mb-8">
                        <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg uppercase tracking-wider mb-3">
                            {role === 'transport_provider' ? 'Partner' : 'Passenger'}
                        </span>
                        <h1 className="text-2xl font-bold text-primary">Create Account</h1>
                        <p className="text-text-soft mt-2">Enter your details to get started</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <Input
                            label="Email Address"
                            type="email"
                            placeholder="name@example.com"
                            icon={Mail}
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            error={errors.email}
                        />

                        <Input
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            icon={Lock}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            error={errors.password}
                        />

                        {errors.form && (
                            <div className="p-3 bg-error/10 text-error text-sm rounded-xl mb-4 font-medium text-center">
                                {errors.form}
                            </div>
                        )}

                        <Button type="submit" isLoading={isLoading} className="mt-2">
                            Create Account
                        </Button>
                    </form>

                    <div className="text-center mt-6 text-sm text-text-soft">
                        Already have an account?{' '}
                        <Link to={role === 'transport_provider' ? '/login/provider' : '/login/passenger'} className="text-primary font-bold hover:underline">
                            Log in
                        </Link>
                    </div>
                </Card>
            </div>
        </div>
    );
}
