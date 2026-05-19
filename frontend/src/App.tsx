import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';
import { EmployeeProgressPage } from './pages/EmployeeProgressPage';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Role-based Route Wrapper
function RoleRoute({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode; 
  allowedRoles: string[] 
}) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    // Redirect to appropriate dashboard for their role
    if (user?.role === 'EMPLOYEE') {
      return <Navigate to="/employee" replace />;
    } else if (user?.role === 'MANAGER') {
      return <Navigate to="/manager" replace />;
    } else if (user?.role === 'ADMIN') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Root redirect handler
function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to role-based dashboard
  switch (user.role) {
    case 'EMPLOYEE':
      return <Navigate to="/employee" replace />;
    case 'MANAGER':
      return <Navigate to="/manager" replace />;
    case 'ADMIN':
      return <Navigate to="/admin" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}

function AnalyticsRoute() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') {
    return <EmployeeProgressPage />;
  }
  return <AnalyticsDashboard />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  // Still loading auth state
  if (loading) {
    return (
      <Routes>
        <Route path="*" element={
          <div className="flex items-center justify-center h-screen bg-slate-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        } />
      </Routes>
    );
  }

  // Not authenticated - only show login
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Authenticated - show all routes
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      
      <Route path="/" element={<RootRedirect />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Employee Routes */}
        <Route
          path="/employee"
          element={
            <RoleRoute allowedRoles={['EMPLOYEE']}>
              <EmployeeDashboard />
            </RoleRoute>
          }
        />

        {/* Manager Routes */}
        <Route
          path="/manager"
          element={
            <RoleRoute allowedRoles={['MANAGER', 'ADMIN']}>
              <ManagerDashboard />
            </RoleRoute>
          }
        />

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </RoleRoute>
          }
        />

        {/* Analytics — role-specific view */}
        <Route
          path="/analytics"
          element={
            <RoleRoute allowedRoles={['EMPLOYEE', 'ADMIN', 'MANAGER']}>
              <AnalyticsRoute />
            </RoleRoute>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
