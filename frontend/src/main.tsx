import { createRoot } from "react-dom/client";
import App from "./App";

const style = document.createElement("style");
style.textContent = "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }";
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(<App />);
