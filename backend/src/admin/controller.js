const { getFirestore } = require('../config/firebase'); // Access existing DB
const { generateAdminToken } = require('./middleware');
const User = require('../models/User'); // Use existing User model to manage users
const logger = require('../utils/logger');

// Admin credentials from environment variables
const ADMIN_CREDENTIALS = {
    username: process.env.ADMIN_USERNAME || 'tripO',
    password: process.env.ADMIN_PASSWORD || '123456'
};

const adminController = {
    /**
     * Admin Login
     */
    login: async (req, res) => {
        try {
            const { username, password } = req.body;

            if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
                const token = generateAdminToken({ username });

                logger.info('Admin logged in successfully');

                return res.status(200).json({
                    success: true,
                    data: {
                        token,
                        admin: {
                            username: ADMIN_CREDENTIALS.username,
                            role: 'admin'
                        }
                    }
                });
            }

            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Invalid username or password'
                }
            });

        } catch (error) {
            logger.error('Admin login error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Login failed'
                }
            });
        }
    },

    /**
     * Get Dashboard Stats
     */
    getDashboardStats: async (req, res) => {
        try {
            const db = getFirestore();
            const usersSnapshot = await db.collection('users').get();

            let totalPassengers = 0;
            let totalServiceProviders = 0;
            let authenticatedUsers = 0; // Verified
            let unverifiedUsers = 0;

            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                const user = new User(userData);

                // Count Roles
                if (user.role === 'passenger' || user.role === 'both') totalPassengers++;
                if (user.role === 'provider' || user.role === 'both') totalServiceProviders++;

                // Count Verification Status (Email + Phone verified)
                // Using the helper method from User model if possible, or manual check based on structure
                const isVerified = (user.verification && user.verification.email && user.verification.phone);

                if (isVerified) {
                    authenticatedUsers++;
                } else {
                    unverifiedUsers++;
                }
            });

            res.status(200).json({
                success: true,
                data: {
                    totalPassengers,
                    totalServiceProviders,
                    authenticatedUsers,
                    unverifiedUsers
                }
            });
        } catch (error) {
            logger.error('Admin stats error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to fetch stats'
                }
            });
        }
    },

    /**
     * Get All Users (Passengers or Providers)
     */
    getUsers: async (req, res) => {
        try {
            const { type } = req.query; // 'passenger' or 'provider'
            const db = getFirestore();
            let query = db.collection('users');

            // Ideally we should use database indexing for this, but for now we fetch and filter 
            // since 'role' can be 'both' which makes simple equality queries tricky if not stored as array.
            // Requirement says: "View all Passengers", "View all Service Providers".

            const snapshot = await query.get();
            const users = [];

            snapshot.forEach(doc => {
                const userData = doc.data();
                const user = new User(userData);

                let include = false;
                if (!type) include = true;
                else if (type === 'passenger' && (user.role === 'passenger' || user.role === 'both')) include = true;
                else if (type === 'provider' && (user.role === 'provider' || user.role === 'both')) include = true;

                if (include) {
                    users.push({
                        uid: user.uid,
                        displayName: user.displayName,
                        email: user.email,
                        phoneNumber: user.phoneNumber,
                        photoURL: user.photoURL,
                        role: user.role,
                        verification: user.verification,
                        createdAt: user.createdAt,
                        // Add other necessary fields for the table
                        isVerified: (user.verification?.email && user.verification?.phone)
                    });
                }
            });

            res.status(200).json({
                success: true,
                data: users
            });

        } catch (error) {
            logger.error('Admin get users error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to fetch users'
                }
            });
        }
    },

    /**
     * Delete User
     */
    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;
            const db = getFirestore();

            // 1. Delete from Firestore
            await db.collection('users').doc(id).delete();

            // 2. Delete from Auth (Firebase Admin SDK)
            const { getAuth } = require('firebase-admin/auth');
            await getAuth().deleteUser(id);

            logger.info(`User ${id} deleted by admin`);

            res.status(200).json({
                success: true,
                message: 'User deleted successfully'
            });

        } catch (error) {
            logger.error('Admin delete user error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'DELETE_FAILED',
                    message: 'Failed to delete user'
                }
            });
        }
    },

    /**
     * Patch User (Block, Verify, etc)
     */
    updateUserStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { action, value } = req.body; // action: 'block' | 'verify'
            const db = getFirestore();
            const userRef = db.collection('users').doc(id);

            const doc = await userRef.get();
            if (!doc.exists) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
            }

            const updates = {};

            if (action === 'block') {
                // To block, we can disable the user in Firebase Auth
                const { getAuth } = require('firebase-admin/auth');
                await getAuth().updateUser(id, { disabled: value }); // value: true to block, false to unblock
                updates['metadata.blocked'] = value; // Store status in firestore too if needed, or rely on Auth
            } else if (action === 'verify') {
                // value: true | false
                updates['verification.email'] = value;
                updates['verification.phone'] = value;
                updates['emailVerified'] = value;

                // Also update Auth
                const { getAuth } = require('firebase-admin/auth');
                await getAuth().updateUser(id, { emailVerified: value });
            }

            await userRef.update(updates);

            res.status(200).json({
                success: true,
                message: `User ${action} status updated`
            });

        } catch (error) {
            logger.error('Admin update user error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'UPDATE_FAILED',
                    message: 'Failed to update user status'
                }
            });
        }
    },

    /**
     * Add New Stop
     */
    addStop: async (req, res) => {
        try {
            const { name, lat, lng } = req.body;

            if (!name || !lat || !lng) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Name, latitude, and longitude are required' }
                });
            }

            const db = getFirestore();
            const newStop = {
                name,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                created_by: 'admin',
                created_at: new Date().toISOString()
            };

            const docRef = await db.collection('stops').add(newStop);

            res.status(201).json({
                success: true,
                data: { id: docRef.id, ...newStop }
            });

        } catch (error) {
            logger.error('Admin add stop error:', error);
            res.status(500).json({
                success: false,
                error: { message: 'Failed to add stop' }
            });
        }
    },

    /**
     * Get All Stops
     */
    getStops: async (req, res) => {
        try {
            const db = getFirestore();
            const snapshot = await db.collection('stops').orderBy('created_at', 'asc').get();
            const stops = [];

            snapshot.forEach(doc => {
                stops.push({ id: doc.id, ...doc.data() });
            });

            res.status(200).json({
                success: true,
                data: stops
            });

        } catch (error) {
            logger.error('Admin get stops error:', error);
            res.status(500).json({
                success: false,
                error: { message: 'Failed to fetch stops' }
            });
        }
    },

    /**
     * Delete Stop
     */
    deleteStop: async (req, res) => {
        try {
            const { id } = req.params;
            const db = getFirestore();

            await db.collection('stops').doc(id).delete();

            res.status(200).json({
                success: true,
                message: 'Stop deleted successfully'
            });

        } catch (error) {
            logger.error('Admin delete stop error:', error);
            res.status(500).json({
                success: false,
                error: { message: 'Failed to delete stop' }
            });
        }
    },

    /**
     * Add Predefined Route
     */
    addRoute: async (req, res) => {
        try {
            const { source, destination, stops, active = true } = req.body;

            // Validation
            if (!source || !source.name) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_SOURCE',
                        message: 'Source stop name is required'
                    }
                });
            }

            if (!destination || !destination.name) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_DESTINATION',
                        message: 'Destination stop name is required'
                    }
                });
            }

            if (source.name.toLowerCase().trim() === destination.name.toLowerCase().trim()) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'SAME_SOURCE_DESTINATION',
                        message: 'Source and destination cannot be the same'
                    }
                });
            }

            if (!stops || stops.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INTERMEDIATE_STOPS_REQUIRED',
                        message: 'At least one intermediate stop is required'
                    }
                });
            }

            const db = getFirestore();

            const routeData = {
                source,
                destination,
                stops: stops || [],
                active: Boolean(active),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'admin'
            };

            const docRef = await db.collection('routes').add(routeData);

            logger.info(`Route created: ${docRef.id} from ${source.name} to ${destination.name}`);

            res.status(201).json({
                success: true,
                data: {
                    id: docRef.id,
                    ...routeData
                }
            });

        } catch (error) {
            logger.error('Error adding route:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'ADD_ROUTE_ERROR',
                    message: 'Failed to add route'
                }
            });
        }
    },

    /**
     * Get All Routes
     */
    getRoutes: async (req, res) => {
        try {
            const db = getFirestore();
            const snapshot = await db.collection('routes')
                .orderBy('createdAt', 'desc')
                .get();

            const routes = [];
            snapshot.forEach(doc => {
                routes.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            res.status(200).json({
                success: true,
                data: routes
            });

        } catch (error) {
            logger.error('Error fetching routes:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'FETCH_ROUTES_ERROR',
                    message: 'Failed to fetch routes'
                }
            });
        }
    },

    /**
     * Update Route
     */
    updateRoute: async (req, res) => {
        try {
            const { id } = req.params;
            const { source, destination, stops, active } = req.body;

            const db = getFirestore();
            const routeRef = db.collection('routes').doc(id);
            const routeDoc = await routeRef.get();

            if (!routeDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'ROUTE_NOT_FOUND',
                        message: 'Route not found'
                    }
                });
            }

            const updateData = {
                updatedAt: new Date().toISOString()
            };

            if (source) updateData.source = source;
            if (destination) updateData.destination = destination;
            if (stops !== undefined) updateData.stops = stops;
            if (active !== undefined) updateData.active = Boolean(active);

            await routeRef.update(updateData);

            logger.info(`Route updated: ${id}`);

            res.status(200).json({
                success: true,
                message: 'Route updated successfully'
            });

        } catch (error) {
            logger.error('Error updating route:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'UPDATE_ROUTE_ERROR',
                    message: 'Failed to update route'
                }
            });
        }
    },

    /**
     * Delete Route
     */
    deleteRoute: async (req, res) => {
        try {
            const { id } = req.params;
            const db = getFirestore();

            await db.collection('routes').doc(id).delete();

            logger.info(`Route deleted: ${id}`);

            res.status(200).json({
                success: true,
                message: 'Route deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting route:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'DELETE_ROUTE_ERROR',
                    message: 'Failed to delete route'
                }
            });
        }
    }
};

module.exports = adminController;
