/** Vrai sous macOS (raccourcis ⌘, libellés « macOS » au lieu de « Windows »). */
export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
