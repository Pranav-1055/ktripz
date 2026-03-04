import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, MapPin, Route, ToggleLeft, ToggleRight, X } from 'lucide-react';

const RoutesManagement = () => {
    const [routes, setRoutes] = useState([]);
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingRoute, setEditingRoute] = useState(null);

    const [formData, setFormData] = useState({
        sourceName: '',
        destinationName: '',
        intermediateStops: [''],
        active: true
    });

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

    const fetchRoutes = async () => {
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${API_URL}/admin/routes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setRoutes(data.data);
            }
        } catch (err) {
            console.error('Error fetching routes:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStops = async () => {
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${API_URL}/admin/stops`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setStops(data.data || []);
            }
        } catch (err) {
            console.error('Error fetching stops:', err);
        }
    };

    useEffect(() => {
        fetchRoutes();
        fetchStops();
    }, []);

    const resetForm = () => {
        setFormData({
            sourceName: '',
            destinationName: '',
            intermediateStops: [''],
            active: true
        });
        setEditingRoute(null);
        setShowForm(false);
        setError('');
        setSuccess('');
    };

    const addIntermediateStop = () => {
        setFormData(prev => ({
            ...prev,
            intermediateStops: [...prev.intermediateStops, '']
        }));
    };

    const removeIntermediateStop = (index) => {
        if (formData.intermediateStops.length > 1) {
            setFormData(prev => ({
                ...prev,
                intermediateStops: prev.intermediateStops.filter((_, i) => i !== index)
            }));
        }
    };

    const updateIntermediateStop = (index, value) => {
        setFormData(prev => ({
            ...prev,
            intermediateStops: prev.intermediateStops.map((stop, i) => 
                i === index ? value : stop
            )
        }));
    };

    const moveStopUp = (index) => {
        if (index > 0) {
            setFormData(prev => {
                const newStops = [...prev.intermediateStops];
                [newStops[index - 1], newStops[index]] = [newStops[index], newStops[index - 1]];
                return { ...prev, intermediateStops: newStops };
            });
        }
    };

    const moveStopDown = (index) => {
        if (index < formData.intermediateStops.length - 1) {
            setFormData(prev => {
                const newStops = [...prev.intermediateStops];
                [newStops[index], newStops[index + 1]] = [newStops[index + 1], newStops[index]];
                return { ...prev, intermediateStops: newStops };
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');

        // Validation
        if (!formData.sourceName.trim()) {
            setError('Source stop name is required');
            setSubmitting(false);
            return;
        }

        if (!formData.destinationName.trim()) {
            setError('Destination stop name is required');
            setSubmitting(false);
            return;
        }

        if (formData.sourceName.trim().toLowerCase() === formData.destinationName.trim().toLowerCase()) {
            setError('Source and destination cannot be the same');
            setSubmitting(false);
            return;
        }

        // Check if all intermediate stops are filled
        const validIntermediateStops = formData.intermediateStops.filter(stop => stop.trim() !== '');
        if (validIntermediateStops.length === 0) {
            setError('At least one intermediate stop is required');
            setSubmitting(false);
            return;
        }

        const findStopByName = (name) => {
            if (!name) return null;
            const normalized = name.toLowerCase().trim();
            return stops.find(stop => stop.name?.toLowerCase().trim() === normalized) || null;
        };

        const sourceStop = findStopByName(formData.sourceName);
        const destStop = findStopByName(formData.destinationName);
        if (!sourceStop || !destStop) {
            setError('Please select Source and Destination from Admin Stops');
            setSubmitting(false);
            return;
        }

        const intermediateStopNames = formData.intermediateStops.filter(stop => stop.trim() !== '');
        const intermediateStopsResolved = intermediateStopNames.map((name) => findStopByName(name));
        if (intermediateStopsResolved.some(stop => !stop)) {
            setError('All intermediate stops must be selected from Admin Stops');
            setSubmitting(false);
            return;
        }

        try {
            const token = localStorage.getItem('adminToken');
            const url = editingRoute 
                ? `${API_URL}/admin/routes/${editingRoute.id}`
                : `${API_URL}/admin/routes`;
            
            const method = editingRoute ? 'PATCH' : 'POST';

            // Prepare data for backend
            const routeData = {
                source: { 
                    stopId: sourceStop.id,
                    name: sourceStop.name
                },
                destination: { 
                    stopId: destStop.id,
                    name: destStop.name
                },
                stops: intermediateStopsResolved.map((stop) => ({
                    stopId: stop.id,
                    name: stop.name
                })),
                active: formData.active
            };

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(routeData)
            });

            const data = await response.json();
            if (data.success) {
                setSuccess(editingRoute ? 'Route updated successfully!' : 'Route created successfully!');
                fetchRoutes();
                resetForm();
            } else {
                setError(data.error?.message || 'Failed to save route');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (route) => {
        setFormData({
            sourceName: route.source.name,
            destinationName: route.destination.name,
            intermediateStops: route.stops && route.stops.length > 0 
                ? route.stops.map(stop => stop.name)
                : [''],
            active: route.active
        });
        setEditingRoute(route);
        setShowForm(true);
    };

    const handleDelete = async (routeId) => {
        if (!confirm('Are you sure you want to delete this route?')) return;

        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${API_URL}/admin/routes/${routeId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (data.success) {
                setSuccess('Route deleted successfully!');
                fetchRoutes();
            } else {
                setError(data.error?.message || 'Failed to delete route');
            }
        } catch (err) {
            setError('Network error');
        }
    };

    const toggleRouteStatus = async (route) => {
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${API_URL}/admin/routes/${route.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ active: !route.active })
            });

            const data = await response.json();
            if (data.success) {
                fetchRoutes();
            }
        } catch (err) {
            console.error('Error toggling route status:', err);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64 text-white">Loading...</div>;
    }

    return (
        <div className="p-6 bg-gray-900 min-h-screen text-white">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Route className="text-blue-500" />
                    Predefined Routes
                </h1>
                <button
                    onClick={() => setShowForm(true)}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                    <Plus size={20} />
                    Add Route
                </button>
            </div>

            {error && (
                <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
                    {error}
                </div>
            )}

            {success && (
                <div className="bg-green-500/20 border border-green-500 text-green-200 px-4 py-3 rounded-lg mb-4">
                    {success}
                </div>
            )}

            {/* Route Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-6 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">
                            {editingRoute ? 'Edit Route' : 'Add New Route'}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Source Input */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Source Stop *</label>
                                <input
                                    type="text"
                                    value={formData.sourceName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, sourceName: e.target.value }))}
                                    list="admin-stop-options"
                                    placeholder="Enter source stop name"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400"
                                    required
                                />
                            </div>

                            {/* Destination Input */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Destination Stop *</label>
                                <input
                                    type="text"
                                    value={formData.destinationName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, destinationName: e.target.value }))}
                                    list="admin-stop-options"
                                    placeholder="Enter destination stop name"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400"
                                    required
                                />
                            </div>

                            {/* Intermediate Stops */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium">Intermediate Stops *</label>
                                    <button
                                        type="button"
                                        onClick={addIntermediateStop}
                                        className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm flex items-center gap-1"
                                    >
                                        <Plus size={16} />
                                        Add Stop
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {formData.intermediateStops.map((stop, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <span className="text-sm text-gray-400 w-8">{index + 1}.</span>
                                            <input
                                                type="text"
                                                value={stop}
                                                onChange={(e) => updateIntermediateStop(index, e.target.value)}
                                                list="admin-stop-options"
                                                placeholder={`Intermediate stop ${index + 1}`}
                                                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400"
                                                required
                                            />
                                            <div className="flex gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => moveStopUp(index)}
                                                    disabled={index === 0}
                                                    className="px-2 py-1 bg-blue-600 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Move up"
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveStopDown(index)}
                                                    disabled={index === formData.intermediateStops.length - 1}
                                                    className="px-2 py-1 bg-blue-600 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Move down"
                                                >
                                                    ↓
                                                </button>
                                                {formData.intermediateStops.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeIntermediateStop(index)}
                                                        className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                                                        title="Remove stop"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    At least one intermediate stop is required. Use ↑↓ buttons to reorder stops.
                                </p>
                            </div>

                            {/* Active Status */}
                            <div>
                                <datalist id="admin-stop-options">
                                    {stops.map((stop) => (
                                        <option key={stop.id} value={stop.name} />
                                    ))}
                                </datalist>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                                        className="rounded"
                                    />
                                    <span>Active Route</span>
                                </label>
                            </div>

                            {/* Form Actions */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : (editingRoute ? 'Update Route' : 'Create Route')}
                                </button>
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Routes List */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Route
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Intermediate Stops
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Created
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {routes.map((route) => (
                                <tr key={route.id} className="hover:bg-gray-700/50">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <MapPin size={16} className="text-green-500" />
                                            <span className="font-medium">{route.source.name}</span>
                                            <span className="text-gray-400">→</span>
                                            <MapPin size={16} className="text-red-500" />
                                            <span className="font-medium">{route.destination.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-300">
                                            {route.stops && route.stops.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {route.stops.map((stop, index) => (
                                                        <span key={stop.stopId} className="bg-gray-600 px-2 py-1 rounded text-xs">
                                                            {index + 1}. {stop.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-500">No intermediate stops</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => toggleRouteStatus(route)}
                                            className="flex items-center gap-1"
                                        >
                                            {route.active ? (
                                                <>
                                                    <ToggleRight className="text-green-500" size={20} />
                                                    <span className="text-green-400 text-sm">Active</span>
                                                </>
                                            ) : (
                                                <>
                                                    <ToggleLeft className="text-gray-500" size={20} />
                                                    <span className="text-gray-400 text-sm">Inactive</span>
                                                </>
                                            )}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-300">
                                        {new Date(route.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEdit(route)}
                                                className="text-blue-400 hover:text-blue-300 p-1"
                                                title="Edit route"
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(route.id)}
                                                className="text-red-400 hover:text-red-300 p-1"
                                                title="Delete route"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {routes.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                        <Route size={48} className="mx-auto mb-4 opacity-50" />
                        <p>No predefined routes found</p>
                        <p className="text-sm">Create your first route to get started</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoutesManagement;
