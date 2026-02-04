import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import App from './App';
import './styles/scrollbar.css';
import { indexedDBCache } from './utils/cache/indexedDb.js';

const root = ReactDOM.createRoot(document.getElementById('root'));

indexedDBCache.init().catch(err => console.warn('IndexedDB init failed:', err));

root.render(
  <React.StrictMode>
      <ChakraProvider>
        <App />
      </ChakraProvider>
  </React.StrictMode>
);