import { useAuth } from '../context/AuthContext';
import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { LogOut, Calendar } from 'lucide-react';

export function Layout() {
  // Synchronized to match your real AuthContext.tsx properties perfectly
  const { user, systemDate, setSystemDate, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  // Navigation tabs segmented cleanly by active role profile
  const getNavItems = () => {
    switch (user.role) {
      case 'EMPLOYEE':
        return [
          { path: '/employee', label: 'My Dashboard' },
          { path: '/analytics', label: 'My Progress' },
        ];
      case 'MANAGER':
        return [
          { path: '/manager', label: 'Team Approvals' },
          { path: '/analytics', label: 'Team Analytics' },
        ];
      case 'ADMIN':
        return [
          { path: '/admin', label: 'Governance' },
          { path: '/analytics', label: 'Organization Analytics' },
        ];
      default:
        return [];
    }
  };

  const datePresets = [
    { label: 'May 1 (Goal Creation)', value: '2026-05-01' },
    { label: 'July 15 (Q1 Check-in)', value: '2026-07-15' },
    { label: 'Oct 15 (Q2 Check-in)', value: '2026-10-15' },
    { label: 'Jan 15 (Q3 Check-in)', value: '2027-01-15' },
    { label: 'Apr 15 (Annual Review)', value: '2026-04-15' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = getNavItems();

  // Safely extract the YYYY-MM-DD string format from the context Date object for the select value
  const dateValue = systemDate instanceof Date 
    ? systemDate.toISOString().split('T')[0] 
    : '2026-05-01';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Upper Main Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left: Branding & Role Badge */}
            <div className="flex items-center space-x-3">
              <div className="text-lg font-bold text-blue-600">Atomquest</div>
              <div className="h-6 w-px bg-slate-300"></div>
              <div className="text-sm text-slate-600 flex items-center space-x-2">
                <span className="font-medium text-slate-900">{user.name}</span>
                <span className="text-slate-400">•</span>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                  user.role === 'EMPLOYEE' ? 'bg-blue-100 text-blue-700' :
                  user.role === 'MANAGER' ? 'bg-purple-100 text-purple-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {user.role}
                </span>
              </div>
            </div>

            {/* Right: Simulated Date Controls & Session Exit */}
            <div className="flex items-center space-x-4">
              {/* Date Simulator Dropdown */}
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                <select
                  value={dateValue}
                  onChange={(e) => setSystemDate(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-700"
                >
                  {datePresets.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Layout Divider */}
              <div className="h-6 w-px bg-slate-200"></div>

              {/* Terminate Session Button */}
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-3 py-1 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Renders Nav Bar items dynamically derived from the logged-in role */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-3 font-medium text-sm transition-colors ${
                    isActive
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-slate-600 hover:text-slate-900 border-b-2 border-transparent'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Viewport Workspace Outlet */}
      <div className="pt-6 pb-12">
        <div className="max-w-7xl mx-auto px-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}