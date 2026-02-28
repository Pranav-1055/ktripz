const { verifyIdToken } = require('../config/firebase');
const jwt = require('jsonwebtoken');

// Use a separate secret for admin or reuse the firebase logic if possible?
// The requirements say "Use JWT-based authentication" and "Create a separate admin login system".
// Since we are creating a custom login for "tripO" user without firebase auth user record,
// we should probably sign our own JWT for the admin session or use a simple secret.
// Given the prompt "structure it so it can be moved to env variables later", I'll use a local secret.

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'tripO_admin_secret_key_change_in_production';

/**
 * Generate Admin Token
 */
const generateAdminToken = (adminUser) => {
    return jwt.sign(
        {
            uid: 'admin-superuser',
            username: adminUser.username,
            role: 'admin'
        },
        ADMIN_JWT_SECRET,
        { expiresIn: '24h' }
    );
};

/**
 * Admin Authentication Middleware
 */
const authenticateAdmin = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'MISSING_TOKEN',
                    message: 'Admin access token is required'
                }
            });
        }

        jwt.verify(token, ADMIN_JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'INVALID_TOKEN',
                        message: 'Invalid or expired admin token'
                    }
                });
            }

            if (decoded.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Not authorized as admin'
                    }
                });
            }

            req.admin = decoded;
            next();
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: {
                code: 'AUTH_ERROR',
                message: 'Authentication failed'
            }
        });
    }
};

module.exports = {
    authenticateAdmin,
    generateAdminToken
};
