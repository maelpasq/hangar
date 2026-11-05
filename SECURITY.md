# Sécurité

## Versions suivies

Seule la dernière version publiée de Hangar reçoit des correctifs de sécurité. Les versions installées se mettent à jour depuis Hangar (bouton « Mettre à jour »).

## Signaler une faille

Ne publie pas de faille dans une issue publique. Utilise le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability**. Seul le mainteneur voit le message.

Décris si possible :

- ce qu'un attaquant pourrait faire et à quelles conditions ;
- les étapes pour reproduire, la version de Hangar et le système (Windows ou macOS) ;
- une idée de correctif, si tu en as une.

Tu recevras une réponse dès que possible. Une faille confirmée est corrigée dans une nouvelle version, puis décrite dans ses notes une fois les utilisateurs à jour.

## Ce que Hangar protège

- **Comptes des launchers** (Steam, GOG, Epic) : clés et jetons rangés dans le coffre du système (Gestionnaire d'identification Windows, Trousseau macOS), jamais dans un fichier, un journal ou l'interface. Les appels réseau passent par une liste fermée d'hôtes, en HTTPS, sans suivre de redirection.
- **Fenêtres web** (jeux web, connexion aux comptes) : aucun accès aux fonctions de Hangar, HTTPS seulement, pop-ups et téléchargements bloqués pour les jeux.
- **Lancement des jeux** : seuls les jeux connus de Hangar peuvent être lancés ; les chemins reçus de l'interface sont limités aux dossiers de ces jeux.
- **Mises à jour** : chaque installeur est signé, et Hangar vérifie la signature avant de l'installer.
- **Réseau** : aucune télémétrie. La liste complète des services contactés est dans le [README](README.md#confidentialité).
