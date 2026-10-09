/**
 * The fonts a page theme can choose (googleFonts in lib/design-tokens.ts),
 * self-hosted by next/font: downloaded at build time and served from this
 * domain, so visitors' browsers never contact Google. preload is off: a
 * browser only downloads a font file when the page actually uses that font.
 *
 * next/font needs literal options in every call, hence the repetition.
 * Variable names follow fontVariable() in lib/design-tokens.ts.
 */
import {
  Inter,
  Roboto,
  Open_Sans,
  Lato,
  Montserrat,
  Poppins,
  Raleway,
  Source_Sans_3,
  Nunito,
  Playfair_Display,
  Merriweather,
  DM_Sans,
  Space_Grotesk,
  Outfit,
  Plus_Jakarta_Sans,
  Manrope,
  Sora,
  Work_Sans,
  Archivo,
  Libre_Baskerville,
} from 'next/font/google';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-inter',
});

const roboto = Roboto({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-roboto',
});

const openSans = Open_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-open-sans',
});

const lato = Lato({
  weight: ['300', '400', '700', '900'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-lato',
});

const montserrat = Montserrat({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-montserrat',
});

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-poppins',
});

const raleway = Raleway({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-raleway',
});

const sourceSans3 = Source_Sans_3({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-source-sans-3',
});

const nunito = Nunito({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-nunito',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-playfair-display',
});

const merriweather = Merriweather({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-merriweather',
});

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-dm-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-space-grotesk',
});

const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-outfit',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-plus-jakarta-sans',
});

const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-manrope',
});

const sora = Sora({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-sora',
});

const workSans = Work_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-work-sans',
});

const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-archivo',
});

const libreBaskerville = Libre_Baskerville({
  weight: ['400', '700'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-page-libre-baskerville',
});

/** Class names that define every --font-page-* variable; set once on <html>. */
export const pageFontVariables = [
  inter.variable,
  roboto.variable,
  openSans.variable,
  lato.variable,
  montserrat.variable,
  poppins.variable,
  raleway.variable,
  sourceSans3.variable,
  nunito.variable,
  playfairDisplay.variable,
  merriweather.variable,
  dmSans.variable,
  spaceGrotesk.variable,
  outfit.variable,
  plusJakartaSans.variable,
  manrope.variable,
  sora.variable,
  workSans.variable,
  archivo.variable,
  libreBaskerville.variable,
].join(' ');
