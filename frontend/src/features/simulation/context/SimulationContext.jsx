import { createContext, useContext, useState, useReducer } from 'react';

const SimulationContext = createContext(null);

// Reducer for complex state (techInputs, companyCerts)
const simulationReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOT':
      return { ...state, selectedLot: action.payload };
    case 'SET_DISCOUNT':
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
          [action.label]: action.checked
        }
      };
    case 'RESET':
      return action.payload;
    default:
      return state;
  }
};

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
    techInputs: {},
    companyCerts: {}
  });

  const [results, setResults] = useState(null);
  const [simulationData, setSimulationData] = useState([]);

  const setLot = (lotKey) => {
    dispatch({ type: 'SET_LOT', payload: lotKey });
  };

  const setDiscount = (key, value) => {
    dispatch({ type: 'SET_DISCOUNT', key, value });
  };

  const setTechInput = (reqId, value) => {
    dispatch({ type: 'SET_TECH_INPUT', reqId, value });
  };

  const setCompanyCert = (label, checked) => {
    dispatch({ type: 'SET_COMPANY_CERT', label, checked });
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
