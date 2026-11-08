/** Vrai sous macOS (raccourcis ⌘, libellés « macOS » au lieu de « Windows »). */
export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

/** Vrai sous Linux (libellés « Linux » au lieu de « Windows »). */
export const isLinux = typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
