const TransportProvider = require('./backend/src/models/TransportProvider');

// Mock Firebase User
const mockFirebaseUser = {
    uid: 'test-uid-123',
    email: 'test@example.com',
    displayName: 'Test User',
    phoneNumber: '1234567890',
    photoURL: null,
    emailVerified: false
};

// Mock Payload from Frontend
const payload = {
    businessInfo: {
        businessName: "Test Transport",
        licenseNumber: "DL12345"
    },
    personalInfo: {
        fullName: "Test Name",
        dateOfBirth: "1990-01-01",
        gender: "Male",
        phone: "1234567890"
    },
    fleetInfo: {
        vehicleTypes: ["2wheeler"],
        vehicles: [{
            name: "Bike",
            type: "2wheeler",
            color: "Red",
            plate: "MH12AB1234",
            licenseIssued: "2020-01-01"
        }]
    },
    location: {
        city: "Pune",
        state: "Maharashtra",
        country: "India",
        coordinates: { latitude: 18.52, longitude: 73.85 },
        fullAddress: "Pune, MH"
    },
    onboardingCompleted: true,
    profile: {
        name: "Test Name",
        dateOfBirth: "1990-01-01",
        gender: "Male",
        phone: "1234567890"
    }
};

try {
    console.log("Attempting to create TransportProvider instance...");
    const provider = TransportProvider.fromFirebaseUser(mockFirebaseUser, payload);
    console.log("Instance created successfully.");

    console.log("Attempting to call toJSON()...");
    const json = provider.toJSON();
    console.log("toJSON() successful.");
    console.log(JSON.stringify(json, null, 2));

} catch (error) {
    console.error("CRASH DETECTED:");
    console.error(error);
}
