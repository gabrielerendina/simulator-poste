import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { logger } from '../../../utils/logger';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ConfigContext = createContext(null);

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

  const fetchConfig = useCallback(async () => {
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
  }, []);

  const updateConfig = useCallback(async (newConfig) => {
    try {
      console.log(`🔧 Calling POST ${API_URL}/config`);
      await axios.post(`${API_URL}/config`, newConfig);
      setConfig(newConfig);
      console.log('✅ Config saved to backend successfully');
      return { success: true };
    } catch (err) {
      console.error('❌ Failed to save config:', err);
      logger.error('Failed to update config', err);
      return { success: false, error: err.message };
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, []);

  const value = {
    config,
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
