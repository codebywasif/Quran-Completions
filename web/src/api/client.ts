import axios from 'axios';

/** Shared Axios instance pointed at the NestJS API (proxied in dev). */
export const api = axios.create({
  baseURL: '/api',
});

// Attach the moderator JWT (set after login) to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On auth failure, drop the token and bounce to the login screen.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
