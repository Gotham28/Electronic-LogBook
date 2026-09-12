import { createRoot } from "react-dom/client";
import "@fontsource/open-sauce-one/400.css";
import "@fontsource/open-sauce-one/500.css";
import "@fontsource/open-sauce-one/600.css";
import "@fontsource/open-sauce-one/700.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-600.css";
import "@fontsource/roboto/latin-700.css";
import App from "./App";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <CookieConsentBanner />
  </>
);
