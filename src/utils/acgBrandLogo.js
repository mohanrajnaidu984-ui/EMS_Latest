import bundledAcgLogo from '../assets/almoayyed-logo.png';

/**
 * ACG / Almoayyed header & login footer logo.
 * For crisp production (IIS): set `VITE_ACG_LOGO_URL` in `.env.production` to a high-resolution PNG or SVG
 * (absolute URL or site path, e.g. `/acg-logo@2x.png` placed under `public/`).
 */
export function getAcgBrandLogoSrc() {
    const v = (import.meta.env.VITE_ACG_LOGO_URL || '').trim();
    return v || bundledAcgLogo;
}
