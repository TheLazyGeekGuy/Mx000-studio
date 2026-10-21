# Mx000 Studio

Éditeur, dans le navigateur, du **M3000** (Studio Reverb Processor) et du **M2000** (Studio Effects Processor), fondé
sur MIDI Studio. Projet communautaire indépendant, sans lien avec le fabricant des appareils.

**[Ouvrir l’éditeur](https://thelazygeekguy.github.io/Mx000-studio/)** · [English](README.md) · [Notes et sources (anglais)](docs/instruments/TC-M-SERIES.md)

Version alpha. **Le M3000 s’édite en direct par MIDI** (SysEx) ; le M2000, dont le SysEx n’est pas publié, s’édite hors
ligne et s’exporte en fichiers. Le comportement matériel a été vérifié sur un seul M3000 en logiciel 2.04 ; les autres
appareils et versions ne sont pas validés.

## Démarrer

1. Ouvrir l’éditeur dans un navigateur avec Web MIDI (navigateurs Chromium) et autoriser le MIDI avec SysEx. Sans MIDI,
   l’éditeur fonctionne hors ligne avec des fichiers.
2. Choisir l’appareil avec le curseur **M3000 / M2000** (flèches, clic ou glisser ; la molette ne change jamais
   d’appareil). Chaque appareil garde son brouillon ; changer d’appareil ne convertit et ne perd rien, et s’annule.
3. M3000 : ouvrir **Appareil (MIDI)** (ou l’icône MIDI à côté de l’état de connexion) et choisir les ports. L’éditeur
   envoie une demande d’identité universelle et n’accepte qu’une réponse de M3000, puis lit l’état en cours. Les
   modifications partent au fil de l’édition dans le buffer d’édition ; un preset n’est mémorisé dans un emplacement
   utilisateur qu’après confirmation explicite.
4. Éditer les deux moteurs, le type de preset (simple ou combiné), le routage et le Dynamic Morphing. Un simple clic ne
   modifie jamais une valeur : glisser un potard, utiliser les flèches, la molette sur le potard actif, ou double-cliquer
   la valeur pour la saisir.

Les brouillons restent dans le navigateur ; les exporter en `.json` ou `.syx` pour les garder ou les déplacer.

## Ce que chaque appareil permet

- **M3000** : spécification SysEx V1.01 ; connexion (identité, lecture de l’état et de la mémoire, rappel, envoi en
  direct, envoi du preset entier dans le buffer d’édition, mémorisation en emplacement utilisateur après confirmation) ;
  21 algorithmes (423 paramètres sur les 17 tables moteur publiées) ; dumps de presets décodés pour tous les algorithmes (simples et combinés, en-tête
  du combiné compris). Bibliothèque dans une fenêtre séparée (mémoire de l’appareil, copies locales, import `.syx`,
  banques, notes) ; preset choisi moteur par moteur, y compris dans un combiné.
- **M2000** : seul le guide MIDI CC est publié, pas de SysEx ; 10 algorithmes et 85 paramètres tirés du manuel. Valeurs
  MIDI brutes 0–127 ; bornes imprimées exactes, plages en dB approchées (« ≈ »). Export `.mid` en Control Change :
  seuls Mix (CC 10) et Out Level (CC 11) ont un numéro publié.

Aussi : une page de routage dessinée (six routages), des variations reproductibles d’un moteur ou des deux, et
l’interface en anglais, français, italien, allemand, japonais, espagnol, russe et chinois.

**Copie entre appareils.** Le fabricant indique que les presets M2000 ne se chargent pas dans le M3000, et aucun de ses
documents ne dit qu’un algorithme M2000 est identique à un algorithme M3000. Pour les algorithmes dont la contrepartie
est documentée, « Copier vers… » reprend les valeurs en unités du manuel et indique ce qui est confirmé, repris sur
hypothèse ou non repris. Le résultat est un brouillon à écouter, pas une équivalence.

## Données et publication

Brouillons, bibliothèque locale et préférences restent dans le navigateur, sauf export demandé. Aucun serveur applicatif, télémétrie ou
envoi. GitHub assure l’hébergement et peut traiter les données d’accès habituelles. La publication ne contient que les
sources utiles, les tests synthétiques et la documentation ; les manuels du constructeur ne sont pas redistribués.

Installation, tests et déploiement : voir le [README anglais](README.md#development). Licence MIT.
