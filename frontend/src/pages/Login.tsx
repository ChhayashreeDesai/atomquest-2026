import React, { useState, useEffect } from 'react';
import { Mail, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export function Login() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const testCredentials = [
    { track: 'Employee', emails: ['emp1@atomquest.dev', 'emp2@atomquest.dev'] },
    { track: 'Manager', emails: ['manager@atomquest.dev'] },
    { track: 'Admin/HR', emails: ['admin@atomquest.dev'] },
  ];

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);

    try {
      await login(email);
      // Navigation will happen automatically via useEffect above
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your email and try again.');
      console.error('Sign in error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-slate-900">Atomquest</h1>
            <p className="text-slate-600 mt-2">Performance Management System</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            {error && (
              <div className="flex items-center space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@atomquest.dev"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-600">Test Credentials</span>
            </div>
          </div>

          {/* Test Credentials */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
            {testCredentials.map((group) => (
              <div key={group.track}>
                <p className="text-xs font-semibold text-slate-700 mb-1">{group.track} Track:</p>
                <div className="space-y-1">
                  {group.emails.map((testEmail) => (
                    <button
                      key={testEmail}
                      type="button"
                      onClick={() => {
                        setEmail(testEmail);
                        setError('');
                      }}
                      className="w-full text-left text-sm text-blue-600 hover:text-blue-700 hover:bg-white p-2 rounded transition-colors"
                    >
                      {testEmail}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer Info */}
          <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-700">
              <span className="font-semibold">Demo Mode:</span> Click any test credential above to auto-fill and sign in instantly.
            </p>
          </div>
        </div>

        {/* Footer Text */}
        <div className="text-center mt-6 text-slate-600 text-sm">
          <p>© 2026 Atomquest. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
