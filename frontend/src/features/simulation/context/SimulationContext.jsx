import { createContext, useContext, useState, useReducer } from 'react';

const SimulationContext = createContext(null);

// Reducer for complex state (techInputs, companyCerts)
// companyCerts: { [label]: "all" | "partial" | "none" }
const simulationReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOT':
      return { ...state, selectedLot: action.payload };
    case 'SET_DISCOUNT':
      return { ...state, [action.key]: action.value };
    case 'SET_COMPETITOR_PARAM':
      return { ...state, [action.key]: action.value };
    case 'SET_TECH_INPUT':
      return {
        ...state,
        techInputs: {
          ...state.techInputs,
          [action.reqId]: action.value
        }
      };
    case 'SET_COMPANY_CERT':
      return {
        ...state,
        companyCerts: {
          ...state.companyCerts,
          [action.label]: action.status  // "all", "partial", or "none"
        }
      };
    case 'RESET':
      return action.payload;
    default:
      return state;
  }
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation must be used within SimulationProvider');
  }
  return context;
};

export const SimulationProvider = ({ children }) => {
  const [state, dispatch] = useReducer(simulationReducer, {
    selectedLot: null,
    myDiscount: 0.0,
    competitorDiscount: 30.0,
    competitorTechScore: 60.0,
    competitorEconDiscount: 30.0,
    techInputs: {},
    companyCerts: {}
  });

  const [results, setResults] = useState(null);
  const [simulationData, setSimulationData] = useState([]);

  const setLot = (lotKey) => {
    dispatch({ type: 'SET_LOT', payload: lotKey });
  };

  const setDiscount = (key, value) => {
    // Sync logic: when Sconto Lutech >= Best Offer and user increases Sconto Lutech,
    // Best Offer should also increase to match
    if (key === 'myDiscount') {
      const currentMyDiscount = state.myDiscount;
      const currentCompetitorDiscount = state.competitorDiscount;

      // If Sconto Lutech was >= Best Offer AND is being increased
      if (currentMyDiscount >= currentCompetitorDiscount && value > currentMyDiscount) {
        // Increase Best Offer by the same delta
        const delta = value - currentMyDiscount;
        const newCompetitorDiscount = Math.min(currentCompetitorDiscount + delta, 100);
        dispatch({ type: 'SET_DISCOUNT', key: 'competitorDiscount', value: newCompetitorDiscount });

        // Also clamp competitorEconDiscount if needed
        if (state.competitorEconDiscount > newCompetitorDiscount) {
          dispatch({ type: 'SET_DISCOUNT', key: 'competitorEconDiscount', value: newCompetitorDiscount });
        }
      }
    }

    // When Best Offer changes, clamp Competitor Economic Discount
    if (key === 'competitorDiscount') {
      if (state.competitorEconDiscount > value) {
        dispatch({ type: 'SET_DISCOUNT', key: 'competitorEconDiscount', value: value });
      }
    }

    dispatch({ type: 'SET_DISCOUNT', key, value });
  };

  const setCompetitorParam = (key, value) => {
    dispatch({ type: 'SET_COMPETITOR_PARAM', key, value });
  };

  const setTechInput = (reqId, value) => {
    dispatch({ type: 'SET_TECH_INPUT', reqId, value });
  };

  const setCompanyCert = (label, status) => {
    dispatch({ type: 'SET_COMPANY_CERT', label, status });  // status: "all", "partial", "none"
  };

  const resetState = (newState) => {
    dispatch({ type: 'RESET', payload: newState });
  };

  const value = {
    ...state,
    results,
    simulationData,
    setLot,
    setDiscount,
    setCompetitorParam,
    setTechInput,
    setCompanyCert,
    resetState,
    setResults,
    setSimulationData
  };

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
};
