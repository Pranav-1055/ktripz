import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Car, ArrowRight } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export default function Home() {
    const [selectedRole, setSelectedRole] = useState(null);
    const navigate = useNavigate();

    const handleContinue = () => {
        if (selectedRole === 'passenger') {
            navigate('/passenger-details');
        } else if (selectedRole === 'transport') {
            navigate('/service-provider-details');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 animate-fade-in-up">
            <div className="w-full max-w-[480px]">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-extrabold text-primary mb-2">Choose your<br />experience</h1>
                </div>

                <div className="flex flex-col gap-4 mb-8">
                    <RoleCard
                        icon={User}
                        title="Passenger"
                        description="Book your next journey and travel in comfort."
                        isActive={selectedRole === 'passenger'}
                        onClick={() => setSelectedRole('passenger')}
                    />

                    <RoleCard
                        icon={Car}
                        title="Vehical Owner"
                        description="Manage your fleet and grow your transport business."
                        isActive={selectedRole === 'transport'}
                        onClick={() => setSelectedRole('transport')}
                    />
                </div>

                <Button
                    disabled={!selectedRole}
                    onClick={handleContinue}
                    className={selectedRole ? 'bg-primary shadow-xl shadow-primary/30' : ''}
                >
                    Continue <ArrowRight size={20} />
                </Button>

                <div className="mt-8 pt-6 border-t border-border">
                    <p className="text-center text-sm text-text-soft mb-4">Already have an account?</p>
                    <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" onClick={() => navigate('/login/passenger')} className="text-sm">
                            Passenger Login
                        </Button>
                        <Button variant="outline" onClick={() => navigate('/login/provider')} className="text-sm">
                            Partner Login
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RoleCard({ icon: Icon, title, description, isActive, onClick }) {
    return (
        <div
            onClick={onClick}
            className={`
        relative p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-center gap-5
        ${isActive
                    ? 'bg-white border-primary shadow-card transform -translate-y-0.5'
                    : 'bg-white border-border hover:border-primary/50'
                }
      `}
        >
            <div className={`
        w-14 h-14 rounded-2xl flex items-center justify-center transition-colors duration-300
        ${isActive ? 'bg-primary text-white' : 'bg-bg text-secondary'}
      `}>
                <Icon size={28} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
                <h3 className="text-lg font-bold text-text-dark mb-1">{title}</h3>
                <p className="text-sm text-text-soft leading-snug">{description}</p>
            </div>
        </div>
    );
}
