import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, ArrowLeft } from 'lucide-react';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { authService } from '../services/auth';

export default function Login() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.email || !formData.password) {
            setError('Please fill in all fields');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const user = await authService.login(formData.email, formData.password);

            // Check if there's a pending role upgrade request from registration
            const intendedRole = searchParams.get('role');
            if (intendedRole) {
                try {
                    console.log(`Upgrading user role to ${intendedRole}...`);
                    await authService.updateRole(intendedRole);
                } catch (upgradeError) {
                    console.error("Failed to upgrade role:", upgradeError);
                    // Continue anyway, maybe they are already that role or it failed. 
                    // getUserRole will be the source of truth.
                }
            }

            // Fetch authoritative user profile from backend to determine role
            // Claims might be outdated or missing, so backend DB is the source of truth.
            try {
                const role = await authService.getUserRole(user.uid);
                const normalizedRole = typeof role === 'string' ? role.toLowerCase() : '';
                const isProviderRole = normalizedRole === 'transport_provider'
                    || normalizedRole === 'provider'
                    || normalizedRole === 'both';

                if (isProviderRole) {
                    navigate('/provider-home', { replace: true });
                } else {
                    navigate('/passenger-home', { replace: true });
                }
            } catch (roleError) {
                console.error("Error fetching role:", roleError);
                // Fallback to passenger if failed
                navigate('/passenger-home', { replace: true });
            }

        } catch (err) {
            console.error(err);
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in-up">
                <Link to="/" className="inline-flex items-center text-text-soft hover:text-primary mb-6 font-medium transition-colors">
                    <ArrowLeft size={20} className="mr-2" /> Back
                </Link>

                <Card>
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-primary">Welcome Back</h1>
                        <p className="text-text-soft mt-2">Log in to your account</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <Input
                            label="Email Address"
                            type="email"
                            placeholder="name@example.com"
                            icon={Mail}
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />

                        <Input
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            icon={Lock}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />

                        {error && (
                            <div className="p-3 bg-error/10 text-error text-sm rounded-xl mb-4 font-medium text-center">
                                {error}
                            </div>
                        )}

                        <Button type="submit" isLoading={isLoading} className="mt-2">
                            Log In
                        </Button>
                    </form>

                    <div className="text-center mt-6 text-sm text-text-soft">
                        Don't have an account?{' '}
                        <Link to="/" className="text-primary font-bold hover:underline">
                            Sign up
                        </Link>
                    </div>
                </Card>
            </div>
        </div>
    );
}
