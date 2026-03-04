const express = require('express');
const { query, validationResult } = require('express-validator');
const analyticsService = require('../services/analyticsService');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// GET /api/analytics/provider/overview - Get provider analytics overview
router.get('/provider/overview', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid time range'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const analytics = await analyticsService.getProviderAnalytics(req.user.uid, timeRange);

        res.json({
            success: true,
            data: analytics,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching provider analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/earnings - Get detailed earnings analytics
router.get('/provider/earnings', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
    query('groupBy').optional().isIn(['day', 'week', 'month']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const earnings = await analyticsService.getEarningsAnalytics(req.user.uid, timeRange);

        res.json({
            success: true,
            data: earnings,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching earnings analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/performance - Get performance analytics
router.get('/provider/performance', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const performance = await analyticsService.getPerformanceAnalytics(req.user.uid, timeRange);

        res.json({
            success: true,
            data: performance,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching performance analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/routes - Get route analytics
router.get('/provider/routes', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
    query('sortBy').optional().isIn(['popularity', 'earnings', 'completion']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const routes = await analyticsService.getRouteAnalytics(req.user.uid, timeRange);

        // Apply sorting if requested
        if (req.query.sortBy) {
            const sortBy = req.query.sortBy;
            routes.routes.sort((a, b) => {
                switch (sortBy) {
                    case 'popularity': return b.totalRides - a.totalRides;
                    case 'earnings': return b.totalEarnings - a.totalEarnings;
                    case 'completion': return b.completionRate - a.completionRate;
                    default: return 0;
                }
            });
        }

        res.json({
            success: true,
            data: routes,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching route analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/feedback - Get feedback and rating analytics
router.get('/provider/feedback', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const feedback = await analyticsService.getFeedbackAnalytics(req.user.uid, timeRange);

        res.json({
            success: true,
            data: feedback,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching feedback analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/pricing - Get pricing insights
router.get('/provider/pricing', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const pricing = await analyticsService.getPricingInsights(req.user.uid, timeRange);

        res.json({
            success: true,
            data: pricing,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching pricing insights:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/competitive - Get competitive analysis
router.get('/provider/competitive', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const competitive = await analyticsService.getCompetitiveAnalysis(req.user.uid, timeRange);

        res.json({
            success: true,
            data: competitive,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching competitive analysis:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/demand - Get demand analysis
router.get('/provider/demand', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
    query('route').optional().isString(),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const route = req.query.route;
        const demand = await analyticsService.getDemandAnalysis(req.user.uid, timeRange, route);

        res.json({
            success: true,
            data: demand,
            timeRange,
            route
        });
    } catch (error) {
        console.error('Error fetching demand analysis:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// Platform Analytics Routes (Admin only)

// GET /api/analytics/platform/overview - Get platform overview
router.get('/platform/overview', authMiddleware.authenticateToken, authMiddleware.requireAdmin, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const analytics = await analyticsService.getPlatformAnalytics(timeRange);

        res.json({
            success: true,
            data: analytics,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching platform analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/platform/users - Get user analytics
router.get('/platform/users', authMiddleware.authenticateToken, authMiddleware.requireAdmin, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const userAnalytics = await analyticsService.getUserAnalytics(timeRange);

        res.json({
            success: true,
            data: userAnalytics,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching user analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/platform/routes - Get platform route analytics
router.get('/platform/routes', authMiddleware.authenticateToken, authMiddleware.requireAdmin, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const routeAnalytics = await analyticsService.getPlatformRouteAnalytics(timeRange);

        res.json({
            success: true,
            data: routeAnalytics,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching platform route analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/platform/bookings - Get booking analytics
router.get('/platform/bookings', authMiddleware.authenticateToken, authMiddleware.requireAdmin, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const bookingAnalytics = await analyticsService.getBookingAnalytics(timeRange);

        res.json({
            success: true,
            data: bookingAnalytics,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching booking analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/platform/performance - Get platform performance
router.get('/platform/performance', authMiddleware.authenticateToken, authMiddleware.requireAdmin, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const performance = await analyticsService.getPlatformPerformance(timeRange);

        res.json({
            success: true,
            data: performance,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching platform performance:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/platform/revenue - Get revenue analytics
router.get('/platform/revenue', authMiddleware.authenticateToken, authMiddleware.requireAdmin, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const revenue = await analyticsService.getRevenueAnalytics(timeRange);

        res.json({
            success: true,
            data: revenue,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching revenue analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/platform/growth - Get growth metrics
router.get('/platform/growth', authMiddleware.authenticateToken, authMiddleware.requireAdmin, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const growth = await analyticsService.getGrowthMetrics(timeRange);

        res.json({
            success: true,
            data: growth,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching growth metrics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});
router.get('/provider/trends', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const trends = await analyticsService.getTrendAnalytics(req.user.uid, timeRange);

        res.json({
            success: true,
            data: trends,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching trend analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/dashboard-summary - Get dashboard summary data
router.get('/provider/dashboard-summary', authMiddleware.authenticateToken, authMiddleware.requireProvider, async (req, res) => {
    try {
        const timeRange = '30d';
        
        // Get key metrics for dashboard
        const [earnings, performance, routes, feedback] = await Promise.all([
            analyticsService.getEarningsAnalytics(req.user.uid, timeRange),
            analyticsService.getPerformanceAnalytics(req.user.uid, timeRange),
            analyticsService.getRouteAnalytics(req.user.uid, timeRange),
            analyticsService.getFeedbackAnalytics(req.user.uid, timeRange)
        ]);

        const summary = {
            earnings: {
                total: earnings.total,
                growth: earnings.growth,
                projectedMonthly: earnings.projectedMonthly
            },
            performance: {
                totalRides: performance.totalRides,
                completionRate: performance.completionRate,
                performanceScore: performance.performanceScore
            },
            routes: {
                totalRoutes: routes.totalRoutes,
                topRoute: routes.popularRoutes[0] || null,
                recommendations: routes.recommendations.slice(0, 3)
            },
            feedback: {
                averageRating: feedback.averageRating,
                totalReviews: feedback.totalReviews,
                improvementAreas: feedback.improvementAreas.slice(0, 2)
            }
        };

        res.json({
            success: true,
            data: summary,
            timeRange
        });
    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// GET /api/analytics/provider/export - Export analytics data
router.get('/provider/export', authMiddleware.authenticateToken, authMiddleware.requireProvider, [
    query('timeRange').optional().isIn(['7d', '30d', '90d', '1y']),
    query('format').optional().isIn(['json', 'csv']),
    query('sections').optional().isString(),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }

        const timeRange = req.query.timeRange || '30d';
        const format = req.query.format || 'json';
        const sections = req.query.sections ? req.query.sections.split(',') : ['all'];

        const analytics = await analyticsService.getProviderAnalytics(req.user.uid, timeRange);

        // Filter sections if specified
        let exportData = analytics;
        if (!sections.includes('all')) {
            exportData = {};
            sections.forEach(section => {
                if (analytics[section]) {
                    exportData[section] = analytics[section];
                }
            });
        }

        if (format === 'csv') {
            // Convert to CSV format (simplified)
            const csv = this.convertToCSV(exportData);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${timeRange}.csv"`);
            res.send(csv);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${timeRange}.json"`);
            res.json({
                success: true,
                data: exportData,
                exportedAt: new Date().toISOString(),
                timeRange
            });
        }
    } catch (error) {
        console.error('Error exporting analytics:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
    // Simplified CSV conversion - would need more sophisticated implementation
    const headers = ['Metric', 'Value'];
    const rows = [headers.join(',')];
    
    function addRows(obj, prefix = '') {
        Object.entries(obj).forEach(([key, value]) => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                addRows(value, fullKey);
            } else {
                rows.push(`"${fullKey}","${value}"`);
            }
        });
    }
    
    addRows(data);
    return rows.join('\n');
}

module.exports = router;