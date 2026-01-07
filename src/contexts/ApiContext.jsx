import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { what_api_is_available } from '../utils/helpers/selecter.js';
import logger from '../utils/helpers/logger.js';

const ApiContext = createContext();

export const ApiProvider = ({ children }) => {
  const [bestApi, setBestApi] = useState(null);
  const [apiStatus, setApiStatus] = useState({ jikan: null, anilist: null });
  const [isChecking, setIsChecking] = useState(true);
  const [lastCheck, setLastCheck] = useState(null);

  const checkApis = useCallback(async () => {
    setIsChecking(true);

    try {
      const availability = await what_api_is_available('mushishi');
      
      setApiStatus({
        jikan: availability.jikan[0] ? {
          available: true,
          responseTime: availability.jikan[1]
        } : { available: false },
        anilist: availability.anilist[0] ? {
          available: true,
          responseTime: availability.anilist[1]
        } : { available: false }
      });

      let best = null;
      const [jikanOk, jikanMs] = availability.jikan;
      const [anilistOk, anilistMs] = availability.anilist;

      if (jikanOk && anilistOk) {
        best = jikanMs <= anilistMs ? 'jikan' : 'anilist';
      } else if (jikanOk) {
        best = 'jikan';
      } else if (anilistOk) {
        best = 'anilist';
      }
      setBestApi(best);
      setLastCheck(Date.now());
    } catch (error) {
      throw new Error(`[ApiProvider] Erro ao checar apis: ${error.message}`);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkApis();
  }, [checkApis]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkApis();
    }, 1 * 60 * 1000);

    return () => clearInterval(interval);
  }, [checkApis]);

  const recheckApis = useCallback(() => {
    checkApis();
  }, [checkApis]);

  const value = {
    bestApi,
    apiStatus,
    isChecking,
    lastCheck,
    recheckApis
  };

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi deve ser usado dentro de ApiProvider');
  }
  return context;
};
