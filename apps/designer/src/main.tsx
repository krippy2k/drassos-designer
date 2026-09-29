import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Shell } from "./saas/Shell.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
