import React, { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { Users, Car, CheckCircle, XCircle } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 flex items-center space-x-4">
        <div className={`p-3 rounded-full bg-opacity-20 ${color} bg-current`}>
            <Icon className={color} size={24} />
        </div>
        <div>
            <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

const AdminDashboard = () => {
    const { adminUser } = useAdminAuth();
    const [stats, setStats] = useState({
        totalPassengers: 0,
        totalServiceProviders: 0,
        authenticatedUsers: 0,
        unverifiedUsers: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('adminToken');
                const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/admin/dashboard`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await response.json();
                if (data.success) {
                    setStats(data.data);
                }
            } catch (error) {
                console.error('Error fetching stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) return <div className="text-white">Loading stats...</div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Passengers"
                    value={stats.totalPassengers}
                    icon={Users}
                    color="text-blue-500"
                />
                <StatCard
                    title="Service Providers"
                    value={stats.totalServiceProviders}
                    icon={Car}
                    color="text-purple-500"
                />
                <StatCard
                    title="Verified Users"
                    value={stats.authenticatedUsers}
                    icon={CheckCircle}
                    color="text-green-500"
                />
                <StatCard
                    title="Unverified Users"
                    value={stats.unverifiedUsers}
                    icon={XCircle}
                    color="text-red-500"
                />
            </div>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Quick Actions</h3>
                <p className="text-gray-400">Select a category from the sidebar to manage users.</p>
            </div>
        </div>
    );
};

export default AdminDashboard;
