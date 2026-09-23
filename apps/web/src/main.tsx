import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/space-mono/400.css";
import "./styles/global.scss";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("The application root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
