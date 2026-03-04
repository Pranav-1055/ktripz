import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Navigation, Calendar, Clock, Briefcase, Users } from 'lucide-react';
import { authService } from '../services/auth';
import { api } from '../services/api';
import polyline from '@mapbox/polyline';
// Ola Maps script is loaded in index.html, so we access via window.OlaMaps

export default function ScheduleRide() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1); // 1: Route, 2: Details

    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const olaMapsRef = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef(null);

    const ensureMissingStyleImage = (map, id) => {
        try {
            if (!id || map.hasImage(id)) return;
            const transparentPixel = new Uint8Array([0, 0, 0, 0]);
            map.addImage(id, {
                width: 1,
                height: 1,
                data: transparentPixel
            });
        } catch (e) {
            console.warn('Unable to provide fallback style image:', id, e);
        }
    };

    const getEncodedPolyline = (value) => {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
            return value.points || value.encodedPolyline || value.encoded_polyline || value.geometry || null;
        }
        return null;
    };

    const extractRouteCoordinates = (route) => {
        const encoded = getEncodedPolyline(route?.polyline)
            || getEncodedPolyline(route?.geometry)
            || getEncodedPolyline(route?.overview_polyline)
            || getEncodedPolyline(route?.overviewPolyline)
            || getEncodedPolyline(route?.route_geometry);
        if (typeof encoded === 'string' && encoded.length > 0) {
            try {
                const decodedPoints = polyline.decode(encoded);
                return {
                    encodedPolyline: encoded,
                    coordinates: decodedPoints.map(point => [point[1], point[0]]) // [lat,lng] -> [lng,lat]
                };
            } catch (e) {
                console.warn('Failed to decode route polyline, trying coordinate geometry fallback', e);
            }
        }

        const directCoords = route?.geometry?.coordinates || route?.coordinates;
        if (Array.isArray(directCoords) && directCoords.length > 1) {
            // Normalize to [lng, lat]
            const normalized = directCoords.map((coord) => {
                if (!Array.isArray(coord) || coord.length < 2) return coord;
                const [a, b] = coord;
                // Heuristic: lat range is [-90,90], lng range is [-180,180]
                if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
                    return [b, a]; // looks like [lat,lng]
                }
                return [a, b]; // assume already [lng,lat]
            });

            return {
                encodedPolyline: null,
                coordinates: normalized
            };
        }

        const stepCoords = [];
        const steps = Array.isArray(route?.steps) ? route.steps : [];
        steps.forEach((step) => {
            const stepEncoded = getEncodedPolyline(step?.polyline)
                || getEncodedPolyline(step?.geometry)
                || getEncodedPolyline(step?.overview_polyline)
                || getEncodedPolyline(step?.overviewPolyline);
            if (typeof stepEncoded === 'string' && stepEncoded.length > 0) {
                try {
                    const decoded = polyline.decode(stepEncoded).map((point) => [point[1], point[0]]);
                    if (decoded.length > 0) {
                        if (stepCoords.length > 0) {
                            // Avoid duplicating the connection vertex between steps
                            stepCoords.push(...decoded.slice(1));
                        } else {
                            stepCoords.push(...decoded);
                        }
                    }
                    return;
                } catch (e) {
                    // Ignore malformed step polyline and try next step
                }
            }
        });

        if (stepCoords.length > 1) {
            return {
                encodedPolyline: null,
                coordinates: stepCoords
            };
        }

        return null;
    };

    const normalizeMapCoordinates = (coords) => {
        if (!Array.isArray(coords)) return [];
        return coords
            .map((coord) => {
                if (!Array.isArray(coord) || coord.length < 2) return null;
                const lng = Number(coord[0]);
                const lat = Number(coord[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
                return [lng, lat];
            })
            .filter(Boolean);
    };

    // Initialize Map with Retry
    useEffect(() => {
        const initMap = () => {
            if (!mapContainerRef.current) return;

            const OlaMaps = window.OlaMaps;
            if (!OlaMaps) {
                // Retry after 500ms if SDK not loaded yet
                setTimeout(initMap, 500);
                return;
            }

            if (mapInstanceRef.current) return; // Already initialized

            try {
                olaMapsRef.current = new OlaMaps({
                    apiKey: import.meta.env.VITE_OLA_MAPS_API_KEY
                });

                const myMap = olaMapsRef.current.init({
                    container: mapContainerRef.current,
                    center: [73.8567, 18.5204], // [lng, lat] - Pune default
                    zoom: 12
                });

                myMap.on('styleimagemissing', (e) => {
                    ensureMissingStyleImage(myMap, e?.id);
                });

                mapInstanceRef.current = myMap;
            } catch (error) {
                console.error("Error initializing Ola Maps:", error);
            }
        };

        initMap();

        return () => {
            // Cleanup in SPA not strictly required by SDK, but good practice
        };
    }, []);

    // User/Provider Data
    const [providerProfile, setProviderProfile] = useState(null);
    const [vehicleType, setVehicleType] = useState('');

    // Vehicle State
    const [vehicles, setVehicles] = useState([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState('');

    // Route State
    const [source, setSource] = useState('');
    const [destination, setDestination] = useState('');
    const [sourceCoords, setSourceCoords] = useState(null);
    const [destCoords, setDestCoords] = useState(null);
    const [routes, setRoutes] = useState([]);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

    // Address Suggestions
    const [sourceSuggestions, setSourceSuggestions] = useState([]);
    const [destSuggestions, setDestSuggestions] = useState([]);

    // Ride Details State
    const [formData, setFormData] = useState({
        date: '',
        time: '',
        seats: 1,
        priceBySeat: 0,
        priceTotal: 0,
        luggageAllowed: false,
        luggageCapacity: 0,
        description: ''
    });

    useEffect(() => {
        const init = async () => {
            const user = await authService.waitForAuth();
            if (user) {
                fetchProviderProfile();
                fetchVehicles();
            } else {
                navigate('/login/provider');
            }
        };
        init();
    }, []);

    const fetchProviderProfile = async () => {
        try {
            const response = await authService.getProfile();
            if (response.data && response.data.user) {
                setProviderProfile(response.data.user);
            }
        } catch (error) {
            console.error('Failed to fetch profile', error);
        }
    };

    const fetchVehicles = async () => {
        try {
            const token = await authService.getToken();
            const response = await api.get('/rides/provider/available-vehicles', token);
            const vehicleList = Array.isArray(response) ? response : (response.data || []);

            setVehicles(vehicleList);

            if (vehicleList.length > 0) {
                const defaultVehicle = vehicleList.find(v => v.status === 'active') || vehicleList[0];
                const defaultId = defaultVehicle.id || defaultVehicle._id;
                setSelectedVehicleId(defaultId);
                updateVehicleType(defaultVehicle);
            }
        } catch (error) {
            console.error('Failed to fetch vehicles', error);
        }
    };

    const updateVehicleType = (vehicle) => {
        if (!vehicle) return;
        const make = vehicle.make || vehicle.details?.make || '';
        const model = vehicle.model || vehicle.details?.model || '';
        const seats = vehicle.seats || vehicle.details?.seats;

        const type = (make + ' ' + model).toLowerCase();
        setVehicleType(type);
        setFormData(prev => ({
            ...prev,
            seats: seats ? Math.max(1, seats - 1) : 1
        }));
    };

    const handleVehicleChange = (e) => {
        const vId = e.target.value;
        setSelectedVehicleId(vId);
        const vehicle = vehicles.find(v => (v.id || v._id) === vId);
        updateVehicleType(vehicle);
    };

    // Route Stops (Ola Maps) State
    const [selectedStops, setSelectedStops] = useState([]);

    const toggleStop = (stop) => {
        if (!stop) return;
        setSelectedStops((prev) => {
            const exists = prev.find((s) => (s.id || s.name) === (stop.id || stop.name));
            if (exists) {
                return prev.filter((s) => (s.id || s.name) !== (stop.id || stop.name));
            }
            return [...prev, stop];
        });
    };


    // Enhanced Search with Ola Maps
    const searchAddress = async (query, setSuggestions) => {
        if (!query) {
            setSuggestions([]);
            return;
        }

        // Ola Maps Autocomplete
        if (query.length > 2) {
            try {
                const response = await fetch(`https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(query)}&api_key=${import.meta.env.VITE_OLA_MAPS_API_KEY}`);
                const data = await response.json();

                if (data.status === 'ok') {
                    const apiResults = data.predictions.map(p => ({
                        name: p.description,
                        placeId: p.place_id,
                        type: 'api'
                    }));
                    setSuggestions(apiResults);
                } else {
                    setSuggestions([]);
                }
            } catch (e) {
                console.error("Autocomplete error", e);
                setSuggestions([]);
            }
        } else {
            setSuggestions([]);
        }
    };

    const handleSelectLocation = async (item, type) => {
        let coords = { lat: 0, lon: 0 };
        let addressName = item.name;

        if (item.type === 'api') {
            // Fetch Place Details to get Lat/Lng
            try {
                const response = await fetch(`https://api.olamaps.io/places/v1/details?place_id=${item.placeId}&api_key=${import.meta.env.VITE_OLA_MAPS_API_KEY}`);
                const data = await response.json();

                if (data.status === 'ok') {
                    const location = data.result.geometry.location;
                    coords = { lat: location.lat, lon: location.lng };
                    addressName = data.result.name || data.result.formatted_address || item.name;
                }
            } catch (e) {
                console.error("Place Details error", e);
                return;
            }
        } else {
            // Admin Stop
            coords = { lat: parseFloat(item.lat), lon: parseFloat(item.lng) };
        }

        const locationData = {
            address: addressName,
            city: addressName.split(',')[0], // Simple city extraction
            ...coords
        };

        if (type === 'source') {
            setSource(addressName);
            setSourceCoords(locationData);
            setSourceSuggestions([]);
        } else {
            setDestination(addressName);
            setDestCoords(locationData);
            setDestSuggestions([]);
        }
    };

    // Routing Logic
    const fetchRoutes = async () => {
        if (!source || !destination || !sourceCoords || !destCoords) return;

        try {
            // Call Backend Proxy for Route (Uses Ola Maps Directions API)
            const response = await api.post('/rides/calculate-route', {
                origin: { lat: sourceCoords.lat, lng: sourceCoords.lon },
                destination: { lat: destCoords.lat, lng: destCoords.lon }
            });

            const success = response?.success ?? response?.data?.success;
            const routeData = response?.data?.routes ? response.data : response?.data?.data;
            const apiRoutes = routeData?.routes || [];

            if (success && apiRoutes.length > 0) {

                // Map Routes and Decode/Normalize Polylines
                const formattedRoutes = apiRoutes.map((route) => {
                    const extracted = extractRouteCoordinates(route);
                    if (!extracted || !Array.isArray(extracted.coordinates) || extracted.coordinates.length < 2) {
                        return null;
                    }

                    return {
                        distance: route?.distance?.value ?? route?.distance ?? 0, // meters
                        duration: route?.duration?.value ?? route?.duration ?? 0, // seconds
                        polyline: extracted.encodedPolyline || route?.polyline || null,
                        geometry: {
                            type: 'LineString',
                            coordinates: extracted.coordinates
                        },
                        bounds: route?.bounds,
                        via: { name: route?.summary || route?.via?.name || '' }
                    };
                }).filter(Boolean);

                if (formattedRoutes.length > 0) {
                    setRoutes(formattedRoutes);
                    setSelectedRouteIndex(0);
                } else {
                    console.error("Routing API returned routes but none had valid geometry.");
                    alert("Routes were found but geometry could not be parsed. Please try different locations.");
                    setRoutes([]);
                }
            } else {
                console.error("Routing API returned no routes.");
                alert("Could not find a route between these locations. Please check the locations.");
                setRoutes([]); // Clear routes
            }
        } catch (error) {
            console.error("Error fetching routes:", error);
            alert("Failed to calculate route. Please try again.");
            setRoutes([]); // Clear routes
        }
    };

    useEffect(() => {
        if (sourceCoords && destCoords) {
            fetchRoutes();
        }
    }, [sourceCoords, destCoords]);

    // Render Route on Map
    useEffect(() => {
        if (!mapInstanceRef.current || routes.length === 0) {
            // If no routes, ensure we clear the layer if it exists
            if (mapInstanceRef.current && mapInstanceRef.current.getSource('route-source')) {
                mapInstanceRef.current.getSource('route-source').setData({
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: [] }
                });
            }
            if (markersRef.current) {
                markersRef.current.forEach(marker => marker.remove());
                markersRef.current = [];
            }
            return;
        }

        const route = routes[selectedRouteIndex];
        const map = mapInstanceRef.current;
        const coordinates = normalizeMapCoordinates(route?.geometry?.coordinates);
        if (coordinates.length < 2) {
            console.warn('Route selected but has insufficient valid coordinates for map render.', route);
            return;
        }

        const routeSourceId = 'route-source';
        const routeLayerId = 'route-layer';

        const drawRoute = () => {
            try {
                // Add Markers
                if (markersRef.current) {
                    markersRef.current.forEach(marker => marker.remove());
                    markersRef.current = [];
                }
                if (sourceCoords) {
                    const sourceMarker = new window.OlaMaps.Marker({ color: 'blue' })
                        .setLngLat([sourceCoords.lon, sourceCoords.lat])
                        .addTo(map);
                    markersRef.current.push(sourceMarker);
                }
                if (destCoords) {
                    const destMarker = new window.OlaMaps.Marker({ color: 'red' })
                        .setLngLat([destCoords.lon, destCoords.lat])
                        .addTo(map);
                    markersRef.current.push(destMarker);
                }

                const featureData = {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    }
                };

                if (map.getSource(routeSourceId)) {
                    map.getSource(routeSourceId).setData(featureData);
                } else {
                    map.addSource(routeSourceId, {
                        type: 'geojson',
                        data: featureData
                    });
                }

                if (!map.getLayer(routeLayerId)) {
                    map.addLayer({
                        id: routeLayerId,
                        type: 'line',
                        source: routeSourceId,
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': '#2563EB',
                            'line-width': 6
                        }
                    });
                }

                const bounds = new window.OlaMaps.LngLatBounds();
                coordinates.forEach(coord => bounds.extend(coord));
                map.fitBounds(bounds, { padding: 50 });
            } catch (e) {
                console.error('Failed to draw route on map:', e);
            }
        };

        if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) {
            map.once('load', drawRoute);
            return;
        }

        drawRoute();

    }, [routes, selectedRouteIndex, sourceCoords, destCoords]);

    const isBike = vehicleType.includes('bike') || vehicleType.includes('scooter') || vehicleType.includes('motorcycle');

    const handleSubmit = async () => {
        const missingFields = [];
        if (!source) missingFields.push('Source');
        if (!destination) missingFields.push('Destination');
        if (!sourceCoords || !destCoords) missingFields.push('Select locations from suggestions');
        if (!routes || routes.length === 0) missingFields.push('Route');
        if (!formData.date) missingFields.push('Date');
        if (!formData.time) missingFields.push('Time');
        if (!selectedVehicleId) missingFields.push('Vehicle');

        const seatsValue = Number(formData.seats);
        const priceValue = Number(formData.priceBySeat);
        if (!Number.isFinite(seatsValue) || seatsValue <= 0) missingFields.push('Seats');
        if (!Number.isFinite(priceValue) || priceValue <= 0) missingFields.push('Price per seat');

        if (missingFields.length > 0) {
            alert(`Please fill in all required fields: ${missingFields.join(', ')}`);
            return;
        }

        setLoading(true);
        try {
            const token = await authService.getToken();

            // Prepare payload
            const rideData = {
                origin: {
                    city: sourceCoords?.city || source,
                    coordinates: [sourceCoords.lon, sourceCoords.lat]
                },
                destination: {
                    city: destCoords?.city || destination,
                    coordinates: [destCoords.lon, destCoords.lat]
                },
                route: routes[selectedRouteIndex] ? {
                    polyline: routes[selectedRouteIndex].polyline,
                    distance: routes[selectedRouteIndex].distance,
                    duration: routes[selectedRouteIndex].duration
                } : null,
                vehicleId: selectedVehicleId,
                departureDate: formData.date,
                departureTime: formData.time,
                totalSeats: seatsValue,
                pricePerSeat: priceValue,
                intermediateStops: selectedStops.map((stop) => ({
                    id: stop.id,
                    name: stop.name,
                    lat: Number(stop.lat),
                    lng: Number(stop.lng)
                })).filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)),
                luggageAllowed: formData.luggageAllowed,
                maxLuggageWeight: formData.luggageAllowed ? Number(formData.luggageCapacity) : 0,
                description: formData.description,
                preferences: {
                    luggageAllowed: formData.luggageAllowed,
                    luggageCapacity: formData.luggageAllowed ? Number(formData.luggageCapacity) : 0,
                    description: formData.description,
                    instantBooking: true
                }
            };

            const response = await api.post('/rides', rideData, token);

            if (response.success || response.data) {
                alert('Ride published successfully!');
                navigate('/provider-home'); // Redirect to provider home
            }
        } catch (error) {
            console.error('Error publishing ride:', error);
            alert('Failed to publish ride. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white p-4 shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <button onClick={() => step === 1 ? navigate(-1) : setStep(1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
                        <ArrowLeft size={20} className="text-gray-700" />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">{step === 1 ? 'Plan Route' : 'Ride Details'}</h1>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 relative overflow-auto">
                {step === 1 ? (
                    <div className="flex flex-col h-full">
                        {/* Map Area */}

                        <div className="relative bg-gray-200 h-[45vh] max-h-[420px] min-h-[280px] z-0">
                            <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
                        </div>

                        {/* Search & Route Selection Panel */}
                        <div className="bg-white p-4 rounded-t-2xl shadow-lg -mt-4 z-20 relative">
                            <div className="space-y-4 mb-6">
                                {/* From Input */}
                                <div className="relative">
                                    <div className="absolute left-3 top-3 text-blue-600"><MapPin size={18} /></div>
                                    <input
                                        type="text"
                                        placeholder="From (Start Location)"
                                        value={source}
                                        onChange={(e) => {
                                            setSource(e.target.value);
                                            setSourceCoords(null);
                                            setRoutes([]);
                                            searchAddress(e.target.value, setSourceSuggestions);
                                        }}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="mt-1 text-[10px] text-gray-400">Select a suggestion to confirm location.</div>
                                    {sourceSuggestions.length > 0 && (
                                        <div className="absolute z-50 w-full bg-white shadow-xl rounded-b-xl mt-1 border border-gray-100 max-h-48 overflow-y-auto">
                                            {sourceSuggestions.map((item, idx) => (
                                                <div key={idx} onClick={() => handleSelectLocation(item, 'source')} className="p-3 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-50 last:border-0">
                                                    {item.name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* To Input */}
                                <div className="relative">
                                    <div className="absolute left-3 top-3 text-red-600"><MapPin size={18} /></div>
                                    <input
                                        type="text"
                                        placeholder="To (Destination)"
                                        value={destination}
                                        onChange={(e) => {
                                            setDestination(e.target.value);
                                            setDestCoords(null);
                                            setRoutes([]);
                                            searchAddress(e.target.value, setDestSuggestions);
                                        }}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="mt-1 text-[10px] text-gray-400">Select a suggestion to confirm location.</div>
                                    {destSuggestions.length > 0 && (
                                        <div className="absolute z-50 w-full bg-white shadow-xl rounded-b-xl mt-1 border border-gray-100 max-h-48 overflow-y-auto">
                                            {destSuggestions.map((item, idx) => (
                                                <div key={idx} onClick={() => handleSelectLocation(item, 'destination')} className="p-3 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-50 last:border-0">
                                                    <MapPin size={14} className="inline mr-2 text-gray-400" />
                                                    {item.name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Route Selection */}
                            {routes.length > 0 && (
                                <div className="space-y-3 mb-6">
                                    <h3 className="text-sm font-bold text-gray-900">Select Route ({routes.length} Found)</h3>
                                    {routes.map((route, idx) => {
                                        const isFastest = idx === routes.reduce((iMin, x, i, arr) => x.duration < arr[iMin].duration ? i : iMin, 0);
                                        const isShortest = idx === routes.reduce((iMin, x, i, arr) => x.distance < arr[iMin].distance ? i : iMin, 0);

                                        const hrs = Math.floor(route.duration / 3600);
                                        const mins = Math.round((route.duration % 3600) / 60);
                                        const timeString = hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;

                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => setSelectedRouteIndex(idx)}
                                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedRouteIndex === idx ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`p-1.5 rounded-full ${selectedRouteIndex === idx ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                                            <Navigation size={16} />
                                                        </div>
                                                        <span className={`font-bold text-sm ${selectedRouteIndex === idx ? 'text-blue-900' : 'text-gray-900'}`}>
                                                            {route.via?.name ? `Via ${route.via.name}` : `Route ${idx + 1}`}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {isFastest && <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200">FASTEST</span>}
                                                        {isShortest && <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full border border-purple-200">SHORTEST</span>}
                                                    </div>
                                                </div>

                                                <div className="flex items-baseline gap-4 ml-9 mb-3">
                                                    <div>
                                                        <p className="text-xs text-gray-400 font-medium">Distance</p>
                                                        <p className="text-sm font-bold text-gray-700">{(route.distance / 1000).toFixed(1)} km</p>
                                                    </div>
                                                    <div className="w-px h-8 bg-gray-200"></div>
                                                    <div>
                                                        <p className="text-xs text-gray-400 font-medium">Est. Time</p>
                                                        <p className={`text-sm font-bold ${isFastest ? 'text-green-600' : 'text-gray-700'}`}>
                                                            {timeString}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            <button
                                onClick={() => setStep(2)}
                                disabled={routes.length === 0}
                                className={`w-full py-3.5 rounded-xl font-bold text-white transition-all ${routes.length > 0 ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200' : 'bg-gray-300 cursor-not-allowed'
                                    }`}
                            >
                                Continue to Details
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 space-y-6 max-w-lg mx-auto">
                        {/* Vehicle Selection */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Briefcase size={20} className="text-blue-600" />
                                Vehicle
                            </h2>
                            {vehicles.length > 0 ? (
                                <select
                                    value={selectedVehicleId}
                                    onChange={handleVehicleChange}
                                    className="w-full p-2.5 bg-gray-50 rounded-lg text-sm border border-gray-200 focus:ring-1 focus:ring-blue-500 outline-none"
                                >
                                    {vehicles.map(v => (
                                        <option key={v.id || v._id} value={v.id || v._id}>
                                            {v.make || v.details?.make} {v.model || v.details?.model} ({v.licensePlate || v.details?.licensePlate})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-red-500 text-sm">No confirmed vehicles found. Please add a vehicle first.</p>
                            )}
                        </div>

                        {/* Ride Details Form */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Briefcase size={20} className="text-blue-600" />
                                Ride Details
                            </h2>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">Date</label>
                                    <div className="relative">
                                        <Calendar size={16} className="absolute left-3 top-3 text-gray-400" />
                                        <input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                            className="w-full pl-9 pr-3 py-2.5 bg-gray-50 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">Time</label>
                                    <div className="relative">
                                        <Clock size={16} className="absolute left-3 top-3 text-gray-400" />
                                        <input
                                            type="time"
                                            value={formData.time}
                                            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                            className="w-full pl-9 pr-3 py-2.5 bg-gray-50 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Users size={20} className="text-blue-600" />
                                Passengers & Pricing
                            </h2>

                            {/* Seat Count - Only if NOT a bike */}
                            {!isBike ? (
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">Available Seats</label>
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => setFormData(p => ({ ...p, seats: Math.max(1, p.seats - 1) }))}
                                            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 hover:bg-gray-200"
                                        >-</button>
                                        <span className="text-xl font-bold text-gray-900 w-8 text-center">{formData.seats}</span>
                                        <button
                                            onClick={() => setFormData(p => ({ ...p, seats: Math.min(10, p.seats + 1) }))}
                                            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 hover:bg-gray-200"
                                        >+</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-yellow-50 text-yellow-700 text-xs rounded-lg">
                                    Bike rides allow 1 passenger by default.
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">Price per Seat (₹)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 font-bold text-gray-400">₹</span>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={formData.priceBySeat}
                                        onChange={(e) => setFormData({ ...formData, priceBySeat: e.target.value })}
                                        className="w-full pl-8 pr-3 py-2.5 bg-gray-50 rounded-lg text-sm font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Recommended: ₹{(routes[selectedRouteIndex]?.distance / 1000 * 5).toFixed(0)} based on distance</p>
                            </div>
                        </div>

                        {/* Luggage - Only if NOT a bike */}
                        {!isBike && (
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <Briefcase size={20} className="text-blue-600" />
                                        Luggage
                                    </h2>
                                    <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                        <input
                                            type="checkbox"
                                            name="toggle"
                                            id="toggle"
                                            checked={formData.luggageAllowed}
                                            onChange={(e) => setFormData({ ...formData, luggageAllowed: e.target.checked })}
                                            className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                            style={{ right: formData.luggageAllowed ? '0' : 'auto', left: formData.luggageAllowed ? 'auto' : '0' }}
                                        />
                                        <label htmlFor="toggle" className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${formData.luggageAllowed ? 'bg-green-400' : 'bg-gray-300'}`}></label>
                                    </div>
                                </div>

                                {formData.luggageAllowed && (
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 mb-1 block">Max Weight (kg)</label>
                                        <input
                                            type="number"
                                            placeholder="10"
                                            value={formData.luggageCapacity}
                                            onChange={(e) => setFormData({ ...formData, luggageCapacity: e.target.value })}
                                            className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className={`w-full bg-blue-900 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-800 transition-all ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {loading ? 'Publishing...' : 'Publish Ride'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Add simple switch CSS via style tag
const style = document.createElement('style');
style.textContent = `
.toggle-checkbox:checked {
  right: 0;
  border-color: #68D391;
}
.toggle-checkbox {
  right: auto;
  left: 0;
  transition: all 0.3s;
}
`;
document.head.appendChild(style);
