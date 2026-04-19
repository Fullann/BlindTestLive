# Tutoriel montage buzzer ESP32

## Bill of materials (BOM)

- 1x ESP32 DevKit
- 1x bouton arcade (contact NO)
- 1x LED verte + 1x LED rouge (ou RGB)
- 1x buzzer piezo / petit haut-parleur actif
- résistances 220 ohms pour LEDs
- câbles Dupont, breadboard, câble USB

## Schéma logique de câblage

- bouton : `GPIO18` <-> bouton <-> `GND` (mode `INPUT_PULLUP`)
- LED verte : `GPIO26` -> résistance 220 ohms -> LED -> `GND`
- LED rouge : `GPIO27` -> résistance 220 ohms -> LED -> `GND`
- haut-parleur / buzzer : `GPIO25` -> + speaker ; - speaker -> `GND`

## Flash du firmware

1. Ouvrir `docs/firmware-esp32.ino`.
2. Renseigner :
   - `WIFI_SSID`, `WIFI_PASSWORD`
   - `SERVER_HOST`, `SERVER_PORT`
   - `DEVICE_ID`
   - `DEVICE_SECRET` (même valeur que `DEVICE_SHARED_SECRET` du serveur)
3. Compiler et flasher avec Arduino IDE / PlatformIO.

## Ajout du buzzer dans l'application

1. Lancer une partie admin.
2. Ouvrir `/admin/game/:gameId/hardware`.
3. Assigner le `deviceId` à un joueur.
4. Tester LED et audio.
5. Ajuster `speakerEnabled` et `speakerMuted` selon le setup.

## Dépannage rapide

- pas de connexion : vérifier IP serveur et pare-feu réseau local.
- LED ne réagit pas : vérifier GND commun et résistances.
- son absent : vérifier pin `SPEAKER_PIN` et type de buzzer.
- buzz non pris : vérifier association joueur/device dans l'inventaire.
