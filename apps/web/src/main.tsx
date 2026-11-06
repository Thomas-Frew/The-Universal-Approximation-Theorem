import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { onUncaughtError, startReporting } from "./lib/report";
import "./index.css";

// Before anything renders, so a crash on the first frame is reported too.
startReporting();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");

createRoot(root, { onUncaughtError }).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
