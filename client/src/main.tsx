import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import App from './App';
import { DbConnection } from './module_bindings';
import './index.css';

const uri = import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://127.0.0.1:3000';
const database = import.meta.env.VITE_SPACETIMEDB_DATABASE ?? 'hyperion-popxo';
const savedToken = localStorage.getItem('hyperion-auth-token');

let connectionBuilder = DbConnection.builder()
  .withUri(uri)
  .withDatabaseName(database)
  .withLightMode(true)
  .onConnect((_connection, identity, token) => {
    localStorage.setItem('hyperion-auth-token', token);
    console.info(`Hyperion linked: ${identity.toHexString()}`);
  });

if (savedToken) connectionBuilder = connectionBuilder.withToken(savedToken);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>,
);
