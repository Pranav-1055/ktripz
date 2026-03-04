import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Briefcase, Calendar, User } from 'lucide-react';

export default function PassengerBottomNav() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-3 px-6 flex justify-between items-center z-10 pb-safe">
            <NavButton
                icon={Home}
                label="Home"
                isActive={location.pathname === '/passenger-home'}
                onClick={() => navigate('/passenger-home')}
            />
            <NavButton
                icon={Briefcase}
                label="Trips"
                isActive={location.pathname === '/passenger-trips'}
                onClick={() => navigate('/passenger-trips')}
            />
            <NavButton
                icon={Calendar}
                label="Bookings"
                isActive={location.pathname === '/passenger-bookings'}
                onClick={() => navigate('/passenger-bookings')}
            />
            <NavButton
                icon={User}
                label="Profile"
                isActive={location.pathname === '/profile'}
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
