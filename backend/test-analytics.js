// Simple test script for analytics functionality
const express = require('express');
const analyticsService = require('./src/services/analyticsService');

// Mock Firebase admin
const mockFirebaseAdmin = {
  database: () => ({
    ref: (path) => ({
      orderByChild: (field) => ({
        equalTo: (value) => ({
          once: (event) => Promise.resolve({
            exists: () => true,
            val: () => generateMockData(path, field, value)
          })
        })
      }),
      once: (event) => Promise.resolve({
        exists: () => true,
        val: () => generateMockData(path)
      })
    })
  })
};

// Generate mock data for testing
function generateMockData(path, field = null, value = null) {
  if (path === 'rides') {
    return {
      'ride1': {
        id: 'ride1',
        driverId: 'provider1',
        origin: { city: 'Mumbai', address: 'Andheri' },
        destination: { city: 'Pune', address: 'Shivaji Nagar' },
        departureDate: '2024-01-15',
        departureTime: '09:00',
        pricePerSeat: 300,
        totalSeats: 4,
        availableSeats: 1,
        status: 'completed',
        createdAt: '2024-01-10T10:00:00Z',
        vehicle: { make: 'Honda', model: 'City', id: 'vehicle1' }
      },
      'ride2': {
        id: 'ride2',
        driverId: 'provider1',
        origin: { city: 'Delhi', address: 'CP' },
        destination: { city: 'Agra', address: 'Taj Mahal' },
        departureDate: '2024-01-20',
        departureTime: '14:00',
        pricePerSeat: 250,
        totalSeats: 4,
        availableSeats: 2,
        status: 'completed',
        createdAt: '2024-01-15T14:00:00Z',
        vehicle: { make: 'Maruti', model: 'Swift', id: 'vehicle2' }
      },
      'ride3': {
        id: 'ride3',
        driverId: 'provider2',
        origin: { city: 'Mumbai', address: 'Bandra' },
        destination: { city: 'Pune', address: 'FC Road' },
        departureDate: '2024-01-18',
        departureTime: '11:00',
        pricePerSeat: 320,
        totalSeats: 4,
        availableSeats: 0,
        status: 'completed',
        createdAt: '2024-01-12T11:00:00Z',
        vehicle: { make: 'Toyota', model: 'Innova', id: 'vehicle3' }
      }
    };
  }
  
  if (path === 'reviews') {
    return {
      'review1': {
        id: 'review1',
        revieweeId: 'provider1',
        reviewerId: 'passenger1',
        reviewerRole: 'passenger',
        rating: 4.5,
        comment: 'Great ride, punctual driver',
        createdAt: '2024-01-16T10:00:00Z'
      },
      'review2': {
        id: 'review2',
        revieweeId: 'provider1',
        reviewerId: 'passenger2',
        reviewerRole: 'passenger',
        rating: 4.2,
        comment: 'Good experience, clean car',
        createdAt: '2024-01-21T15:00:00Z'
      }
    };
  }
  
  return {};
}

// Mock the admin module
jest.mock('firebase-admin', () => mockFirebaseAdmin);

async function testAnalytics() {
  console.log('🧪 Testing Analytics Service...\n');
  
  try {
    const service = new analyticsService.constructor();
    
    // Test earnings analytics
    console.log('📊 Testing Earnings Analytics...');
    const earnings = await service.getEarningsAnalytics('provider1', '30d');
    console.log('✅ Earnings Analytics:', {
      total: earnings.total,
      net: earnings.net,
      averagePerRide: earnings.averagePerRide,
      growth: earnings.growth
    });
    
    // Test performance analytics
    console.log('\n🎯 Testing Performance Analytics...');
    const performance = await service.getPerformanceAnalytics('provider1', '30d');
    console.log('✅ Performance Analytics:', {
      totalRides: performance.totalRides,
      completionRate: performance.completionRate,
      avgOccupancyRate: performance.avgOccupancyRate,
      performanceScore: performance.performanceScore
    });
    
    // Test route analytics
    console.log('\n🗺️ Testing Route Analytics...');
    const routes = await service.getRouteAnalytics('provider1', '30d');
    console.log('✅ Route Analytics:', {
      totalRoutes: routes.totalRoutes,
      popularRoutes: routes.popularRoutes.length,
      recommendations: routes.recommendations.length
    });
    
    // Test feedback analytics
    console.log('\n⭐ Testing Feedback Analytics...');
    const feedback = await service.getFeedbackAnalytics('provider1', '30d');
    console.log('✅ Feedback Analytics:', {
      totalReviews: feedback.totalReviews,
      averageRating: feedback.averageRating,
      improvementAreas: feedback.improvementAreas.length
    });
    
    // Test pricing insights
    console.log('\n💰 Testing Pricing Insights...');
    const pricing = await service.getPricingInsights('provider1', '30d');
    console.log('✅ Pricing Insights:', {
      competitivePosition: pricing.competitivePosition,
      optimizationOpportunities: pricing.optimizationOpportunities.length,
      pricingRecommendations: pricing.pricingRecommendations.length
    });
    
    // Test competitive analysis
    console.log('\n🏆 Testing Competitive Analysis...');
    const competitive = await service.getCompetitiveAnalysis('provider1', '30d');
    console.log('✅ Competitive Analysis:', {
      marketShareOverall: competitive.marketShare.overall,
      competitorCount: competitive.competitorAnalysis.competitorCount,
      marketGaps: competitive.marketGaps.length
    });
    
    // Test demand analysis
    console.log('\n📈 Testing Demand Analysis...');
    const demand = await service.getDemandAnalysis('provider1', '30d');
    console.log('✅ Demand Analysis:', {
      topDemandRoutes: demand.topDemandRoutes.length,
      opportunities: demand.opportunities.length,
      providerCoverage: demand.providerCoverage.coveragePercentage
    });
    
    console.log('\n🎉 All analytics tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Analytics test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testAnalytics();