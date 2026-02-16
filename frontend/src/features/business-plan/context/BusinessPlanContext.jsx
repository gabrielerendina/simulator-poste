import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../../../utils/api';
import { useSimulation } from '../../simulation/context/SimulationContext';
import { logger } from '../../../utils/logger';

const BusinessPlanContext = createContext(null);

export function BusinessPlanProvider({ children, activeView }) {
  const { selectedLot } = useSimulation();
  const [businessPlan, setBusinessPlan] = useState(null);
  const [practices, setPractices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchedLot, setFetchedLot] = useState(null);

  // Fetch business plan when lot/view changes
  useEffect(() => {
    if (!selectedLot || activeView !== 'businessPlan') {
      return;
    }

    // Already fetched for this lot
    if (fetchedLot === selectedLot) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function fetchBP() {
      setLoading(true);
      setBusinessPlan(null);
      setError(null);

      try {
        const res = await axios.get(
          `${API_URL}/business-plan/${encodeURIComponent(selectedLot)}`,
          { signal: controller.signal }
        );
        if (active) {
          setBusinessPlan(res.data);
          setFetchedLot(selectedLot);
        }
      } catch (err) {
        if (!active || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        if (err.response?.status === 404) {
          setBusinessPlan(null);
          setFetchedLot(selectedLot);
        } else {
          logger.error('Failed to fetch business plan', err, { lot: selectedLot });
          setError(err.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchBP();

    return () => { active = false; controller.abort(); };
  }, [selectedLot, activeView, fetchedLot]);

  // Reset fetched lot tracker when lot changes so next activation triggers fetch
  useEffect(() => {
    setFetchedLot(prev => (prev !== selectedLot ? null : prev));
  }, [selectedLot]);

  // Fetch practices once
  useEffect(() => {
    if (activeView !== 'businessPlan') return;

    axios.get(`${API_URL}/practices/`)
      .then(res => setPractices(res.data))
      .catch(err => {
        if (err.name !== 'CanceledError') {
          logger.error('Failed to fetch practices', err);
        }
      });
  }, [activeView]);

  // Save / create BP
  const saveBusinessPlan = useCallback(async (data) => {
    if (!selectedLot) return null;

    try {
      const res = await axios.post(
        `${API_URL}/business-plan/${encodeURIComponent(selectedLot)}`,
        data,
      );
      setBusinessPlan(res.data);
      return res.data;
    } catch (err) {
      logger.error('Failed to save business plan', err, { lot: selectedLot });
      throw err;
    }
  }, [selectedLot]);

  // Calculate costs
  const calculateCosts = useCallback(async (params = {}) => {
    if (!selectedLot) return null;

    try {
      const res = await axios.post(
        `${API_URL}/business-plan/${encodeURIComponent(selectedLot)}/calculate`,
        {
          discount_pct: params.discount_pct || 0,
          is_rti: params.is_rti || false,
          quota_lutech: params.quota_lutech || 1.0,
          subcontract: params.subcontract || {},
        },
      );
      return res.data;
    } catch (err) {
      logger.error('Failed to calculate BP costs', err, { lot: selectedLot });
      throw err;
    }
  }, [selectedLot]);

  // Save/Create Practice
  const savePractice = useCallback(async (practiceData) => {
    try {
      // Check if practice exists
      const existing = practices.find(p => p.id === practiceData.id);
      let res;

      if (existing) {
        // Update
        res = await axios.put(
          `${API_URL}/practices/${encodeURIComponent(practiceData.id)}`,
          practiceData
        );
      } else {
        // Create
        res = await axios.post(`${API_URL}/practices/`, practiceData);
      }

      // Update local state
      setPractices(prev => {
        const idx = prev.findIndex(p => p.id === practiceData.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = res.data;
          return updated;
        }
        return [...prev, res.data];
      });

      return res.data;
    } catch (err) {
      logger.error('Failed to save practice', err, { practice: practiceData.id });
      throw err;
    }
  }, [practices]);

  // Delete Practice
  const deletePractice = useCallback(async (practiceId) => {
    try {
      await axios.delete(`${API_URL}/practices/${encodeURIComponent(practiceId)}`);
      setPractices(prev => prev.filter(p => p.id !== practiceId));
      return true;
    } catch (err) {
      logger.error('Failed to delete practice', err, { practice: practiceId });
      throw err;
    }
  }, []);

  // Refresh practices
  const refreshPractices = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/practices/`);
      setPractices(res.data);
      return res.data;
    } catch (err) {
      logger.error('Failed to refresh practices', err);
      throw err;
    }
  }, []);

  const value = {
    businessPlan,
    practices,
    loading,
    error,
    saveBusinessPlan,
    calculateCosts,
    setBusinessPlan,
    savePractice,
    deletePractice,
    refreshPractices,
  };

  return (
    <BusinessPlanContext.Provider value={value}>
      {children}
    </BusinessPlanContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBusinessPlan() {
  const context = useContext(BusinessPlanContext);
  if (!context) {
    throw new Error('useBusinessPlan must be used within a BusinessPlanProvider');
  }
  return context;
}
