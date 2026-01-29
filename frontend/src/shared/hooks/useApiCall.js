import { useState, useCallback } from 'react';
import axios from 'axios';
import { logger } from '../../utils/logger';
import { useToast } from './useToast';

export const useApiCall = (options = {}) => {
  const {
    onSuccess,
    onError,
    showToastOnError = true,
    retryCount = 0,
    retryDelay = 1000
  } = options;

  const { error: showErrorToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const execute = useCallback(async (apiCall, ...args) => {
    setLoading(true);
    setError(null);

    let lastError;
    let attempts = 0;

    while (attempts <= retryCount) {
      try {
        const result = await apiCall(...args);
        setData(result);
        setLoading(false);

        if (onSuccess) onSuccess(result);
        return { success: true, data: result };

      } catch (err) {
        lastError = err;
        attempts++;

        if (attempts <= retryCount) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempts));
          logger.warn(`Retrying API call (attempt ${attempts}/${retryCount})`, err);
        }
      }
    }

    // All retries failed
    setError(lastError);
    setLoading(false);

    logger.error('API call failed after retries', lastError);

    if (showToastOnError) {
      showErrorToast(lastError?.response?.data?.detail || lastError?.message || 'Errore di rete');
    }

    if (onError) onError(lastError);
    return { success: false, error: lastError };

  }, [retryCount, retryDelay, onSuccess, onError, showToastOnError, showErrorToast]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return {
    execute,
    loading,
    error,
    data,
    reset
  };
};

// Usage example:
// const { execute, loading, error } = useApiCall({ retryCount: 2 });
// const result = await execute(axios.get, '/api/config');
