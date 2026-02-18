import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SpotlightApp from "./SpotlightApp";
import "./index.css";
import "./i18n/config"; // Initialize i18next 
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
const appWindow = getCurrentWebviewWindow()

const label = appWindow.label;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {label === 'spotlight' ? <SpotlightApp /> : <App />}
  </React.StrictMode>
);