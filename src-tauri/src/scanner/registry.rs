//! Aides pour le registre Windows (vides hors Windows).

#[cfg(windows)]
mod imp {
    use winreg::enums::*;
    use winreg::RegKey;

    pub const HKCU: isize = HKEY_CURRENT_USER;
    pub const HKLM: isize = HKEY_LOCAL_MACHINE;

    fn root(h: isize) -> RegKey {
        if h == HKCU {
            RegKey::predef(HKEY_CURRENT_USER)
        } else {
            RegKey::predef(HKEY_LOCAL_MACHINE)
        }
    }

    pub fn reg_str(h: isize, path: &str, val: &str) -> Option<String> {
        root(h).open_subkey(path).ok()?.get_value::<String, _>(val).ok().filter(|s| !s.is_empty())
    }

    pub fn subkeys(h: isize, path: &str) -> Vec<(String, RegKey)> {
        let Ok(k) = root(h).open_subkey(path) else { return vec![] };
        k.enum_keys().flatten().filter_map(|n| k.open_subkey(&n).ok().map(|s| (n, s))).collect()
    }

    pub fn val(k: &RegKey, v: &str) -> Option<String> {
        k.get_value::<String, _>(v).ok().map(|s| s.trim().trim_matches('"').to_string()).filter(|s| !s.is_empty())
    }

    /// Toutes les clés de désinstallation (HKLM 32 et 64 bits + HKCU).
    pub fn uninstall_entries() -> Vec<RegKey> {
        let roots = [
            (HKLM, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKLM, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKCU, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        ];
        roots.iter().flat_map(|(h, p)| subkeys(*h, p)).map(|(_, k)| k).collect()
    }
}

#[cfg(windows)]
pub use imp::*;
