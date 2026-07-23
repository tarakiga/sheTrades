import { Asap, Inter, Nunito_Sans, Source_Sans_3, Work_Sans } from "next/font/google";

/**
 * Curated white-label font set, self-hosted via next/font (downloaded at build
 * time - no runtime Google request, no dependency on the visitor having the
 * font installed). Each font is exposed as a CSS variable class on <html>; the
 * branding theme override picks ONE of them for --font-family-sans, so an admin
 * can switch fonts from Settings → Branding with no deploy.
 *
 * All five are variable fonts (full 100-900 weight range), so the UI's 400-800
 * weights render true instead of faux-bolding. Asap is the product default.
 */
const asap = Asap({ subsets: ["latin"], display: "swap", variable: "--font-asap" });
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], display: "swap", variable: "--font-nunito-sans" });
const sourceSans3 = Source_Sans_3({ subsets: ["latin"], display: "swap", variable: "--font-source-sans-3" });
const workSans = Work_Sans({ subsets: ["latin"], display: "swap", variable: "--font-work-sans" });

/** className for <html>: defines every --font-* variable app-wide. */
export const brandFontVariables = [
  asap.variable,
  inter.variable,
  nunitoSans.variable,
  sourceSans3.variable,
  workSans.variable
].join(" ");
