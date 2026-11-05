//! Steam `appcache/appinfo.vdf` (binaire, formats v28 et v29) : nom et type des apps.
//!
//! Entête : magic u32, univers u32, puis (v29) offset i64 de la table des chaînes.
//! Chaque app : appid u32, taille u32, 60 octets d'entête, puis un KeyValues binaire.

use std::collections::{HashMap, HashSet};

const V28: u32 = 0x0756_4428;
const V29: u32 = 0x0756_4429;

#[derive(Debug, Default, PartialEq)]
pub struct App {
    pub name: String,
    /// `common.type` en minuscules : game, dlc, tool, application, demo...
    pub kind: String,
}

struct R<'a> {
    b: &'a [u8],
    o: usize,
}

impl<'a> R<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.b.get(self.o..self.o.checked_add(n)?)?;
        self.o += n;
        Some(s)
    }
    fn u8(&mut self) -> Option<u8> {
        self.take(1).map(|s| s[0])
    }
    fn u32(&mut self) -> Option<u32> {
        self.take(4).map(|s| u32::from_le_bytes(s.try_into().unwrap_or_default()))
    }
    fn u64(&mut self) -> Option<u64> {
        self.take(8).map(|s| u64::from_le_bytes(s.try_into().unwrap_or_default()))
    }
    fn cstr(&mut self) -> Option<&'a [u8]> {
        let rest = self.b.get(self.o..)?;
        let n = rest.iter().position(|&c| c == 0)?;
        self.o += n + 1;
        Some(&rest[..n])
    }
}

/// Lit les apps de `wanted` (les autres sont sautées sans être décodées).
pub fn parse(b: &[u8], wanted: &HashSet<u32>) -> HashMap<u32, App> {
    let mut out = HashMap::new();
    let mut r = R { b, o: 0 };
    let Some(magic) = r.u32() else { return out };
    let strings = match magic {
        V28 => None,
        V29 => {
            let _universe = r.u32();
            let Some(table) = r.u64().and_then(|o| string_table(b, o as usize)) else {
                log::warn!("Steam : table des chaînes d'appinfo.vdf illisible");
                return out;
            };
            Some(table)
        }
        _ => {
            log::warn!("Steam : format d'appinfo.vdf inconnu ({magic:#x})");
            return out;
        }
    };
    if magic == V28 {
        r.o = 8;
    }
    while let (Some(id), Some(size)) = (r.u32(), r.u32()) {
        if id == 0 {
            break;
        }
        let end = r.o.saturating_add(size as usize).min(b.len());
        if wanted.contains(&id) {
            let mut e = R { b: &b[..end], o: r.o + 60 };
            let mut app = App::default();
            if walk(&mut e, strings.as_deref(), 0, false, &mut app).is_some() && !app.name.is_empty() {
                out.insert(id, app);
            }
        }
        r.o = end;
    }
    out
}

fn string_table(b: &[u8], offset: usize) -> Option<Vec<&[u8]>> {
    let mut r = R { b, o: offset };
    let n = r.u32()?;
    (0..n).map(|_| r.cstr()).collect()
}

/// Parcourt un bloc KeyValues binaire et relève `common.name` / `common.type`.
fn walk(r: &mut R, strs: Option<&[&[u8]]>, depth: usize, in_common: bool, app: &mut App) -> Option<()> {
    loop {
        let t = r.u8()?;
        if t == 8 || t == 11 {
            return Some(());
        }
        let key = match strs {
            Some(s) => *s.get(r.u32()? as usize)?,
            None => r.cstr()?,
        };
        match t {
            0 => walk(r, strs, depth + 1, depth <= 1 && key.eq_ignore_ascii_case(b"common"), app)?,
            1 => {
                let v = String::from_utf8_lossy(r.cstr()?).into_owned();
                if in_common && key.eq_ignore_ascii_case(b"name") {
                    app.name = v;
                } else if in_common && key.eq_ignore_ascii_case(b"type") {
                    app.kind = v.to_lowercase();
                }
            }
            2..=4 | 6 => {
                r.take(4)?;
            }
            7 | 10 => {
                r.take(8)?;
            }
            _ => return None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Construit un appinfo.vdf v29 minimal : `appinfo { appid, common { name, type } }`.
    fn v29(apps: &[(u32, &str, &str)]) -> Vec<u8> {
        let strs = ["appinfo", "appid", "common", "name", "type"];
        let mut body = vec![];
        for (id, name, kind) in apps {
            let mut kv = vec![0u8];
            kv.extend(0u32.to_le_bytes()); // appinfo
            kv.push(2);
            kv.extend(1u32.to_le_bytes());
            kv.extend(id.to_le_bytes());
            kv.push(0);
            kv.extend(2u32.to_le_bytes()); // common
            for (k, v) in [(3u32, name), (4, kind)] {
                kv.push(1);
                kv.extend(k.to_le_bytes());
                kv.extend(v.as_bytes());
                kv.push(0);
            }
            kv.extend([8, 8, 8]);
            body.extend(id.to_le_bytes());
            body.extend((60 + kv.len() as u32).to_le_bytes());
            body.extend([0u8; 60]);
            body.extend(kv);
        }
        body.extend(0u32.to_le_bytes());
        let mut out = V29.to_le_bytes().to_vec();
        out.extend(1u32.to_le_bytes());
        out.extend(((16 + body.len()) as u64).to_le_bytes());
        out.extend(body);
        out.extend((strs.len() as u32).to_le_bytes());
        for s in strs {
            out.extend(s.as_bytes());
            out.push(0);
        }
        out
    }

    #[test]
    fn lit_nom_et_type() {
        let b = v29(&[(620, "Portal 2", "Game"), (228980, "Steamworks Common Redistributables", "Tool")]);
        let all = parse(&b, &HashSet::from([620, 228980]));
        assert_eq!(all[&620], App { name: "Portal 2".into(), kind: "game".into() });
        assert_eq!(all[&228980].kind, "tool");
        let some = parse(&b, &HashSet::from([228980]));
        assert_eq!(some.len(), 1, "les apps non demandées sont sautées");
    }

    #[test]
    fn fichier_invalide() {
        assert!(parse(b"", &HashSet::from([1])).is_empty());
        assert!(parse(&[1, 2, 3, 4, 5, 6, 7, 8], &HashSet::from([1])).is_empty());
        let mut b = v29(&[(620, "Portal 2", "Game")]);
        b.truncate(40);
        assert!(parse(&b, &HashSet::from([620])).is_empty());
    }
}
