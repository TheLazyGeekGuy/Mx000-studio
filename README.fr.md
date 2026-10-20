# Mx000 Studio

Éditeur hors ligne, dans le navigateur, des **TC Electronic M3000** (Studio Reverb Processor) et **M2000** (Studio
Effects Processor), fondé sur MIDI Studio. Projet communautaire indépendant.

**[Ouvrir l’éditeur](https://thelazygeekguy.github.io/Mx000-studio/)** · [English](README.md) · [Notes et sources (anglais)](docs/instruments/TC-M-SERIES.md)

Version alpha. **Les échanges MIDI avec le matériel sont désactivés dans cette version** : l’éditeur n’envoie rien à
l’appareil, et aucun des deux modèles n’a été validé sur le matériel. Il prépare des réglages et des fichiers que vous
jouez ou chargez vous-même.

## Démarrer

1. Ouvrir l’éditeur dans un navigateur récent. L’autorisation MIDI n’est pas nécessaire.
2. Choisir l’appareil avec le curseur **M3000 / M2000** (flèches, clic ou glisser ; la molette ne change jamais
   d’appareil). Chaque appareil garde son brouillon ; changer d’appareil ne convertit et ne perd rien, et s’annule.
3. Éditer les deux moteurs, le type de preset (simple ou combiné) et le routage. Un simple clic ne modifie jamais une
   valeur : glisser un potard, utiliser les flèches, la molette sur le potard actif, ou double-cliquer la valeur pour la
   saisir.

Les brouillons restent dans le navigateur ; les exporter en `.json` pour les garder ou les déplacer.

## Ce que chaque appareil permet

- **M3000** : spécification SysEx V1.01 ; 21 algorithmes et 274 paramètres moteur. Valeurs en unités du manuel quand
  l’échelle est confirmée (143 lignes sur 308), sinon valeur brute signalée. Export `.syx` (un message Parameter Data
  par paramètre, pour l’algorithme déjà chargé sur l’appareil) ; import `.syx` (dumps Preset Data conservés octet pour
  octet, non décodés) et `.json`.
- **M2000** : seul le guide MIDI CC est publié, pas de SysEx ; 10 algorithmes et 85 paramètres tirés du manuel. Valeurs
  MIDI brutes 0–127 ; bornes imprimées exactes, plages en dB approchées (« ≈ »). Export `.mid` en Control Change :
  seuls Mix (CC 10) et Out Level (CC 11) ont un numéro publié.

**Copie entre appareils.** TC indique que les presets M2000 ne se chargent pas dans le M3000, et aucun document TC ne
dit qu’un algorithme M2000 est identique à un algorithme M3000. Pour les algorithmes dont la contrepartie est
documentée, « Copier vers… » reprend les valeurs en unités du manuel et indique ce qui est confirmé, repris sur
hypothèse ou non repris. Une option à cocher reprend aussi, en position relative, les valeurs sans échelle publiée.
Le résultat est un brouillon à écouter, pas une équivalence.

## Données et publication

Brouillons et préférences restent dans le navigateur, sauf export demandé. Aucun serveur applicatif, télémétrie ou
envoi. GitHub assure l’hébergement et peut traiter les données d’accès habituelles. La publication ne contient que les
sources utiles, les tests synthétiques et la documentation ; les manuels du constructeur ne sont pas redistribués.

Installation, tests et déploiement : voir le [README anglais](README.md#development). Licence MIT.
