import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { logger } from '../../../utils/logger';
import { API_URL } from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';

const ConfigContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return context;
};

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [masterData, setMasterData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Wait for authentication before fetching protected resources
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const fetchConfig = useCallback(async () => {
    // Skip if auth not ready or user not authenticated yet (e.g., during OIDC callback)
    if (authLoading || !isAuthenticated) {
      return;
    }

    try {
      setLoading(true);
      const [configRes, masterRes] = await Promise.all([
        axios.get(`${API_URL}/config`),
        axios.get(`${API_URL}/master-data`)
      ]);
      setConfig(configRes.data);
      setMasterData(masterRes.data);
      setError(null);
    } catch (err) {
      logger.error('Failed to fetch config', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  const updateConfig = useCallback(async (newConfig) => {
    try {
      const res = await axios.post(`${API_URL}/config`, newConfig);
      // Use response from backend (includes correct state from DB, not stale client state)
      setConfig(res.data);
      return { success: true };
    } catch (err) {
      logger.error('Failed to update config', err);
      return { success: false, error: err.message };
    }
  }, []);

  useEffect(() => {
    // Start fetching as soon as auth is ready + authenticated
    if (!authLoading && isAuthenticated) {
      fetchConfig();
    }

    // If auth completed but user is not authenticated (unexpected), stop loading state
    if (!authLoading && !isAuthenticated) {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, fetchConfig]);

  const value = {
    config,
    setConfig,
    masterData,
    loading,
    error,
    refetch: fetchConfig,
    updateConfig
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};
