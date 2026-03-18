import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SpotlightApp from "./SpotlightApp";
import "./index.css";
import "./i18n/config"; // Initialize i18next 
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { hydratePersistedStores } from '@/lib/store_bootstrap';
const appWindow = getCurrentWebviewWindow()

const label = appWindow.label;

function Bootstrap() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    hydratePersistedStores()
      .catch((err) => {
        console.error('[Bootstrap] Failed to hydrate persisted stores:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isReady) {
    return null;
  }

  return label === 'spotlight' ? <SpotlightApp /> : <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);
