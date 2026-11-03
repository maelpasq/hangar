//! Parseur VDF (format texte de Valve, `KeyValues`) récursif.
//!
//! `"clé" "valeur"` ou `"clé" { ... }`, commentaires `//`, échappements `\"` et `\\`,
//! clés comparées sans tenir compte de la casse. Un fichier tronqué ou mal formé donne
//! ce qui a pu être lu, jamais une erreur.

#[derive(Debug, Clone, PartialEq)]
pub enum Vdf {
    Str(String),
    Obj(Vec<(String, Vdf)>),
}

impl Vdf {
    /// Premier enfant de cette clé (casse ignorée).
    pub fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Obj(items) => items.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            Vdf::Str(_) => None,
        }
    }

    /// Descend dans une suite de clés.
    pub fn path(&self, keys: &[&str]) -> Option<&Vdf> {
        keys.iter().try_fold(self, |v, k| v.get(k))
    }

    pub fn str(&self) -> Option<&str> {
        match self {
            Vdf::Str(s) => Some(s),
            Vdf::Obj(_) => None,
        }
    }

    /// Valeur texte d'un enfant.
    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(Vdf::str)
    }

    /// Valeur numérique d'un enfant.
    pub fn get_u64(&self, key: &str) -> Option<u64> {
        self.get_str(key).and_then(|s| s.trim().parse().ok())
    }

    /// Enfants d'un objet (vide pour une valeur texte).
    pub fn entries(&self) -> &[(String, Vdf)] {
        match self {
            Vdf::Obj(items) => items,
            Vdf::Str(_) => &[],
        }
    }
}

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

enum Tok {
    Str(String),
    Open,
    Close,
}

impl Parser<'_> {
    fn skip_ws(&mut self) {
        while self.i < self.b.len() {
            match self.b[self.i] {
                b' ' | b'\t' | b'\r' | b'\n' => self.i += 1,
                b'/' if self.b.get(self.i + 1) == Some(&b'/') => {
                    while self.i < self.b.len() && self.b[self.i] != b'\n' {
                        self.i += 1;
                    }
                }
                _ => break,
            }
        }
    }

    fn token(&mut self) -> Option<Tok> {
        self.skip_ws();
        let c = *self.b.get(self.i)?;
        match c {
            b'{' => {
                self.i += 1;
                Some(Tok::Open)
            }
            b'}' => {
                self.i += 1;
                Some(Tok::Close)
            }
            b'"' => {
                self.i += 1;
                let mut out = Vec::new();
                while let Some(&c) = self.b.get(self.i) {
                    self.i += 1;
                    match c {
                        b'"' => break,
                        b'\\' => {
                            let n = self.b.get(self.i).copied();
                            self.i += 1;
                            match n {
                                Some(b'n') => out.push(b'\n'),
                                Some(b't') => out.push(b'\t'),
                                Some(x) => out.push(x),
                                None => break,
                            }
                        }
                        _ => out.push(c),
                    }
                }
                Some(Tok::Str(String::from_utf8_lossy(&out).into_owned()))
            }
            _ => {
                // Jeton sans guillemets (rare) : jusqu'au prochain blanc ou accolade.
                let start = self.i;
                while let Some(&c) = self.b.get(self.i) {
                    if matches!(c, b' ' | b'\t' | b'\r' | b'\n' | b'{' | b'}' | b'"') {
                        break;
                    }
                    self.i += 1;
                }
                Some(Tok::Str(String::from_utf8_lossy(&self.b[start..self.i]).into_owned()))
            }
        }
    }

    /// Lit des paires jusqu'à `}` ou la fin du texte.
    fn object(&mut self, depth: u32) -> Vec<(String, Vdf)> {
        let mut items = Vec::new();
        loop {
            let key = match self.token() {
                Some(Tok::Str(k)) => k,
                Some(Tok::Close) | None => return items,
                Some(Tok::Open) => {
                    // Accolade orpheline : on lit le bloc et on l'ignore.
                    self.object(depth + 1);
                    continue;
                }
            };
            match self.token() {
                Some(Tok::Str(v)) => items.push((key, Vdf::Str(v))),
                Some(Tok::Open) if depth < 64 => items.push((key, Vdf::Obj(self.object(depth + 1)))),
                Some(Tok::Open) => {
                    self.object(depth + 1);
                }
                Some(Tok::Close) | None => return items,
            }
        }
    }
}

/// Analyse un texte VDF complet : renvoie l'objet racine.
pub fn parse(text: &str) -> Vdf {
    let text = text.trim_start_matches('\u{feff}');
    let mut p = Parser { b: text.as_bytes(), i: 0 };
    Vdf::Obj(p.object(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCALCONFIG: &str = include_str!("../../tests/fixtures/localconfig.vdf");

    #[test]
    fn objets_imbriques_et_casse() {
        let v = parse(LOCALCONFIG);
        let apps = v.path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"]).unwrap();
        assert_eq!(apps.get("526870").unwrap().get_u64("Playtime"), Some(12840));
        // La casse des clés varie selon les versions de Steam.
        let apps2 = v.path(&["userlocalconfigstore", "software", "valve", "steam", "Apps"]).unwrap();
        assert_eq!(apps2.get("284160").unwrap().get_u64("lastplayed"), Some(1793600000));
        assert_eq!(apps.entries().len(), 3);
    }

    #[test]
    fn echappements_commentaires_et_texte_tronque() {
        let v = parse("// commentaire\n\"a\" { \"b\" \"x\\\"y\\\\z\" \"c\" { \"d\" \"1\" ");
        assert_eq!(v.path(&["a", "b"]).and_then(Vdf::str), Some("x\"y\\z"));
        assert_eq!(v.path(&["a", "c"]).unwrap().get_u64("d"), Some(1));
        assert_eq!(parse(""), Vdf::Obj(vec![]));
        assert!(parse("}}}{").get("x").is_none());
    }
}
