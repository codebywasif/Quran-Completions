import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import CurrentWeek from './pages/CurrentWeek';
import Allocation from './pages/Allocation';
import Members from './pages/Members';
import Outbox from './pages/Outbox';
import Connection from './pages/Connection';
import Settings from './pages/Settings';
import History from './pages/History';
import type { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<CurrentWeek />} />
            <Route path="allocation" element={<Allocation />} />
            <Route path="outbox" element={<Outbox />} />
            <Route path="members" element={<Members />} />
            <Route path="history" element={<History />} />
            <Route path="connection" element={<Connection />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
