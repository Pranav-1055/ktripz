const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';

export const api = {
    async get(endpoint, token) {
        const headers = { 'Content-Type': 'application/json' };
        const authToken = token || localStorage.getItem('token');
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        } else {
            console.warn(`[API] No token found for GET ${endpoint}`);
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'GET',
            headers,
        });
        return handleResponse(response);
    },

    async post(endpoint, data, token) {
        let headers = {};
        let body;

        if (data instanceof FormData) {
            body = data;
            // Let the browser set Content-Type with boundary
        } else {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(data);
        }

        const authToken = token || localStorage.getItem('token');
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        } else {
            console.warn(`[API] No token found for POST ${endpoint}`);
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers,
            body,
        });
        return handleResponse(response);
    },

    async put(endpoint, data, token) {
        let headers = {};
        let body;

        if (data instanceof FormData) {
            body = data;
        } else {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(data);
        }

        const authToken = token || localStorage.getItem('token');
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'PUT',
            headers,
            body,
        });
        return handleResponse(response);
    },

    async delete(endpoint, token) {
        const headers = { 'Content-Type': 'application/json' };
        const authToken = token || localStorage.getItem('token');
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'DELETE',
            headers,
        });
        return handleResponse(response);
    }
};

async function handleResponse(response) {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
        if (response.status === 401) {
            // console.warn('[API] 401 Unauthorized - Clearing token');
            // localStorage.removeItem('token');
            if (!window.location.pathname.includes('/login')) {
                // window.location.href = '/login'; 
            }
        }
        const error = (data && data.error && typeof data.error === 'object' ? data.error.message : data.error) || (data && data.message) || response.statusText;
        throw new Error(error);
    }
    return data;
}
