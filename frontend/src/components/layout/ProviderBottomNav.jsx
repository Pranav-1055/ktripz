import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, List, User } from 'lucide-react';

export default function ProviderBottomNav() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-3 px-6 flex justify-around items-center z-40 pb-safe">
            <NavButton
                icon={Home}
                label="Home"
                isActive={location.pathname === '/provider-home'}
                onClick={() => navigate('/provider-home')}
            />
            <NavButton
                icon={List}
                label="My Rides"
                isActive={location.pathname === '/my-rides'}
                onClick={() => navigate('/my-rides')}
            />
            <NavButton
                icon={User}
                label="Profile"
                isActive={location.pathname === '/profile'} // Or separate provider profile if needed
                onClick={() => navigate('/profile')}
            />
        </div>
    );
}

function NavButton({ icon: Icon, label, isActive, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1 ${isActive ? 'text-blue-900' : 'text-gray-400'} w-16 transition-colors duration-200`}
        >
            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
        </button>
    );
}
