import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

const style = document.createElement("style");
style.textContent = `
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; padding: 0; }
  body { font-family: 'Inter Tight', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  @keyframes spin { to { transform: rotate(360deg); } }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: #d4dae3; border-radius: 6px; border: 2px solid #fff; }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")).render(<App />);
