import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import UserList from './pages/UserList';
import StopsManagement from './pages/StopsManagement';
import RoutesManagement from './pages/RoutesManagement';
import AdminLayout from './components/AdminLayout';

function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <Routes>
          {/* Public Route */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Protected Routes */}
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/stops" element={<StopsManagement />} />
            <Route path="/admin/routes" element={<RoutesManagement />} />
            <Route path="/admin/passengers" element={<UserList type="passenger" />} />
            <Route path="/admin/providers" element={<UserList type="provider" />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}

export default App;
