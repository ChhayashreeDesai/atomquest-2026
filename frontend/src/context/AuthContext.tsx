import { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
}

interface AuthContextType {
  user: User | null;
  systemDate: Date;
  isLoading: boolean;
  loading: boolean; // Alias for isLoading for compatibility
  login: (email: string) => Promise<void>;
  logout: () => void;
  setSystemDate: (date: string) => void;
  setRole: (role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Index profiles directly by unique corporate email addresses
const mockUsersByEmail: Record<string, User> = {
  'emp1@atomquest.dev': {
    id: 'emp-001',
    name: 'Alice Johnson',
    email: 'emp1@atomquest.dev',
    role: 'EMPLOYEE',
  },
  'emp2@atomquest.dev': {
    id: 'emp-002',
    name: 'Robert Smith',
    email: 'emp2@atomquest.dev',
    role: 'EMPLOYEE',
  },
  'manager@atomquest.dev': {
    id: 'mgr-001',
    name: 'Manager L1',
    email: 'manager@atomquest.dev',
    role: 'MANAGER',
  },
  'admin@atomquest.dev': {
    id: 'admin-001',
    name: 'Admin User',
    email: 'admin@atomquest.dev',
    role: 'ADMIN',
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [systemDate, setSystemDateState] = useState<Date>(new Date('2026-05-01'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeAuth();

    const handleStorageChange = () => {
      const savedUser = sessionStorage.getItem('user');
      if (savedUser) setUser(JSON.parse(savedUser));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const initializeAuth = () => {
    const savedUser = sessionStorage.getItem('user');
    const savedDate = sessionStorage.getItem('systemDate');

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (err) {
        sessionStorage.removeItem('user');
      }
    }
    if (savedDate) {
      setSystemDateState(new Date(savedDate));
    }
    setIsLoading(false);
  };

  const login = async (email: string) => {
    try {
      setIsLoading(true);
      
      // Call the actual backend login API
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const userData = await response.json();
      
      setUser(userData);
      sessionStorage.setItem('user', JSON.stringify(userData));
      sessionStorage.setItem('devRole', userData.role);
      sessionStorage.setItem('systemDate', systemDate.toISOString().split('T')[0]);
    } catch (error) {
      console.error('Login routing exception:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    sessionStorage.clear();
  };

  const updateSystemDate = (date: string) => {
    setSystemDateState(new Date(date));
    sessionStorage.setItem('systemDate', date);
  };

  const switchRole = (role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN') => {
    // Find first corresponding account template matching targeted access clearance
    const targetUser = Object.values(mockUsersByEmail).find((u) => u.role === role);
    if (targetUser) {
      setUser(targetUser);
      sessionStorage.setItem('user', JSON.stringify(targetUser));
      sessionStorage.setItem('devRole', role);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        systemDate,
        isLoading,
        loading: isLoading, // Alias for compatibility
        login,
        logout,
        setSystemDate: updateSystemDate,
        setRole: switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}