# Versions de Hangar

Ce fichier explique comment publier une version et garde l'historique de toutes les versions.

## Publier une nouvelle version en prod

Une version publiée part chez tous les utilisateurs : le bouton « Mettre à jour » de Hangar lit `latest.json` sur la dernière release GitHub. Ne publie que si l'utilisateur l'a demandé.

1. **Vérifier** que tout passe, depuis la racine du projet :
   ```bash
   npm run verify
   ```
   Chaque étape doit afficher `ok`. `git status` doit être propre et la branche doit être `main`.
2. **Le numéro** : toujours `patch`, règle fixée par l'utilisateur. Chaque version ajoute 0.0.1 au dernier chiffre (1.2.1 -> 1.2.2 -> 1.2.3...), petite correction comme grosse nouveauté. Jamais `minor` ni `major`, même pour une grosse mise à jour.
3. **Ajouter l'entrée de la version** en haut de « Historique » ci-dessous (numéro, date, description pour les utilisateurs), puis committer. Cette entrée devient telle quelle le texte de la release GitHub (`release.yml`) : ce doit être un **vrai patch note**, pas un paragraphe vague. Repars de tous les commits depuis la dernière version (`git log --oneline vX.Y.Z..HEAD`) et écris :
   - une phrase d'accroche qui résume la version ;
   - puis des sections `#### Nouveautés`, `#### Améliorations`, `#### Corrections` (seulement celles qui ont du contenu), chacune en liste à puces : un point par changement visible, concret, du point de vue de l'utilisateur (ce qui change pour lui, où, sur quel système si ce n'est pas partout) ;
   - jamais de `###` dans l'entrée (il marque la version suivante), ni de détail interne (noms de fichiers, refactorisations, CI) sauf s'il a un effet visible.

   Cette même entrée s'affiche **dans Hangar**, dans la fenêtre « Hangar a été mis à jour » au premier démarrage après la mise à jour (et via Paramètres > Général > Nouveautés), pour que chacun comprenne pourquoi il a mis à jour. Elle est lue dans ce fichier au build (`src/lib/util/release-notes.ts`, aucun réseau) : sans entrée, pas de fenêtre. Seuls l'accroche, les titres `####`, les puces et le gras `**...**` sont rendus. Pour une grosse mise à jour, une ligne `<!-- vitrine: social -->` sous l'accroche (invisible sur GitHub) ajoute en tête de la fenêtre une vitrine illustrée et animée (`social` : compte et amis, `src/lib/components/SocialArt.svelte` et `SocialPitch.svelte` ; `badges` : badges du profil, `BadgesArt.svelte` et `BadgesPitch.svelte` ; branchés dans `WhatsNew.svelte`). Vérifie le rendu avant de committer : `npm run dev:web`, Paramètres > Général > Nouveautés.

   Puis committer :
   ```bash
   git commit -am "Versions : notes de la 1.2.1"
   ```
4. **Monter la version et créer le tag** (le numéro vient de `package.json`, `tauri.conf.json` le lit ; le script `version` le recopie dans les `Cargo.toml` et `Cargo.lock`) :
   ```bash
   npm version patch -m $'Version %s\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
   ```
   Toujours `patch` (étape 2). Sous PowerShell, la syntaxe `$'...'` ne marche pas : lance la commande avec l'outil Bash.
5. **Pousser** le commit et le tag :
   ```bash
   git push --follow-tags origin main
   ```
6. **Suivre la construction.** Le tag `v*` lance `.github/workflows/release.yml` (Windows, macOS et Linux, environ 15 minutes). `gh` n'est pas installé sur ce poste : passe par l'API publique de GitHub, par exemple en PowerShell :
   ```powershell
   (Invoke-RestMethod "https://api.github.com/repos/maelpasq/hangar/actions/runs?per_page=3").workflow_runs | % { "$($_.name) #$($_.run_number) $($_.status)/$($_.conclusion)" }
   ```
7. **Vérifier la release** sur https://github.com/maelpasq/hangar/releases : elle doit contenir `Hangar-Setup.exe`, `Hangar_x.y.z_x64-setup.exe` et sa `.sig`, `Hangar_x.y.z_universal.dmg`, `Hangar_universal.app.tar.gz` et sa `.sig`, `Hangar_x.y.z_amd64.AppImage` et sa `.sig`, et `latest.json`. Son texte doit afficher le patch note complet de l'étape 3 ; s'il est vide ou tronqué, corrige-le à la main sur la page de la release. La fenêtre de notes dans l'app vient du fichier embarqué, pas de la release : une correction sur GitHub ne la change pas.

Fichiers de la release :
- `Hangar-Setup.exe` : installeur aux couleurs de Hangar (`installer/`), celui à donner aux gens. Il embarque l'installeur NSIS.
- `Hangar_x.y.z_x64-setup.exe` : installeur NSIS de Tauri, téléchargé par la mise à jour intégrée. À ne jamais retirer.
- `.dmg` : installation sur Mac. `.app.tar.gz` : mise à jour sur Mac.
- `.AppImage` : installation et mise à jour sous Linux.
- `.sig` : signatures vérifiées par la mise à jour (clé privée dans les secrets GitHub `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
- `latest.json` : la fiche lue par Hangar pour savoir s'il existe une nouvelle version.

### Correctif sans patch note (1.2.27.1)

Une simple correction de bug, sans nouveauté à annoncer, ne prend pas le `patch` suivant : elle ajoute un 4e chiffre à la version actuelle (1.2.27 -> 1.2.27.1 -> 1.2.27.2), règle fixée par l'utilisateur. Semver n'accepte que trois nombres : le numéro technique est `1.2.27+1` (métadonnée de build, que la mise à jour de Tauri classe au-dessus de 1.2.27, y compris dans les versions déjà installées), et Hangar l'affiche « 1.2.27.1 » (`displayVersion`).

- **Pas d'entrée** dans l'historique : la fenêtre de notes ne s'ouvre pas pour qui a déjà vu celles de la 1.2.27, et le bouton Nouveautés montre toujours les notes de la 1.2.27. Qui vient d'une version plus ancienne voit les notes de la 1.2.27.
- **Une entrée dans « ## Correctifs »** (en fin de fichier, le plus récent en haut), avant l'étape 1 : `### 1.2.27.1 - date` puis une puce courte par correction, pour les utilisateurs. Le texte de la release (donc le champ `notes` de latest.json) reprend toutes les entrées de la 1.2.27, et Hangar les montre dans une fenêtre « Mettre à jour / Annuler » quand on clique sur « Mettre à jour Hangar » (seulement celles plus récentes que la version installée). Sans entrée, la fenêtre dit « Corrections de bugs, sans nouveauté ».
- Étapes 1 et 2 comme ci-dessus, puis à la place des étapes 3 et 4 (avec l'outil Bash) :
  ```bash
  npm run correctif -- "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
  Le script monte le numéro partout, crée le commit « Version 1.2.27.1 » et le tag annoté `v1.2.27+1`. Puis étapes 5 à 7. La release s'appelle « Hangar v1.2.27.1 », son texte liste les corrections puis dit « Correctif de la version 1.2.27 ».
- Le correctif peut compléter l'entrée de sa version de base (changements visibles qui la complètent) : qui vient d'une version plus ancienne voit les notes à jour, qui a déjà vu celles de la 1.2.27 n'a toujours pas de fenêtre.
- La version suivante avec patch note reprend `npm version patch` : 1.2.27+2 -> 1.2.28.
- Mot-clé **« PUSH PATCH »** : tout d'un coup, sans redemander. Amener sur `main` les commits de l'app faits sur `dev` depuis la dernière version (cherry-pick, jamais les commits Hangar Test), étapes 1 et 2, `npm run correctif`, push avec le tag, suivi de la construction et vérification de la release (fichiers en `1.2.27+1`, `latest.json` avec la version `1.2.27+1`). Ni site, ni README, ni entrée d'historique, mais une entrée dans « ## Correctifs » (les corrections amenées, en une puce chacune). Puis reporter le commit « Version 1.2.27.1 » sur `dev`.

Si un build échoue : corrige, committe, puis publie un nouveau `patch`. Ne déplace jamais un tag déjà poussé, des utilisateurs ont peut-être déjà la version.

## Historique

Une entrée par version, la plus récente en haut. La description s'adresse aux utilisateurs.

### 1.2.29 - 17 novembre 2026
Ton profil Hangar a ses badges : ton ancienneté, ta collection et tes heures de jeu s'affichent à côté de ton pseudo, et tes amis les voient.
<!-- vitrine: badges -->

#### Nouveautés
- **Badges du profil** : à droite de ton pseudo, sur ton profil et chez tes amis. Survole un badge pour voir ce qu'il récompense.
- **Ancienneté** : l'arche de Hangar change de matière avec le temps, du bronze (dès la création du compte) à l'opale (6 ans), en passant par l'argent, l'or, le platine, le diamant, l'émeraude et le rubis. Un clic dessus montre ta date d'arrivée, depuis combien de temps tu es là et la prochaine arche.
- **Pionnier** : pour les comptes créés avant le 1er décembre 2026.
- **Collectionneur** (50, 100, 250 puis 500 jeux), **Marathonien** (100, 500 puis 1000 heures de jeu) et **Multi-launchers** (des jeux sur 5 launchers ou plus). Ils suivent ta confidentialité : si tes amis ne voient pas ta bibliothèque ou ton temps de jeu, ces badges restent cachés.
- **Compte certifié** : pour les comptes certifiés.
- **Équipe Hangar**, **Testeur** et **Chasseur de bugs** : pour l'équipe, ceux qui testent Hangar avant tout le monde et ceux dont les signalements l'ont amélioré.

#### Améliorations
- **Profil** : cartes de statistiques réagencées, chacune avec son icône en couleur, la version de Hangar en vert quand elle est à jour, et le code ami copiable d'un clic.
- **Jeux en commun avec un ami** : un jeu compte maintenant même s'il vient d'un autre launcher chez lui (par exemple Steam chez toi, Epic chez lui), sur tous ses PC connectés.

### 1.2.28 - 16 novembre 2026
Hangar devient social : crée ton compte Hangar gratuit, retrouve ta bibliothèque sur tous tes PC, ajoute tes amis et discute avec eux sans quitter Hangar.
<!-- vitrine: social -->

#### Nouveautés
- **Compte Hangar** (facultatif) : « Se connecter » dans la barre latérale, par code reçu par e-mail, Discord ou Google. Sans compte, Hangar reste 100 % local, comme avant. Une fois connecté, ton compte en bas de la barre latérale ouvre un menu : ton profil, les paramètres du compte et la déconnexion.
- **Synchro sur tous tes PC** : favoris, jeux masqués, renommages, jaquettes, collections, jeux web, apparence et préférences te suivent sur Windows, macOS et Linux. Ta clé SteamGridDB aussi, chiffrée, et tes connexions Steam, GOG, Epic et Xbox : connecté ou déconnecté sur un PC, tu l'es partout.
- **Jeux d'un autre PC** : tes jeux locaux et ajoutés à la main sur un autre poste apparaissent en gris, avec leur vraie jaquette, un lien pour les installer, « J'ai déjà ce jeu » ou « Masquer sur ce PC ». Ils se rattachent tout seuls quand le scan les trouve.
- **Temps de jeu cumulé** : le temps de chaque jeu additionne tous tes postes, avec le détail par PC sur la fiche du jeu.
- **Amis** : une page **Amis** dans la barre latérale. Une fois les amis activés (ils sont désactivés par défaut), ajoute-les par pseudo ou par code ami, accepte leurs demandes et vois en direct qui est en ligne, qui est en jeu et à quoi.
- **Discussion en direct** : écris à tes amis, reçois une notification pour chaque nouveau message et invite-les sur un jeu.
- **Ton profil** : pseudo, avatar, bannière, jeux favoris (5 au plus), jeux les plus joués, collections mises en avant et activité récente, à régler dans **Paramètres > Compte et profil**. Tu choisis dans **Paramètres > Amis et confidentialité** ce que tes amis voient de chaque information. Les jeux de tes amis que tu n'as pas s'affichent avec leur vraie jaquette.
- **Tes données** : dans **Paramètres > Compte et profil**, tes PC connectés (à renommer ou déconnecter), l'export de toutes tes données et la suppression du compte. La politique de confidentialité est sur le site.

#### Améliorations
- **Lien d'installation** des jeux hors store : trouvé automatiquement (registre, raccourcis, page Steam) et modifiable dans la fiche du jeu.
- **Paramètres** : Général passe en tête. **Compte et profil** regroupe ton compte, ton profil et tes données, **Amis et confidentialité** tes amis et ce qu'ils voient de toi.
- **Signaler un bug** : le signalement passe par le serveur de Hangar, plus sûr, avec une limite pour éviter les abus.

### 1.2.26 - 15 novembre 2026
Tes comptes en font plus : relie Xbox, retrouve le temps de jeu d'Epic, GOG et Xbox et tes succès sur la fiche, et Rockstar rejoint les stores détectés.

#### Nouveautés
- **Compte Xbox** (Windows) : dans **Paramètres > Launchers**, « Relier » Xbox affiche un code à saisir sur microsoft.com/link. Tes jeux PC Xbox arrivent avec leur dernière session, leur temps de jeu, leur genre, leur studio, leur éditeur, leur date de sortie, tes succès et ton Gamerscore. Seuls les jeux déjà lancés au moins une fois apparaissent : Xbox ne donne pas la liste complète aux autres apps.
- **Rockstar Games Launcher** : ses jeux sont reconnus comme des jeux Rockstar (et non plus comme des jeux locaux), se lancent par son launcher, et ceux de ton profil qui ne sont pas installés arrivent dans « À installer » (Windows).
- **Temps de jeu Epic et GOG** : avec ton compte relié, Hangar reprend le temps de jeu enregistré par Epic et par GOG (même sans GOG Galaxy) et garde le plus élevé avec sa propre mesure.
- **Succès Steam** : la fiche d'un jeu Steam montre tes succès débloqués, avec le pourcentage et une barre, quand ton compte Steam est relié.
- **Ce qu'apporte chaque compte** : sous chaque compte relié, dans **Paramètres > Launchers**, une ligne « Grâce au compte » dit ce qu'il ajoute (jeux à installer, temps de jeu, mises à jour Epic, succès).
- **Mode manette dans les Paramètres** : un onglet **Mode manette** pour l'activer (désactivé par défaut), l'ouvrir, et des conseils pour chaque manette (Xbox et Game Bar, PlayStation, Switch Pro, 8BitDo, PC portables, Mac).

#### Améliorations
- **Fermer la fenêtre** : Hangar ne reste plus en arrière-plan d'office. Il te demande s'il doit rester en arrière-plan ou quitter, avec une case « Ne plus afficher » ; le choix se change dans **Paramètres > Bureau**, « En fermant la fenêtre ».
- **Retour à l'app d'avant** : quand le bouton Xbox a ouvert le mode manette depuis un jeu ou une autre app, le quitter renvoie Hangar là où il était (caché ou réduit) au lieu de le laisser par-dessus (Windows).
- **Clé d'API Steam guidée** : le formulaire « Relier » de Steam explique en trois étapes comment créer ta clé.
- **Launchers où relier un compte en premier** : dans **Paramètres > Launchers**, Steam, Epic, GOG et Xbox passent en haut de la liste.

### 1.2.25 - 15 novembre 2026
Plus aucun jeu sans jaquette : Hangar te guide pour obtenir ta clé SteamGridDB, et le bouton Actualiser fait enfin tout d'un coup.

#### Nouveautés
- **Clé SteamGridDB guidée** : un guide en trois étapes (ouvrir la page API, générer la clé, la coller) t'accompagne, dans une nouvelle étape « Tes jaquettes » de la configuration de départ et dans **Paramètres > Jaquettes**. La clé est vérifiée auprès de SteamGridDB avant d'être enregistrée.
- **Rappel tant que la clé manque** : un point rouge sur Paramètres dans la barre latérale et une alerte en haut des Paramètres te signalent que des jaquettes risquent de manquer, jusqu'à ce que la clé soit enregistrée.
- **N'importe quelle couleur dès le départ** : l'étape « Ta couleur » de la configuration propose la pastille « + » pour choisir la teinte que tu veux, comme dans les Paramètres.

#### Améliorations
- **Bouton Actualiser** : en haut de Hangar, il met à jour tes comptes connectés, relance le scan, t'annonce les nouvelles mises à jour de jeux et cherche une nouvelle version de Hangar, en un seul clic.
- **Collections** : si une collection porte déjà le nom choisi, Hangar te prévient et te demande si tu veux quand même en créer une autre.

### 1.2.24 - 14 novembre 2026
Le bouton Xbox te ramène dans Hangar depuis n'importe où, créer une collection se fait en quelques clics, et chaque mise à jour te dit désormais ce qui a changé.

#### Nouveautés
- **Bouton Xbox partout** (Windows) : depuis un jeu, une autre app ou avec Hangar caché, le bouton Xbox de ta manette ramène Hangar au premier plan et ouvre le mode manette.
- **Nouvelle collection** : le « + » de la section Collections, dans la barre latérale, ouvre une fenêtre où tu donnes un nom et coches tes jeux, avec une barre de recherche pour les trouver vite.
- **Ajouter des jeux** : dans une collection, une carte en fin de grille rouvre cette fenêtre, avec les jeux de la collection déjà cochés.
- **Notes de version** : après chaque mise à jour, Hangar te montre une fois ce qui a changé. Tu peux les revoir dans **Paramètres > Général > Nouveautés**.

#### Améliorations
- La section **Collections** reste visible dans la barre latérale, même quand tu n'en as encore aucune.

### 1.2.23 - 14 novembre 2026
Hangar s'ouvre maintenant sur l'onglet de ton choix, et le mode manette se pilote plus naturellement, avec tes collections à portée de pouce.

#### Nouveautés
- **Onglet de départ** : choisis sur quel onglet Hangar s'ouvre (Accueil, Bibliothèque, Favoris, Jeux web ou l'une de tes collections). Le choix se fait dans une nouvelle 5e étape de la configuration de départ et se change dans **Paramètres > Général**. Si cet onglet disparaît (Jeux web désactivé, collection supprimée), Hangar revient à l'Accueil.
- Si tu avais déjà fait la configuration, une petite fenêtre te propose ce choix une seule fois ; la fermer garde l'Accueil, comme avant.
- **Mode manette** : chaque collection non vide a son propre onglet, entre Favoris et Tous les jeux.
- **Mode manette** : le bouton Xbox (ou PS, ou Home) ouvre et ferme le mode manette, comme Start.

#### Améliorations
- **Mode manette** : haut et bas restent dans la même colonne de jaquettes au lieu de partir en diagonale, et le stick suit la direction que tu pousses le plus.
- **Mode manette** : la barre d'onglets défile quand tes collections ne tiennent pas toutes à l'écran.

### 1.2.22 - 14 novembre 2026
**Steam Cloud ne bloque plus le lancement** : quand Steam ne peut pas synchroniser tes sauvegardes, il ouvre une petite fenêtre et attend ta réponse. Cette fenêtre restait cachée derrière l'écran de lancement de Hangar et le jeu ne démarrait jamais. Hangar te pose maintenant la question lui-même, et toute fenêtre de launcher qui attend trop longtemps repasse au premier plan. **Plus fiable** : une coupure réseau ne laisse plus un jeu sans jaquette pendant des jours, ton temps de jeu est enregistré chaque minute (rien de perdu après une mise en veille), un fichier Steam abîmé ne bloque plus le scan et Hangar s'ouvre même si le premier scan échoue. Plus de faux message « l'installation n'a pas abouti », ni de double installation sur un double clic. **Teamfight Tactics** s'affiche sous le nom TFT, avec sa jaquette.

### 1.2.21 - 13 novembre 2026
**Hangar MC a son logo** : le bouton grisé de la barre latérale affiche le logo de Hangar MC, l'arche et l'étoile de Hangar en pixels, à la place de l'icône cube. Le bouton présente toujours ce qui arrive, une mise à jour le débloquera.

### 1.2.20 - 13 novembre 2026
**Hangar MC arrive** : son bouton revient dans la barre latérale, grisé avec une étiquette « Bientôt ». Il présente le client Minecraft de Hangar : toutes les versions du jeu, Fabric intégré et nos propres modules, lancées en un clic. Une mise à jour le débloquera, sans rien à faire de ton côté. **Mises à jour Steam reportées** : Steam repousse parfois la mise à jour d'un jeu peu joué, et rien ne permet de la lancer de l'extérieur. Dans ce cas, « Mettre à jour » ouvre la page des téléchargements de Steam et te dit de cliquer sur le bouton de téléchargement du jeu.

### 1.2.19 - 13 novembre 2026
**Plus sûr** : ta clé SteamGridDB rejoint tes comptes dans le coffre du système (Gestionnaire d'identification Windows, Trousseau macOS) au lieu d'un fichier, et un bouton Retirer l'efface dans **Paramètres > Jaquettes**. Hangar n'ouvre que les jeux, dossiers et images que tu as choisis toi-même, refuse les partages réseau et ne lance plus que le bon programme de Riot. **Désinstaller sans risque** : Hangar ne supprime que le dossier du jeu vu par son launcher, jamais un dossier personnel, système ou qui contient un autre jeu. **Tes données protégées** : si ton fichier de bibliothèque est bloqué ou abîmé, Hangar réessaie ou reprend sa copie de secours au lieu de repartir de zéro, et un launcher au fichier corrompu ne fait plus fermer Hangar au démarrage. **Hangar MC** : l'onglet grisé quitte la barre latérale en attendant sa sortie.

### 1.2.18 - 9 novembre 2026
**Linux en pause** : la version Linux avait trop de bugs, elle est mise en pause le temps de la refaire. Sous Linux, Hangar n'affiche plus qu'un écran d'attente et ne se lance plus avec ton ordinateur. Quand la nouvelle version Linux sera prête, elle s'installera d'elle-même depuis cet écran. Hangar reste disponible sous Windows et macOS, rien ne change pour toi si tu es sur l'un des deux.

### 1.2.17 - 9 novembre 2026
**Signaler un bug** : ton signalement m'arrive mieux présenté (titre, description, version de Hangar, système et capture en grand), pour que je le traite plus vite. **Sécurité** : mise à jour de bibliothèques internes qui faisaient l'objet d'alertes (lecture des archives zip, composants Linux et outils de construction). Rien ne change dans ton utilisation de Hangar.

### 1.2.16 - 9 novembre 2026
**Fond plus sobre** : la lumière colorée tirée des jaquettes reste sur l'accueil et les fiches de jeux, mais ne déborde plus sur la bibliothèque, les jeux web et les paramètres, qui gardent un fond neutre. L'écran Hangar MC, toujours grisé en attendant Mojang, est prêt : page centrée, fond teinté par l'affiche de la version et dernière version lancée proposée en premier.

### 1.2.15 - 9 novembre 2026
**Téléchargements Steam en direct** : le menu Mises à jour affiche les installations et mises à jour Steam en cours avec leur vraie progression, qui avance pendant le téléchargement au lieu de rester figée. Les téléchargements en cours sont retrouvés quand tu relances Hangar, et un bouton « Afficher dans Steam », dans le menu et sur la page du jeu, permet de les mettre en pause, de les reprendre ou de les annuler.

### 1.2.14 - 9 novembre 2026
**Signaler un bug** : un bouton insecte en haut de Hangar ouvre une petite fenêtre (titre, description, capture si tu veux) qui m'envoie le bug directement, sans compte GitHub. **Linux** : l'installation d'un jeu Steam n'affiche plus « n'a pas abouti » avant même que tu l'aies confirmée dans Steam, et les flous d'arrière-plan, qui ralentissaient l'app, sont de nouveau retirés.

### 1.2.13 - 9 novembre 2026
**Linux** : les coins arrondis de la fenêtre s'affichent enfin. Dans la 1.2.12, le fond de l'app recouvrait encore les coins, qui restaient carrés.

### 1.2.12 - 9 novembre 2026
**Linux** : l'onglet « À installer » gagne un filtre « Compatibles Linux », qui ne garde que les jeux qui tournent sous Linux (version Linux sur Steam ou GOG, ou jeu Vérifié / Jouable sur Steam Deck). La fenêtre de Hangar a désormais des coins arrondis, comme sur Windows 11 et macOS.

### 1.2.11 - 8 novembre 2026
**Plus fluide partout** : les images floutées (jaquettes, lumière d'ambiance, écran de lancement, mode manette) sont préparées une fois pour toutes au lieu d'être recalculées à chaque image, et les animations ne sollicitent plus que la carte graphique. Le flou revient sous Linux, sans ralentir l'app, et Windows et macOS gagnent en fluidité. **Jeux locaux sous Linux** : Hangar trouve les jeux Linux, AppImage, scripts et `.exe` (lancés par Wine) de tes dossiers de jeux, ainsi que les raccourcis de jeux de ton menu d'applications. **Hangar MC** : l'onglet reste grisé jusqu'à la validation de Mojang.

### 1.2.10 - 8 novembre 2026
**Linux plus fluide** : Hangar retire sous Linux les effets de flou que le moteur d'affichage de Linux calcule sans la carte graphique, et corrige la lenteur connue avec les cartes NVIDIA. L'app répond nettement mieux, surtout en faisant défiler la bibliothèque. Sur Windows et macOS, rien ne change.

### 1.2.9 - 8 novembre 2026
**Hangar arrive sur Linux** : une AppImage pour CachyOS, Arch et les autres distributions, à télécharger depuis le site ou la page des releases, avec les mises à jour depuis Hangar comme sur Windows et macOS. Hangar y détecte tes jeux Steam (Proton compris, Steam installé par la distribution ou en Flatpak), tes dossiers de jeux locaux et tes ajouts manuels, et range tes comptes reliés dans KWallet ou GNOME Keyring. Les autres launchers (Epic, GOG, Ubisoft...) n'existent pas sous Linux et ne sont pas encore lus via Heroic ou Lutris.

### 1.2.8 - 8 novembre 2026
Non publiée : la construction de la release a échoué (notes de version), son contenu arrive avec la 1.2.9.

### 1.2.7 - 8 novembre 2026
**Hangar MC arrive** : un nouvel onglet pour le client Minecraft de Hangar, toutes les versions du jeu avec Fabric et nos propres modules (zoom, coordonnées, armure, raccourcis), lancées en un clic sans le launcher officiel. Pour l'instant l'écran reste grisé : Mojang doit d'abord valider l'application, une mise à jour le débloquera. Hangar reste léger : les fichiers de Hangar MC ne sont pas dans l'installeur, ils se téléchargent seulement si tu ouvres l'onglet et l'acceptes.

### 1.2.6 - 7 novembre 2026
**Launchers invisibles** (Windows) : quand tu lances ou mets à jour un jeu, la fenêtre de son launcher (Steam, Epic, Ubisoft Connect, EA app, Battle.net...) reste cachée, il travaille en arrière-plan et tu ne vois que ton jeu. S'il attend quelque chose de toi (connexion, contrat), le bouton « Afficher le launcher » le ramène. **Installer** : Hangar te demande dans quel dossier du launcher installer le jeu, avec la place libre de chaque disque. Les jeux Steam se téléchargent en arrière-plan avec la progression sur le bouton (« Installation 42 % »), puis « prêt » avec un bouton « Jouer ». **Désinstaller** : après confirmation dans Hangar, les jeux Steam, Epic et GOG sont supprimés sans ouvrir leur launcher. Garde-fous : rien pendant une partie, Epic jamais fermé pendant un téléchargement, alerte si un téléchargement Steam ne démarre pas.

### 1.2.5 - 7 novembre 2026
**Mises à jour des jeux** : Hangar repère les jeux Steam, Epic et GOG qui attendent une mise à jour, les range dans un nouvel onglet « Mises à jour » et te prévient par une notification. Le bouton « Mettre à jour » ouvre la mise à jour dans le bon launcher (Steam, Epic, GOG Galaxy, Microsoft Store), et un menu « Mises à jour » apparaît en haut à droite quand un jeu attend. La vérification se refait toute seule, jamais pendant une partie. **Assistant de configuration** : à la première ouverture (et une fois pour ceux qui ont déjà Hangar), quatre étapes pour régler tes launchers, tes dossiers de jeux, ta couleur et les jeux web, à relancer depuis Paramètres > Général. Les filtres de la bibliothèque ont de nouvelles listes déroulantes aux couleurs de Hangar, et le bouton de mise à jour de l'app devient « Mettre à jour Hangar ».

### 1.2.4 - 6 novembre 2026
**Discord Rich Presence** : la jaquette de ton jeu s'affiche maintenant quelle que soit sa source (Steam, Epic, GOG, Xbox, SteamGridDB), plus seulement pour les jeux Steam. Les **jeux web** apparaissent aussi sur Discord, avec leur jaquette, et disparaissent quand tu fermes leur fenêtre.

### 1.2.3 - 6 novembre 2026
**Discord Rich Presence** : tes amis Discord voient à quoi tu joues, avec le nom du jeu, sa jaquette, l'icône Hangar dans le coin, « Lancé avec Hangar » et le temps de jeu. Désactivé par défaut : à activer dans Paramètres > Général > « Afficher mon jeu sur Discord ». Passe par l'app Discord installée sur l'appareil.

### 1.2.2 - 5 novembre 2026
**Mode manette corrigé** : Hangar ne se rouvre plus en plein écran après avoir été fermé ou quitté en mode manette, et une fenêtre restée à la taille de l'écran retrouve sa taille normale. Le curseur se cache quand tu joues à la manette et revient dès que la souris bouge. **Nouveau menu de l'icône** : un clic gauche sur l'icône Hangar de la zone de notification ouvre un petit menu avec tes jeux récents et leur jaquette, « Ouvrir Hangar » et « Quitter Hangar » (le clic droit garde le menu simple). Les jaquettes s'affichent dès le tout premier lancement.

### 1.2.1 - 5 novembre 2026
**Mode manette** : Hangar en plein écran, à la manette ou au clavier (Start pour l'ouvrir, A pour jouer, LB / RB pour changer d'onglet). **Collections** : range tes jeux dans tes propres listes (clic droit > Collections), affichées dans la barre latérale, et filtre la bibliothèque par genre ou temps de jeu. **Zone de notification** : tes jeux récents à un clic de l'icône Hangar, la fenêtre s'y cache quand tu la fermes, et Ctrl+Alt+H l'affiche ou la cache. **Désinstaller** un jeu ouvre sa désinstallation dans son launcher. Sécurité renforcée : pop-ups et téléchargements bloqués dans les jeux web, chemins de fichiers limités aux jeux de la bibliothèque, images téléchargées seulement depuis les sites autorisés.

### 1.2.0 - 5 novembre 2026
Nouvel onglet **Jeux web** : une quarantaine de jeux navigateur (.io, classiques, stratégie, bac à sable : agar.io, slither.io, TETR.IO, OpenFront, Territorial.io, Bloxd...) avec leurs jaquettes, des icônes par genre et les jeux récents en tête. Chaque jeu s'ouvre dans sa propre fenêtre, sans accès à Hangar et limitée au HTTPS. L'onglet est proposé au démarrage (badge « Nouveau » pour ceux qui ont déjà l'app) et s'active dans Paramètres > Général.

### 1.1.3 - 5 novembre 2026
Un launcher désinstallé n'est plus détecté : ses restes sur le disque (dossier de données de Steam, base de GOG Galaxy, catalogue Epic) ne sont plus lus. Corrige des jeux Steam affichés sur un Mac sans Steam.

### 1.1.2 - 5 novembre 2026
Paramètres : les pages Launchers et Comptes sont réunies en une seule page « Launchers et comptes ».

### 1.1.1 - 5 novembre 2026
Paramètres refaits : navigation par section et lignes homogènes, mise en page adaptée aux petites fenêtres.

### 1.1.0 - 5 novembre 2026
Jeux possédés non installés : affichés et installables depuis Hangar (Steam, Epic, GOG, Riot), dans un nouvel onglet « À installer ». Connexion des comptes Steam, GOG et Epic dans les Paramètres pour récupérer toute la bibliothèque (secrets dans le trousseau du système), et tag « Détecté » pour chaque launcher présent.

### 1.0.7 - 4 novembre 2026
Thème clair, sombre ou celui de l'appareil, et paramètres réorganisés.

### 1.0.6 - 4 novembre 2026
Build macOS sur les machines Intel de GitHub (l'app reste universelle Intel et Apple Silicon).

### 1.0.5 - 4 novembre 2026
Correction de la release : l'installeur n'est plus confondu avec l'app.

### 1.0.4 - 4 novembre 2026
Installeur Windows aux couleurs de Hangar. Sur les jaquettes, le bouton du survol lance le jeu et le clic ouvre la fiche. README refait pour GitHub, licence MIT.

### 1.0.3 - 4 novembre 2026
macOS : le cadre natif de la fenêtre n'est plus écrasé par sa taille mémorisée.

### 1.0.2 - 4 novembre 2026
macOS : fenêtre native avec coins arrondis et boutons standards.

### 1.0.1 - 4 novembre 2026
Première version publique de Hangar 2 : interface Svelte fidèle à la maquette, détection de tous les stores (Steam, Epic, GOG, Ubisoft, EA, Battle.net, Riot, Xbox, jeux hors store, dossiers locaux), vraies jaquettes multi-sources, temps de jeu, dernière session, taille et genre importés des stores, logos des stores, identité visuelle.

## Correctifs

Une entrée par correctif (4e chiffre), le plus récent en haut, écrite avant `npm run correctif`. Ce n'est pas une patch note : la release du correctif reprend toutes les entrées de sa version de base, et Hangar les montre (celles plus récentes que la version installée) dans une fenêtre avant d'installer. Une puce par correction, courte, pour les utilisateurs.

### 1.2.29.5 - 17 novembre 2026

- Un compte suspendu, ou dont les amis ont été coupés, le voit dans Hangar : le motif et la durée dans Paramètres > Compte et sur l'écran Amis, la synchronisation en pause et l'interrupteur des amis grisé.

### 1.2.29.4 - 17 novembre 2026

- « Installer » un jeu d'un ami propose un seul site officiel et le launcher exigé par le jeu (Ubisoft Connect, EA app, Battle.net, Rockstar, Riot, Epic) ; s'il manque, sa page de téléchargement s'ouvre.
- Un double-clic sur l'icône de Hangar près de l'horloge ouvre Hangar.

### 1.2.29.3 - 17 novembre 2026

- « Installer » un jeu d'un ami trouve plus souvent son site officiel (variantes du nom, recherche Steam), sinon ouvre une recherche web.
- « Installer » ouvre la page du jeu dans son launcher (Steam, GOG, Battle.net, Microsoft Store, Ubisoft, Riot, Epic, EA, Rockstar), qui démarre si besoin et passe au premier plan.

### 1.2.29.2 - 17 novembre 2026

- Une pastille certifiée s'affiche à côté du pseudo des comptes certifiés, partout dans Hangar : amis, demandes, recherche, discussion, activité et votre propre pseudo.
- Le bouton Actualiser rafraîchit tout (comptes des launchers, mises à jour des jeux, amis, jaquettes, taille et succès des jeux, profil) et montre chaque élément rafraîchi en infobulle.

### 1.2.29.1 - 17 novembre 2026

- Sur le profil d'un ami, un jeu que vous n'avez pas s'ouvre d'un clic : site officiel, page du jeu dans son launcher, ou ajout d'un exécutable déjà sur ce PC.

### 1.2.28.8 - 17 novembre 2026

- Clic droit partout dans Hangar : jeux, amis, messages, barre latérale, Jeux web et listes des Paramètres (aussi touche Menu ou Maj+F10).
- Dans une collection ou dans Favoris, un jeu peut en être retiré depuis son menu (avec « Annuler »).

### 1.2.28.7 - 17 novembre 2026

- Avant d'installer un correctif, Hangar liste ses corrections, avec « Mettre à jour » ou « Annuler ».
