import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import PassengerHome from './pages/PassengerHome';
import PassengerDetails from './pages/PassengerDetails';
import ServiceProviderDetails from './pages/ServiceProviderDetails';
import VehicleInformation from './pages/VehicleInformation';
import Profile from './pages/Profile';
import Register from './pages/Register';
import Login from './pages/Login';
import VerifyEmail from './pages/VerifyEmail';
import PassengerLogin from './pages/PassengerLogin';
import ProviderLogin from './pages/ProviderLogin';
import ProviderHome from './pages/ProviderHome';
import PassengerTrips from './pages/PassengerTrips';
import PassengerBookings from './pages/PassengerBookings';
import MyRides from './pages/MyRides';
import ScheduleRide from './pages/ScheduleRide';
import RideDetails from './pages/RideDetails';
import BookingDetails from './pages/BookingDetails';
import CreateRideFromRoute from './pages/CreateRideFromRoute';
import SplashScreen from './components/common/SplashScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AdminAuthProvider } from './admin/context/AdminAuthContext';
import AdminLogin from './admin/pages/AdminLogin';
import AdminLayout from './admin/components/AdminLayout';
import AdminDashboard from './admin/pages/AdminDashboard';
import UserList from './admin/pages/UserList';

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <div className={showSplash ? 'hidden' : ''}>
        <BrowserRouter>
          <ErrorBoundary>
            <AdminAuthProvider>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/passenger-home" element={<PassengerHome />} />
                <Route path="/passenger-trips" element={<PassengerTrips />} />
                <Route path="/passenger-bookings" element={<PassengerBookings />} />
                <Route path="/provider-home" element={<ProviderHome />} />
                <Route path="/passenger-details" element={<PassengerDetails />} />
                <Route path="/service-provider-details" element={<ServiceProviderDetails />} />
                <Route path="/vehicle-information" element={<VehicleInformation />} />
                <Route path="/my-rides" element={<MyRides />} />
                <Route path="/schedule-ride" element={<ScheduleRide />} />
                <Route path="/create-ride-from-route" element={<CreateRideFromRoute />} />
                <Route path="/ride/:id" element={<RideDetails />} />
                <Route path="/booking/:id" element={<BookingDetails />} />
                <Route path="/register" element={<Register />} />
                <Route path="/login" element={<Login />} />
                <Route path="/login/passenger" element={<PassengerLogin />} />
                <Route path="/login/provider" element={<ProviderLogin />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/profile" element={<Profile />} />

                {/* Admin Routes */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="passengers" element={<UserList type="passenger" />} />
                  <Route path="providers" element={<UserList type="provider" />} />
                </Route>

                {/* Redirect dashboard to profile for backward compatibility if any */}
                <Route path="/dashboard" element={<Navigate to="/profile" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AdminAuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </div >
    </>
  );
}

export default App;
