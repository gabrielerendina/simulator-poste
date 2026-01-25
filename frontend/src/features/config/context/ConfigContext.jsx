import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { logger } from '../../../utils/logger';

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
        axios.get('/api/config'),
        axios.get('/api/master-data')
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
      await axios.post('/api/config', newConfig);
      setConfig(newConfig);
      return { success: true };
    } catch (err) {
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
