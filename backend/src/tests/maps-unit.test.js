const mapsService = require('../utils/maps');

describe('Maps Service Unit Tests', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between Paris and Lyon', () => {
      const paris = { lat: 48.8566, lng: 2.3522 };
      const lyon = { lat: 45.7640, lng: 4.8357 };
      
      const distance = mapsService.calculateDistance(paris, lyon);
      
      // Distance should be approximately 392 km
      expect(distance).toBeGreaterThan(390);
      expect(distance).toBeLessThan(400);
    });

    it('should return 0 for same coordinates', () => {
      const point = { lat: 48.8566, lng: 2.3522 };
      const distance = mapsService.calculateDistance(point, point);
      
      expect(distance).toBe(0);
    });

    it('should calculate distance between New York and Los Angeles', () => {
      const nyc = { lat: 40.7128, lng: -74.0060 };
      const la = { lat: 34.0522, lng: -118.2437 };
      
      const distance = mapsService.calculateDistance(nyc, la);
      
      // Distance should be approximately 3944 km
      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });
  });

  describe('toRadians', () => {
    it('should convert degrees to radians correctly', () => {
      expect(mapsService.toRadians(0)).toBe(0);
      expect(mapsService.toRadians(90)).toBeCloseTo(Math.PI / 2);
      expect(mapsService.toRadians(180)).toBeCloseTo(Math.PI);
      expect(mapsService.toRadians(360)).toBeCloseTo(2 * Math.PI);
    });
  });

  describe('decodePolyline', () => {
    it('should decode a simple polyline', () => {
      // Simple polyline encoding for testing
      const polyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
      const points = mapsService.decodePolyline(polyline);
      
      expect(Array.isArray(points)).toBe(true);
      expect(points.length).toBeGreaterThan(0);
      
      points.forEach(point => {
        expect(point).toHaveProperty('lat');
        expect(point).toHaveProperty('lng');
        expect(typeof point.lat).toBe('number');
        expect(typeof point.lng).toBe('number');
      });
    });

    it('should handle empty polyline', () => {
      const points = mapsService.decodePolyline('');
      expect(Array.isArray(points)).toBe(true);
      expect(points.length).toBe(0);
    });
  });

  describe('assessAccessibility', () => {
    it('should assess transit station as highly accessible', () => {
      const place = {
        types: ['transit_station', 'point_of_interest'],
        rating: 4.5,
        openNow: true
      };
      
      const assessment = mapsService.assessAccessibility(place);
      
      expect(assessment.score).toBeGreaterThan(3);
      expect(assessment.level).toBe('excellent');
      expect(assessment.factors).toContain('Public transit access');
      expect(assessment.factors).toContain('Highly rated location');
      expect(assessment.factors).toContain('Currently open');
    });

    it('should assess parking location appropriately', () => {
      const place = {
        types: ['parking', 'establishment'],
        rating: 3.5,
        openNow: true
      };
      
      const assessment = mapsService.assessAccessibility(place);
      
      expect(assessment.score).toBeGreaterThan(1);
      expect(assessment.factors).toContain('Parking available');
      expect(assessment.factors).toContain('Currently open');
    });

    it('should assess basic location with lower score', () => {
      const place = {
        types: ['establishment'],
        rating: 3.0,
        openNow: false
      };
      
      const assessment = mapsService.assessAccessibility(place);
      
      expect(assessment.score).toBeLessThan(3);
      expect(assessment.level).toBe('basic');
      expect(assessment.factors.length).toBe(0);
    });

    it('should cap score at maximum of 5', () => {
      const place = {
        types: ['transit_station', 'subway_station', 'bus_station', 'parking'],
        rating: 5.0,
        openNow: true
      };
      
      const assessment = mapsService.assessAccessibility(place);
      
      expect(assessment.score).toBe(5);
      expect(assessment.level).toBe('excellent');
    });

    it('should handle missing properties gracefully', () => {
      const place = {
        types: ['transit_station']
        // Missing rating and openNow
      };
      
      const assessment = mapsService.assessAccessibility(place);
      
      expect(assessment.score).toBe(3);
      expect(assessment.factors).toContain('Public transit access');
      expect(assessment.factors).not.toContain('Highly rated location');
      expect(assessment.factors).not.toContain('Currently open');
    });
  });

  describe('API key handling', () => {
    it('should handle missing API key gracefully', async () => {
      const originalApiKey = mapsService.apiKey;
      mapsService.apiKey = null;
      
      const result = await mapsService.geocodeAddress('Paris, France');
      expect(result).toBeNull();
      
      // Restore original API key
      mapsService.apiKey = originalApiKey;
    });
  });
});