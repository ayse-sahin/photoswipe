# Pare

A phone app (iPhone and Android) for cleaning up your photos. Pick a start date, then swipe through your photos: left to delete, right to keep. Similar photos get grouped so you can clean up bursts quickly.

Built with React Native + Expo (TypeScript).

## Run it on your phone

1. Install **Node.js** (LTS) on your Mac from https://nodejs.org.
2. Install the **Expo Go** app on your phone (App Store or Google Play).
3. In Terminal:
   ```bash
   git clone https://github.com/ayse-sahin/photoswipe
   cd photoswipe
   npm install
   npx expo start
   ```
4. A QR code appears in Terminal.
   - **iPhone:** open the Camera app and point it at the QR code.
   - **Android:** open Expo Go and tap "Scan QR code".
5. The app opens on your phone. Your phone and Mac must be on the same Wi-Fi.

Edit `App.tsx`, save, and the phone updates automatically.

## Make a real installable app

Builds run in the cloud with Expo's EAS Build. You need a free Expo account (https://expo.dev/signup).

One-time setup, in Terminal:
```bash
npm install -g eas-cli
cd ~/photoswipe
eas login
eas init
```

**Android** (free): builds an `.apk` file and gives you a link. Anyone with an Android phone can open the link, download it and install it (they may need to allow "install unknown apps").
```bash
eas build --platform android --profile preview
```

**iPhone**: needs an Apple Developer account ($99/year).
- Ad hoc (up to 100 iPhones you register): friends open a link from `eas device:create` to register their phone, then
  ```bash
  eas build --platform ios --profile preview
  ```
  and install from the link EAS gives you.
- TestFlight (easiest for friends, also the path to the App Store):
  ```bash
  eas build --platform ios --profile production
  eas submit --platform ios
  ```
