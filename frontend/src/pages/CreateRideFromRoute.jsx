import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Calendar, Clock, Users, DollarSign, Car, Route, ChevronRight, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { authService } from '../services/auth';
import { getAuth } from "firebase/auth";
import polyline from '@mapbox/polyline';

const CreateRideFromRoute = () => {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    
    // Form data
    const [formData, setFormData] = useState({
        sourceName: '',
        destinationName: '',
        selectedRoute: null,
        selectedStops: [],
        rideDate: '',
        rideTime: '',
        availableSeats: '',
        pricePerSeat: '',
        selectedVehicle: null
    });
    
    // Data states
    const [predefinedRoutes, setPredefinedRoutes] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [userProfile, setUserProfile] = useState(null);
    const [adminStops, setAdminStops] = useState([]);
    const [adminStopsLoading, setAdminStopsLoading] = useState(true);
    const [adminStopsError, setAdminStopsError] = useState('');
    const [previewRoutes, setPreviewRoutes] = useState([]);
    const [previewRouteIndex, setPreviewRouteIndex] = useState(0);
    const [sourceCoords, setSourceCoords] = useState(null);
    const [destCoords, setDestCoords] = useState(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';

    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const olaMapsRef = useRef(null);
    const stopMarkersRef = useRef([]);
    const routeMarkersRef = useRef([]);
    const missingImageHandlerRef = useRef(null);

    const STOP_DISTANCE_THRESHOLD_METERS = 300;

    // Authentication check
    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            if (firebaseUser) {
                setUser({
                    displayName: firebaseUser.displayName || 'Provider',
                    photoURL: firebaseUser.photoURL,
                    uid: firebaseUser.uid
                });
                setAuthLoading(false);
            } else {
                navigate('/login/provider');
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        if (user && !authLoading) {
            fetchUserProfile();
            fetchVehicles();
        }
    }, [user, authLoading]);

    useEffect(() => {
        const fetchStops = async () => {
            setAdminStopsLoading(true);
            setAdminStopsError('');

            try {
                const response = await fetch(`${API_URL}/stops`);
                const data = await response.json();

                if (data?.success) {
                    setAdminStops(Array.isArray(data.data) ? data.data : []);
                } else {
                    setAdminStops([]);
                    setAdminStopsError(data?.error || 'Failed to load stops');
                }
            } catch (err) {
                console.error('Failed to fetch admin stops:', err);
                setAdminStops([]);
                setAdminStopsError('Failed to load stops');
            } finally {
                setAdminStopsLoading(false);
            }
        };

        fetchStops();
    }, []);

    const fetchUserProfile = async () => {
        try {
            const response = await authService.getProfile();
            if (response.data?.user) {
                setUserProfile(response.data.user);
            }
        } catch (err) {
            console.error('Failed to fetch user profile:', err);
        }
    };

    const fetchVehicles = async () => {
        try {
            const auth = getAuth();
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            
            if (!token) {
                setError('Authentication required');
                return;
            }

            const response = await api.get('/vehicles', token);
            if (response.success) {
                setVehicles(response.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch vehicles:', err);
            setError('Failed to load your vehicles');
        }
    };

    useEffect(() => {
        if (currentStep !== 1) {
            return;
        }

        let cancelled = false;

        const initMap = () => {
            if (cancelled) return;
            if (!mapContainerRef.current) {
                setTimeout(initMap, 200);
                return;
            }

            const OlaMaps = window.OlaMaps;
            if (!OlaMaps) {
                setTimeout(initMap, 300);
                return;
            }

            if (mapInstanceRef.current) return;

            try {
                olaMapsRef.current = new OlaMaps({
                    apiKey: import.meta.env.VITE_OLA_MAPS_API_KEY
                });

                const myMap = olaMapsRef.current.init({
                    style: "https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json",
                    container: mapContainerRef.current,
                    center: [73.8567, 18.5204],
                    zoom: 11
                });

                // Some style layers reference sprite IDs that may be absent in certain SDK/style versions.
                // Add a transparent 1x1 fallback image so rendering continues without noisy runtime errors.
                const missingImageHandler = (event) => {
                    const imageId = event?.id;
                    if (!imageId) return;
                    if (typeof myMap.hasImage === 'function' && myMap.hasImage(imageId)) return;
                    try {
                        myMap.addImage(imageId, {
                            width: 1,
                            height: 1,
                            data: new Uint8Array([0, 0, 0, 0])
                        });
                    } catch (e) {
                        console.warn('Failed to add fallback map image:', imageId, e);
                    }
                };

                if (typeof myMap.on === 'function') {
                    myMap.on('styleimagemissing', missingImageHandler);
                    missingImageHandlerRef.current = missingImageHandler;
                }

                mapInstanceRef.current = myMap;
            } catch (error) {
                console.error("Error initializing Ola Maps:", error);
            }
        };

        initMap();

        return () => {
            cancelled = true;
            stopMarkersRef.current.forEach(marker => marker.remove());
            routeMarkersRef.current.forEach(marker => marker.remove());
            stopMarkersRef.current = [];
            routeMarkersRef.current = [];
            if (mapInstanceRef.current && missingImageHandlerRef.current && typeof mapInstanceRef.current.off === 'function') {
                mapInstanceRef.current.off('styleimagemissing', missingImageHandlerRef.current);
            }
            missingImageHandlerRef.current = null;
            mapInstanceRef.current = null;
            olaMapsRef.current = null;
        };
    }, [currentStep]);

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
                    coordinates: decodedPoints.map(point => [point[1], point[0]])
                };
            } catch (e) {
                console.warn('Failed to decode route polyline, trying coordinate geometry fallback', e);
            }
        }

        const directCoords = route?.geometry?.coordinates || route?.coordinates;
        if (Array.isArray(directCoords) && directCoords.length > 1) {
            const normalized = directCoords.map((coord) => {
                if (!Array.isArray(coord) || coord.length < 2) return coord;
                const [a, b] = coord;
                if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
                    return [b, a];
                }
                return [a, b];
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

    const toRadians = (value) => (value * Math.PI) / 180;

    const haversineMeters = (a, b) => {
        const R = 6371000;
        const lat1 = toRadians(a[1]);
        const lat2 = toRadians(b[1]);
        const dLat = lat2 - lat1;
        const dLng = toRadians(b[0] - a[0]);
        const sinLat = Math.sin(dLat / 2);
        const sinLng = Math.sin(dLng / 2);
        const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    };

    const metersBetween = (a, b) => {
        if (!a || !b) return 0;
        return haversineMeters(a, b);
    };

    const projectPointOnSegment = (p, a, b) => {
        const x1 = a[0];
        const y1 = a[1];
        const x2 = b[0];
        const y2 = b[1];
        const x0 = p[0];
        const y0 = p[1];
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) {
            return { point: [x1, y1], t: 0 };
        }
        const t = ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy);
        const clamped = Math.max(0, Math.min(1, t));
        return { point: [x1 + clamped * dx, y1 + clamped * dy], t: clamped };
    };

    const distanceToRoute = (point, routeCoords) => {
        if (!Array.isArray(routeCoords) || routeCoords.length < 2) {
            return { distance: Infinity, progress: Infinity };
        }

        let minDistance = Infinity;
        let progressAtMin = 0;
        let traveled = 0;

        for (let i = 0; i < routeCoords.length - 1; i += 1) {
            const a = routeCoords[i];
            const b = routeCoords[i + 1];
            const segmentLength = metersBetween(a, b);
            const projection = projectPointOnSegment(point, a, b);
            const projPoint = projection.point;
            const dist = metersBetween(point, projPoint);

            if (dist < minDistance) {
                minDistance = dist;
                progressAtMin = traveled + segmentLength * projection.t;
            }

            traveled += segmentLength;
        }

        return { distance: minDistance, progress: progressAtMin };
    };

    const resolveStopCoords = (stop) => {
        if (!stop) return null;
        const lat = Number(stop.lat ?? stop.latitude);
        const lng = Number(stop.lng ?? stop.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
        }

        const stopId = stop.stopId || stop.id;
        const name = stop.name?.toLowerCase().trim();
        const fallback = adminStops.find((s) => {
            if (!s) return false;
            if (stopId && (s.id === stopId)) return true;
            if (name && s.name?.toLowerCase().trim() === name) return true;
            return false;
        });

        if (fallback) {
            const fallbackLat = Number(fallback.lat);
            const fallbackLng = Number(fallback.lng);
            if (Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)) {
                return { lat: fallbackLat, lng: fallbackLng };
            }
        }

        return null;
    };

    const fitMapToBounds = (coords) => {
        if (!mapInstanceRef.current || !window.OlaMaps) return;
        if (!Array.isArray(coords) || coords.length === 0) return;

        const bounds = new window.OlaMaps.LngLatBounds();
        coords.forEach((coord) => {
            if (!Array.isArray(coord) || coord.length < 2) return;
            bounds.extend(coord);
        });

        if (!bounds.isEmpty()) {
            mapInstanceRef.current.fitBounds(bounds, { padding: 60, maxZoom: 13 });
        }
    };

    useEffect(() => {
        if (currentStep !== 1) return;
        if (!mapInstanceRef.current || !olaMapsRef.current) return;

        stopMarkersRef.current.forEach(marker => marker.remove());
        stopMarkersRef.current = [];

        const coords = [];
        const PopupCtor = window.OlaMaps?.Popup || null;

        const sourceName = formData.sourceName?.toLowerCase().trim();
        const destName = formData.destinationName?.toLowerCase().trim();

        adminStops.forEach((stop) => {
            const stopName = stop?.name?.toLowerCase().trim();
            if (stopName && (stopName === sourceName || stopName === destName)) {
                return;
            }
            const parsed = resolveStopCoords(stop);
            if (!parsed) return;
            const marker = olaMapsRef.current.addMarker({ offset: [0, -10], anchor: 'bottom', color: '#64748b' })
                .setLngLat([parsed.lng, parsed.lat]);

            if (PopupCtor) {
                marker.setPopup(new PopupCtor({ offset: [0, -10] }).setHTML(stop.name || 'Stop'));
            }

            marker.addTo(mapInstanceRef.current);
            stopMarkersRef.current.push(marker);
            coords.push([parsed.lng, parsed.lat]);
        });

        if (coords.length > 0 && !sourceCoords && !destCoords) {
            fitMapToBounds(coords);
        }
    }, [adminStops, currentStep, sourceCoords, destCoords, formData.sourceName, formData.destinationName]);

    useEffect(() => {
        if (currentStep !== 1) return;
        if (!mapInstanceRef.current || !olaMapsRef.current) return;

        routeMarkersRef.current.forEach(marker => marker.remove());
        routeMarkersRef.current = [];

        if (!previewRoutes.length) {
            if (mapInstanceRef.current.getSource && mapInstanceRef.current.getSource('route-source')) {
                mapInstanceRef.current.getSource('route-source').setData({
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: [] }
                });
            }
            return;
        }

        const route = previewRoutes[previewRouteIndex];
        const map = mapInstanceRef.current;
        const coordinates = normalizeMapCoordinates(route?.geometry?.coordinates);
        if (coordinates.length < 2) {
            console.warn('Preview route has insufficient coordinates.', route);
            return;
        }

        const routeSourceId = 'route-source';
        const routeLayerId = 'route-layer';

        const drawRoute = () => {
            try {
                if (routeMarkersRef.current) {
                    routeMarkersRef.current.forEach(marker => marker.remove());
                    routeMarkersRef.current = [];
                }

                if (sourceCoords) {
                    const sourceMarker = new window.OlaMaps.Marker({ color: '#16a34a' })
                        .setLngLat([sourceCoords.lng, sourceCoords.lat])
                        .addTo(map);
                    routeMarkersRef.current.push(sourceMarker);
                }
                if (destCoords) {
                    const destMarker = new window.OlaMaps.Marker({ color: '#dc2626' })
                        .setLngLat([destCoords.lng, destCoords.lat])
                        .addTo(map);
                    routeMarkersRef.current.push(destMarker);
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
                console.error('Failed to draw preview route on map:', e);
            }
        };

        if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) {
            map.once('load', drawRoute);
            return;
        }

        drawRoute();
    }, [currentStep, previewRoutes, previewRouteIndex, sourceCoords, destCoords]);

    const findStopByName = (name) => {
        if (!name) return null;
        const normalized = name.toLowerCase().trim();
        return adminStops.find(stop => stop.name?.toLowerCase().trim() === normalized) || null;
    };

    const normalizeRouteStop = (stop) => {
        if (!stop) return null;
        const coords = resolveStopCoords(stop);
        return {
            stopId: stop.stopId || stop.id,
            id: stop.stopId || stop.id,
            name: stop.name,
            lat: coords?.lat,
            lng: coords?.lng
        };
    };

    const mapPredefinedRoute = (route) => {
        const mappedStops = Array.isArray(route?.stops) ? route.stops.map(normalizeRouteStop).filter(Boolean) : [];
        return {
            id: route.id,
            source: normalizeRouteStop(route.source),
            destination: normalizeRouteStop(route.destination),
            stops: mappedStops
        };
    };

    const normalizeText = (value) => {
        if (!value) return '';
        return value.toString().toLowerCase().trim().replace(/\s+/g, ' ');
    };

    const normalizeId = (value) => {
        if (value === undefined || value === null) return '';
        return value.toString().trim();
    };

    const isSameStop = (a, b) => {
        if (!a || !b) return false;
        const aId = normalizeId(a.stopId || a.id);
        const bId = normalizeId(b.stopId || b.id);
        if (aId && bId) return aId === bId;
        return normalizeText(a.name) === normalizeText(b.name);
    };

    const buildDerivedRoutes = (routes, sourceStop, destStop) => {
        if (!Array.isArray(routes)) return [];

        const derived = [];
        routes.forEach((route) => {
            const source = normalizeRouteStop(route.source);
            const destination = normalizeRouteStop(route.destination);
            const middleStops = Array.isArray(route.stops) ? route.stops.map(normalizeRouteStop).filter(Boolean) : [];
            const sequence = [source, ...middleStops, destination].filter(Boolean);
            if (sequence.length < 2) return;

            const sourceIndex = sequence.findIndex((stop) => isSameStop(stop, sourceStop));
            const destinationIndex = sequence.findIndex((stop) => isSameStop(stop, destStop));
            if (sourceIndex === -1 || destinationIndex === -1 || sourceIndex === destinationIndex) {
                return;
            }

            const segment = sourceIndex < destinationIndex
                ? sequence.slice(sourceIndex, destinationIndex + 1)
                : sequence.slice(destinationIndex, sourceIndex + 1).reverse();

            if (segment.length < 2) return;

            derived.push({
                id: route.id,
                source: segment[0],
                destination: segment[segment.length - 1],
                stops: segment.slice(1, -1)
            });
        });

        const seen = new Set();
        return derived.filter((route) => {
            const key = `${route.id}|${normalizeId(route.source?.stopId || route.source?.id)}|${normalizeId(route.destination?.stopId || route.destination?.id)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    const buildRouteFromPreview = (sourceStop, destStop) => {
        if (!previewRoutes.length) return false;
        const selectedPreview = previewRoutes[previewRouteIndex] || previewRoutes[0];
        const routeCoords = normalizeMapCoordinates(selectedPreview?.geometry?.coordinates);
        if (routeCoords.length < 2) return false;

        const sourceNormalized = normalizeRouteStop(sourceStop);
        const destinationNormalized = normalizeRouteStop(destStop);

        const betweenStops = [];
        adminStops.forEach((stop) => {
            if (isSameStop(stop, sourceStop) || isSameStop(stop, destStop)) return;
            const coords = resolveStopCoords(stop);
            if (!coords) return;
            const check = distanceToRoute([coords.lng, coords.lat], routeCoords);
            if (check.distance <= STOP_DISTANCE_THRESHOLD_METERS) {
                betweenStops.push({ stop, progress: check.progress });
            }
        });

        betweenStops.sort((a, b) => a.progress - b.progress);
        const selectedStops = betweenStops.map((entry) => ({
            ...normalizeRouteStop(entry.stop),
            selected: true
        }));

        setFormData((prev) => ({
            ...prev,
            selectedRoute: {
                id: null,
                source: sourceNormalized,
                destination: destinationNormalized,
                stops: selectedStops.map((stop) => ({ ...stop, selected: undefined })),
                route: selectedPreview
            },
            selectedStops
        }));
        setCurrentStep(3);
        return true;
    };

    useEffect(() => {
        if (currentStep !== 1) return;
        const sourceStop = findStopByName(formData.sourceName);
        const destStop = findStopByName(formData.destinationName);

        if (sourceStop) {
            const coords = resolveStopCoords(sourceStop);
            setSourceCoords(coords ? { lat: coords.lat, lng: coords.lng } : null);
        } else {
            setSourceCoords(null);
        }

        if (destStop) {
            const coords = resolveStopCoords(destStop);
            setDestCoords(coords ? { lat: coords.lat, lng: coords.lng } : null);
        } else {
            setDestCoords(null);
        }
    }, [currentStep, formData.sourceName, formData.destinationName, adminStops]);

    useEffect(() => {
        const fetchPreviewRoutes = async () => {
            if (!sourceCoords || !destCoords) {
                setPreviewRoutes([]);
                return;
            }

            try {
                const token = await authService.getToken();
                const response = await api.post('/rides/calculate-route', {
                    origin: { lat: sourceCoords.lat, lng: sourceCoords.lng },
                    destination: { lat: destCoords.lat, lng: destCoords.lng }
                }, token);

                const success = response?.success ?? response?.data?.success;
                const routeData = response?.data?.routes ? response.data : response?.data?.data;
                const apiRoutes = routeData?.routes || [];

                if (success && apiRoutes.length > 0) {
                    const formattedRoutes = apiRoutes.map((route) => {
                        const extracted = extractRouteCoordinates(route);
                        if (!extracted || !Array.isArray(extracted.coordinates) || extracted.coordinates.length < 2) {
                            return null;
                        }

                        return {
                            distance: route?.distance?.value ?? route?.distance ?? 0,
                            duration: route?.duration?.value ?? route?.duration ?? 0,
                            polyline: extracted.encodedPolyline || route?.polyline || null,
                            geometry: {
                                type: 'LineString',
                                coordinates: extracted.coordinates
                            },
                            bounds: route?.bounds,
                            via: { name: route?.summary || route?.via?.name || '' }
                        };
                    }).filter(Boolean);

                    setPreviewRoutes(formattedRoutes);
                    setPreviewRouteIndex(0);
                } else {
                    setPreviewRoutes([]);
                }
            } catch (error) {
                console.error("Error fetching preview routes:", error);
                setPreviewRoutes([]);
            }
        };

        if (currentStep === 1) {
            fetchPreviewRoutes();
        }
    }, [currentStep, sourceCoords, destCoords]);

    const buildRouteFromStops = async () => {
        const sourceName = formData.sourceName.trim();
        const destName = formData.destinationName.trim();

        if (!sourceName || !destName) {
            setError('Please enter both source and destination');
            return false;
        }

        if (sourceName.toLowerCase() === destName.toLowerCase()) {
            setError('Source and destination cannot be the same');
            return false;
        }

        const sourceStop = adminStops.find(
            stop => stop.name?.toLowerCase().trim() === sourceName.toLowerCase()
        );
        const destStop = adminStops.find(
            stop => stop.name?.toLowerCase().trim() === destName.toLowerCase()
        );

        if (!sourceStop || !destStop) {
            setError('Source and destination must be selected from Admin Stops');
            return false;
        }

        try {
            setLoading(true);
            const token = await authService.getToken();
            const query = new URLSearchParams({
                sourceId: String(sourceStop.id),
                destinationId: String(destStop.id),
                source: sourceStop.name,
                destination: destStop.name
            });

            const response = await api.get(`/routes/search?${query.toString()}`, token);
            let matched = Array.isArray(response?.data) ? response.data.map(mapPredefinedRoute).filter(Boolean) : [];

            // Fallback for legacy datasets where /routes/search misses due schema mismatch.
            if (!matched.length) {
                const allRoutesResponse = await api.get('/routes', token);
                const allRoutes = Array.isArray(allRoutesResponse?.data)
                    ? allRoutesResponse.data.map(mapPredefinedRoute).filter(Boolean)
                    : [];

                const sourceNorm = normalizeText(sourceStop.name);
                const destNorm = normalizeText(destStop.name);
                const sourceId = normalizeId(sourceStop.id);
                const destId = normalizeId(destStop.id);

                matched = allRoutes.filter((route) => {
                    const routeSourceName = normalizeText(route?.source?.name);
                    const routeDestName = normalizeText(route?.destination?.name);
                    const routeSourceId = normalizeId(route?.source?.stopId || route?.source?.id);
                    const routeDestId = normalizeId(route?.destination?.stopId || route?.destination?.id);
                    const idMatch = sourceId && destId && routeSourceId === sourceId && routeDestId === destId;
                    const nameMatch = routeSourceName === sourceNorm && routeDestName === destNorm;
                    return idMatch || nameMatch;
                });

                if (!matched.length) {
                    matched = buildDerivedRoutes(allRoutes, sourceStop, destStop);
                }
            }

            if (!matched.length) {
                const builtFromPreview = buildRouteFromPreview(sourceStop, destStop);
                if (builtFromPreview) {
                    return true;
                }
                setError('No predefined route found for selected source and destination');
                return false;
            }

            if (matched.length === 1) {
                selectRoute(matched[0]);
                return true;
            }

            setPredefinedRoutes(matched);
            setCurrentStep(2);
            return true;
        } catch (err) {
            console.error('Failed to fetch predefined routes:', err);
            setError('Failed to fetch predefined routes');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const selectRoute = (route) => {
        const normalizedStops = (route.stops || []).map((stop) => ({
            ...normalizeRouteStop(stop),
            selected: stop.selected !== false
        })).filter(Boolean);

        setFormData(prev => ({
            ...prev,
            selectedRoute: route,
            selectedStops: normalizedStops // Initially select all intermediate stops
        }));
        setCurrentStep(3);
    };

    const toggleStopSelection = (stopIndex) => {
        setFormData(prev => ({
            ...prev,
            selectedStops: prev.selectedStops.map((stop, index) => 
                index === stopIndex ? { ...stop, selected: !stop.selected } : stop
            )
        }));
    };

    const validateRideDetails = () => {
        const { rideDate, rideTime, availableSeats, pricePerSeat } = formData;
        
        if (!rideDate || !rideTime || !availableSeats || !pricePerSeat) {
            setError('Please fill in all ride details');
            return false;
        }

        const selectedDate = new Date(rideDate + 'T' + rideTime);
        if (selectedDate <= new Date()) {
            setError('Ride date and time must be in the future');
            return false;
        }

        if (parseInt(availableSeats) <= 0) {
            setError('Available seats must be greater than 0');
            return false;
        }

        if (parseFloat(pricePerSeat) <= 0) {
            setError('Price per seat must be greater than 0');
            return false;
        }

        return true;
    };

    const validateVehicleSelection = () => {
        if (!formData.selectedVehicle) {
            setError('Please select a vehicle');
            return false;
        }

        const vehicle = vehicles.find(v => v.id === formData.selectedVehicle);
        if (vehicle && parseInt(formData.availableSeats) > vehicle.details?.seats) {
            setError(`Selected vehicle can only accommodate ${vehicle.details?.seats} passengers`);
            return false;
        }

        return true;
    };

    const handleNext = async () => {
        setError('');
        
        if (currentStep === 1) {
            await buildRouteFromStops();
        } else if (currentStep === 3) {
            if (validateRideDetails()) {
                setCurrentStep(4);
            }
        } else if (currentStep === 4) {
            if (validateVehicleSelection()) {
                setCurrentStep(5);
            }
        }
    };

    const handleCreateRide = async () => {
        setLoading(true);
        setError('');

        try {
            const auth = getAuth();
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            
            if (!token) {
                setError('Authentication required');
                setLoading(false);
                return;
            }

            const selectedVehicle = vehicles.find(v => v.id === formData.selectedVehicle);
            const selectedStopsData = formData.selectedStops
                .filter(stop => stop.selected !== false)
                .map((stop) => ({
                    id: stop.stopId || stop.id,
                    name: stop.name,
                    lat: Number(stop.lat ?? stop.latitude),
                    lng: Number(stop.lng ?? stop.longitude)
                }))
                .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && stop.name);

            const rideData = {
                source: formData.selectedRoute.source,
                destination: formData.selectedRoute.destination,
                intermediateStops: selectedStopsData,
                rideDate: formData.rideDate,
                rideTime: formData.rideTime,
                availableSeats: parseInt(formData.availableSeats),
                pricePerSeat: parseFloat(formData.pricePerSeat),
                vehicle: {
                    id: selectedVehicle.id,
                    make: selectedVehicle.details?.make,
                    model: selectedVehicle.details?.model,
                    licensePlate: selectedVehicle.details?.licensePlate,
                    seats: selectedVehicle.details?.seats,
                    fuelType: selectedVehicle.details?.fuelType,
                    transmission: selectedVehicle.details?.transmission
                },
                routeId: formData.selectedRoute.id,
                createdFromPredefinedRoute: true
            };

            const response = await api.post('/rides/create-from-route', rideData, token);
            
            if (response.success) {
                setSuccess('Ride created successfully!');
                setTimeout(() => {
                    navigate('/provider-home');
                }, 2000);
            } else {
                setError(response.error?.message || 'Failed to create ride');
            }
        } catch (err) {
            console.error('Create ride error:', err);
            setError('Failed to create ride. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="space-y-6">
                        <div className="text-center">
                            <Route className="mx-auto mb-4 text-blue-600" size={48} />
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Find Predefined Route</h2>
                            <p className="text-gray-600">Enter your source and destination from Admin Stops to build the route</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 text-green-500" size={20} />
                                    <input
                                        type="text"
                                        value={formData.sourceName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, sourceName: e.target.value }))}
                                        list="admin-stop-options"
                                        placeholder="Enter source location"
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Destination</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 text-red-500" size={20} />
                                    <input
                                        type="text"
                                        value={formData.destinationName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, destinationName: e.target.value }))}
                                        list="admin-stop-options"
                                        placeholder="Enter destination location"
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <datalist id="admin-stop-options">
                                {adminStops.map((stop) => (
                                    <option key={stop.id} value={stop.name} />
                                ))}
                            </datalist>

                        <div className="relative h-72 w-full rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                            <div ref={mapContainerRef} className="h-full w-full" />
                                {adminStopsLoading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-gray-600">
                                        Loading stops...
                                    </div>
                                )}
                                {!adminStopsLoading && adminStops.length === 0 && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-gray-600">
                                        No admin stops found.
                                    </div>
                                )}
                                {!!adminStopsError && (
                                    <div className="absolute bottom-2 right-2 bg-red-50 text-red-700 border border-red-200 text-xs px-2 py-1 rounded">
                                        {adminStopsError}
                                    </div>
                                )}
                            </div>
                            {previewRoutes.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <h3 className="text-sm font-semibold text-gray-900">
                                        Select Route ({previewRoutes.length} Found)
                                    </h3>
                                    {previewRoutes.map((route, idx) => {
                                        const isActive = idx === previewRouteIndex;
                                        const distanceKm = route?.distance ? (route.distance / 1000).toFixed(1) : '—';
                                        const durationMin = route?.duration ? Math.round(route.duration / 60) : '—';
                                        return (
                                            <button
                                                key={`${idx}-${route?.via?.name || 'route'}`}
                                                type="button"
                                                onClick={() => setPreviewRouteIndex(idx)}
                                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                                                    isActive
                                                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                                                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 text-gray-700'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">
                                                        {route?.via?.name ? `Via ${route.via.name}` : `Route ${idx + 1}`}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {distanceKm} km · {durationMin} min
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Route</h2>
                            <p className="text-gray-600">Choose from available predefined routes</p>
                        </div>

                        <div className="space-y-4">
                            {predefinedRoutes.map((route) => (
                                <div
                                    key={route.id}
                                    onClick={() => selectRoute(route)}
                                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <MapPin size={16} className="text-green-500" />
                                                <span className="font-medium">{route.source.name}</span>
                                                <span className="text-gray-400">→</span>
                                                <MapPin size={16} className="text-red-500" />
                                                <span className="font-medium">{route.destination.name}</span>
                                            </div>
                                            
                                            {route.stops && route.stops.length > 0 && (
                                                <div className="text-sm text-gray-600">
                                                    <span className="font-medium">Stops: </span>
                                                    {route.stops.map((stop, index) => (
                                                        <span key={stop.stopId}>
                                                            {stop.name}
                                                            {index < route.stops.length - 1 ? ', ' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <ChevronRight className="text-gray-400" size={20} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Customize Route & Ride Details</h2>
                            <p className="text-gray-600">Select stops and set ride details</p>
                        </div>

                        {/* Selected Route Display */}
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <h3 className="font-medium text-blue-900 mb-2">Selected Route</h3>
                            <div className="flex items-center gap-2">
                                <MapPin size={16} className="text-green-500" />
                                <span>{formData.selectedRoute?.source.name}</span>
                                <span className="text-gray-400">→</span>
                                <MapPin size={16} className="text-red-500" />
                                <span>{formData.selectedRoute?.destination.name}</span>
                            </div>
                        </div>

                        {/* Intermediate Stops Selection */}
                        {formData.selectedStops.length > 0 && (
                            <div>
                                <h3 className="font-medium text-gray-900 mb-3">Intermediate Stops (Optional Selection)</h3>
                                <div className="space-y-2">
                                    {formData.selectedStops.map((stop, index) => (
                                        <label key={stop.stopId} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                                            <input
                                                type="checkbox"
                                                checked={stop.selected !== false}
                                                onChange={() => toggleStopSelection(index)}
                                                className="rounded text-blue-600"
                                            />
                                            <span className="text-sm text-gray-600">{index + 1}.</span>
                                            <span className="flex-1">{stop.name}</span>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    You can select partial route by choosing specific stops
                                </p>
                            </div>
                        )}

                        {/* Ride Details */}
                        <div className="space-y-4">
                            <h3 className="font-medium text-gray-900">Ride Details</h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-3 text-gray-400" size={20} />
                                        <input
                                            type="date"
                                            value={formData.rideDate}
                                            onChange={(e) => setFormData(prev => ({ ...prev, rideDate: e.target.value }))}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                                    <div className="relative">
                                        <Clock className="absolute left-3 top-3 text-gray-400" size={20} />
                                        <input
                                            type="time"
                                            value={formData.rideTime}
                                            onChange={(e) => setFormData(prev => ({ ...prev, rideTime: e.target.value }))}
                                            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Available Seats</label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-3 text-gray-400" size={20} />
                                        <input
                                            type="number"
                                            value={formData.availableSeats}
                                            onChange={(e) => setFormData(prev => ({ ...prev, availableSeats: e.target.value }))}
                                            placeholder="Enter seats"
                                            min="1"
                                            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Price per Seat (₹)</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-3 text-gray-400" size={20} />
                                        <input
                                            type="number"
                                            value={formData.pricePerSeat}
                                            onChange={(e) => setFormData(prev => ({ ...prev, pricePerSeat: e.target.value }))}
                                            placeholder="Enter price"
                                            min="1"
                                            step="0.01"
                                            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 4:
                return (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Vehicle</h2>
                            <p className="text-gray-600">Choose a vehicle for this ride</p>
                        </div>

                        {vehicles.length === 0 ? (
                            <div className="text-center py-8">
                                <Car className="mx-auto mb-4 text-gray-400" size={48} />
                                <p className="text-gray-600 mb-4">No vehicles found</p>
                                <button
                                    onClick={() => navigate('/vehicle-information')}
                                    className="text-blue-600 font-medium hover:underline"
                                >
                                    Add a vehicle first
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {vehicles.map((vehicle) => (
                                    <div
                                        key={vehicle.id}
                                        onClick={() => setFormData(prev => ({ ...prev, selectedVehicle: vehicle.id }))}
                                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                                            formData.selectedVehicle === vehicle.id
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Car className="text-gray-600" size={24} />
                                                <div>
                                                    <h3 className="font-medium text-gray-900">{vehicle.details?.make} {vehicle.details?.model}</h3>
                                                    <p className="text-sm text-gray-600">{vehicle.details?.fuelType} • {vehicle.details?.licensePlate}</p>
                                                    <p className="text-sm text-gray-500">Capacity: {vehicle.details?.seats} passengers</p>
                                                </div>
                                            </div>
                                            {formData.selectedVehicle === vehicle.id && (
                                                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                                    <span className="text-white text-xs">✓</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {parseInt(formData.availableSeats) > vehicle.details?.seats && (
                                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600 flex items-center gap-2">
                                                <AlertCircle size={16} />
                                                <span>This vehicle cannot accommodate {formData.availableSeats} seats (max: {vehicle.details?.seats})</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );

            case 5:
                const selectedVehicle = vehicles.find(v => v.id === formData.selectedVehicle);
                const selectedStopsCount = formData.selectedStops.filter(stop => stop.selected !== false).length;
                const totalEarnings = parseFloat(formData.pricePerSeat) * parseInt(formData.availableSeats);

                return (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirm Ride Details</h2>
                            <p className="text-gray-600">Review and confirm your ride</p>
                        </div>

                        <div className="space-y-4">
                            {/* Route Summary */}
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="font-medium text-gray-900 mb-3">Route</h3>
                                <div className="flex items-center gap-2 mb-2">
                                    <MapPin size={16} className="text-green-500" />
                                    <span>{formData.selectedRoute?.source.name}</span>
                                    <span className="text-gray-400">→</span>
                                    <MapPin size={16} className="text-red-500" />
                                    <span>{formData.selectedRoute?.destination.name}</span>
                                </div>
                                <p className="text-sm text-gray-600">
                                    {selectedStopsCount} intermediate stops selected
                                </p>
                            </div>

                            {/* Ride Details Summary */}
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="font-medium text-gray-900 mb-3">Ride Details</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-600">Date & Time:</span>
                                        <p className="font-medium">{new Date(formData.rideDate + 'T' + formData.rideTime).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Available Seats:</span>
                                        <p className="font-medium">{formData.availableSeats}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Price per Seat:</span>
                                        <p className="font-medium">₹{formData.pricePerSeat}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Max Earnings:</span>
                                        <p className="font-medium text-green-600">₹{totalEarnings}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Vehicle Summary */}
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="font-medium text-gray-900 mb-3">Vehicle</h3>
                                <div className="flex items-center gap-3">
                                    <Car className="text-gray-600" size={24} />
                                    <div>
                                        <p className="font-medium">{selectedVehicle?.details?.make} {selectedVehicle?.details?.model}</p>
                                        <p className="text-sm text-gray-600">{selectedVehicle?.details?.fuelType} • {selectedVehicle?.details?.licensePlate}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Show loading while checking authentication */}
            {authLoading ? (
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading...</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header */}
                    <header className="bg-white p-4 sticky top-0 z-10 shadow-sm">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => currentStep > 1 ? setCurrentStep(currentStep - 1) : navigate('/provider-home')}
                                className="p-2 hover:bg-gray-100 rounded-full"
                            >
                                <ArrowLeft size={24} className="text-gray-700" />
                            </button>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Create Ride from Route</h1>
                                <p className="text-sm text-gray-600">Step {currentStep} of 5</p>
                            </div>
                        </div>
                    </header>

            {/* Progress Bar */}
            <div className="bg-white px-4 pb-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(currentStep / 5) * 100}%` }}
                    ></div>
                </div>
            </div>

            {/* Content */}
            <div className="p-4">
                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                        <AlertCircle className="text-red-500" size={20} />
                        <span className="text-red-700">{error}</span>
                    </div>
                )}

                {success && (
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <span className="text-green-700">{success}</span>
                    </div>
                )}

                <div className="bg-white rounded-lg p-6">
                    {renderStepContent()}
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex gap-4">
                    {currentStep > 1 && (
                        <button
                            onClick={() => setCurrentStep(currentStep - 1)}
                            className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                        >
                            Back
                        </button>
                    )}
                    
                    {currentStep < 5 ? (
                        <button
                            onClick={handleNext}
                            disabled={loading}
                            className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Loading...' : 'Next'}
                        </button>
                    ) : (
                        <button
                            onClick={handleCreateRide}
                            disabled={loading}
                            className="flex-1 py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Ride'}
                        </button>
                    )}
                </div>
            </div>
            </>
            )}
        </div>
    );
};

export default CreateRideFromRoute;
