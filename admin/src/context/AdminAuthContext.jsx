import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AdminAuthContext = createContext();

export const AdminAuthProvider = ({ children }) => {
    const [adminUser, setAdminUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        // Check for existing token in localStorage
        const token = localStorage.getItem('adminToken');
        const storedAdmin = localStorage.getItem('adminUser');

        if (token && storedAdmin) {
            setAdminUser(JSON.parse(storedAdmin));
        }
        setLoading(false);
    }, []);

    // NOTE: Hardcoding 'http://localhost:3000/api' if env var not present, same as original
    const login = async (username, password) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/admin/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('adminToken', data.data.token);
                localStorage.setItem('adminUser', JSON.stringify(data.data.admin));
                setAdminUser(data.data.admin);
                navigate('/admin/dashboard');
                return { success: true };
            } else {
                return { success: false, error: data.error.message };
            }
        } catch (error) {
            console.error('Admin login error:', error);
            return { success: false, error: 'Network error or server unavailable' };
        }
    };

    const logout = () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        setAdminUser(null);
        navigate('/admin/login');
    };

    return (
        <AdminAuthContext.Provider value={{ adminUser, login, logout, loading }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = () => useContext(AdminAuthContext);
