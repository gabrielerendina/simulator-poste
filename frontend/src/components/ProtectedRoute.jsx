import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import LoginButton from './LoginButton';

export default function ProtectedRoute({ children }) {
    const { isAuthenticated, isLoading, error, login } = useAuth();

    // Allow callback path to pass through for OIDC flow completion
    if (window.location.pathname === '/callback') {
        return children;
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600">Authenticating...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">⚠️</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Authentication Error</h2>
                    <p className="text-slate-600 mb-6">{error}</p>
                    <LoginButton />
                </div>
            </div>
        );
    }

    // Auto-redirect to IAS when not authenticated and not loading/error
    useEffect(() => {
        if (!isLoading && !isAuthenticated && !error) {
            login();
        }
    }, [isLoading, isAuthenticated, error, login]);

    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg">
                    <img
                        src="/poste-italiane-logo.svg"
                        alt="Poste Italiane"
                        className="h-16 object-contain mx-auto mb-6"
                    />
                    <h1 className="text-2xl font-bold text-slate-800 mb-2">
                        Poste Tender Simulator
                    </h1>
                    <p className="text-slate-600 mb-6">
                        Redirecting to authentication...
                    </p>
                    <LoginButton className="w-full justify-center" />
                </div>
            </div>
        );
    }

    return children;
}
