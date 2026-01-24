import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { oidcConfig, isOIDCConfigured, getAuthErrorMessage } from '../utils/authConfig';
import { logger } from '../utils/logger';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [userManager, setUserManager] = useState(null);

    // Initialize UserManager
    useEffect(() => {
        if (!isOIDCConfigured()) {
            logger.warn('OIDC not configured - running in dev mode without authentication');
            setIsLoading(false);
            // Set mock user for development
            setUser({
                profile: {
                    sub: 'dev-user',
                    email: 'dev@example.com',
                    name: 'Development User',
                },
                access_token: 'dev-token',
            });
            return;
        }

        try {
            const manager = new UserManager({
                ...oidcConfig,
                userStore: new WebStorageStateStore({ store: window.sessionStorage }),
            });

            // Event handlers
            manager.events.addUserLoaded((loadedUser) => {
                logger.info('User loaded from session storage');
                setUser(loadedUser);
                setError(null);
            });

            manager.events.addUserUnloaded(() => {
                logger.info('User session ended');
                setUser(null);
            });

            manager.events.addAccessTokenExpiring(() => {
                logger.warn('Access token expiring');
            });

            manager.events.addAccessTokenExpired(() => {
                logger.warn('Access token expired');
                setUser(null);
            });

            manager.events.addSilentRenewError((err) => {
                logger.error('Silent renew error:', err);
                setError(getAuthErrorMessage(err));
            });

            manager.events.addUserSignedOut(() => {
                logger.info('User signed out');
                setUser(null);
            });

            setUserManager(manager);

            // Try to load existing user from storage
            manager.getUser().then((existingUser) => {
                if (existingUser && !existingUser.expired) {
                    setUser(existingUser);
                }
                setIsLoading(false);
            }).catch((err) => {
                logger.error('Failed to get user:', err);
                setIsLoading(false);
            });
        } catch (err) {
            logger.error('Failed to initialize UserManager:', err);
            setError(getAuthErrorMessage(err));
            setIsLoading(false);
        }
    }, []);

    // Login function
    const login = useCallback(async () => {
        if (!userManager) {
            logger.error('UserManager not initialized');
            return;
        }

        try {
            setError(null);
            await userManager.signinRedirect({
                state: { returnUrl: window.location.pathname },
            });
        } catch (err) {
            logger.error('Login failed:', err);
            setError(getAuthErrorMessage(err));
        }
    }, [userManager]);

    // Logout function - simplified for SAP IAS compatibility
    const logout = useCallback(async () => {
        if (!userManager) {
            logger.error('UserManager not initialized');
            return;
        }

        try {
            setError(null);
            // Clear local session without IAS front-channel logout
            // (SAP IAS has issues with standard OIDC logout)
            await userManager.removeUser();
            setUser(null);
            // Redirect to home
            window.location.href = '/';
        } catch (err) {
            logger.error('Logout failed:', err);
            setError(getAuthErrorMessage(err));
            setUser(null);
            window.location.href = '/';
        }
    }, [userManager]);

    // Handle redirect callback
    const handleCallback = useCallback(async () => {
        if (!userManager) {
            logger.error('UserManager not initialized');
            return;
        }

        try {
            setError(null);
            const callbackUser = await userManager.signinRedirectCallback();
            setUser(callbackUser);

            // Redirect to original page or home
            const returnUrl = callbackUser.state?.returnUrl || '/';
            window.history.replaceState({}, document.title, returnUrl);

            return callbackUser;
        } catch (err) {
            logger.error('Callback handling failed:', err);
            setError(getAuthErrorMessage(err));
            throw err;
        }
    }, [userManager]);

    // Silent renew
    const renewToken = useCallback(async () => {
        if (!userManager) {
            return;
        }

        try {
            const renewedUser = await userManager.signinSilent();
            setUser(renewedUser);
            return renewedUser;
        } catch (err) {
            logger.error('Token renewal failed:', err);
            setError(getAuthErrorMessage(err));
            return null;
        }
    }, [userManager]);

    // Get access token
    const getAccessToken = useCallback(() => {
        return user?.access_token || null;
    }, [user]);

    const value = {
        user,
        isAuthenticated: Boolean(user && !user.expired),
        isLoading,
        error,
        login,
        logout,
        handleCallback,
        renewToken,
        getAccessToken,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
