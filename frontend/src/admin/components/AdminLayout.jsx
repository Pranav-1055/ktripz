import React from 'react';
import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
    Users,
    Car,
    LayoutDashboard,
    LogOut,
    ShieldCheck
} from 'lucide-react'; // Assuming lucide-react is installed or valid icons exist. If not, will use text or standard SVGs next turn.
// Note: Frontend likely has lucide-react or similar since it's a modern stack. If not, I'll fix.

const AdminLayout = () => {
    const { adminUser, loading, logout } = useAdminAuth();
    const location = useLocation();

    if (loading) {
        return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
    }

    if (!adminUser) {
        return <Navigate to="/admin/login" replace />;
    }

    const navItems = [
        { path: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { path: '/admin/passengers', label: 'Passengers', icon: <Users size={20} /> },
        { path: '/admin/providers', label: 'Service Providers', icon: <Car size={20} /> },
    ];

    return (
        <div className="flex h-screen bg-gray-900 text-white">
            {/* Sidebar */}
            <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
                <div className="p-6 border-b border-gray-700 flex items-center space-x-2">
                    <ShieldCheck className="text-blue-500" size={24} />
                    <span className="text-xl font-bold">TripO Admin</span>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${location.pathname === item.path
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-700">
                    <button
                        onClick={logout}
                        className="flex items-center space-x-3 text-red-400 hover:text-red-300 w-full px-4 py-2 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                <header className="bg-gray-800 border-b border-gray-700 p-4 sticky top-0 z-10">
                    <div className="flex justify-between items-center">
                        <h1 className="text-xl font-semibold capitalize">
                            {location.pathname.split('/').pop().replace('-', ' ')}
                        </h1>
                        <div className="text-sm text-gray-400">
                            Logged in as <span className="text-white font-medium">{adminUser.username}</span>
                        </div>
                    </div>
                </header>
                <main className="p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
