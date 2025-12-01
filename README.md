# FocusBrowser (Expo)

FocusBrowser is an in-house mobile browser built with Expo/React Native. It wraps `react-native-webview` with custom chrome, banned-site enforcement, persistent session storage, and an optional override timer for supervised browsing scenarios.

## Features

- **DuckDuckGo-first start screen** with smart omnibox (search or direct URL input).
- **Custom browser chrome**: HTTPS lock indicator, go/back/forward controls, reload button, inline loading bar, and immersive dark theme.
- **Navigation safeguards**: Remote banned-host list fetched from `https://cdn.bizbazboz.uk/api/v1/focusbrowser/banned_urls.json`, with overlay messaging and a one-per-day override window (toggled via `ENABLE_OVERRIDE`).
- **Persistent cookies & sessionStorage** synced between the WebView and AsyncStorage to make sessions survive reloads.
- **Go Home shortcut** and guardrails on navigation buttons so blocked URLs cannot be reached via back/forward/refresh.
- **Single-source icons**: every platform references `assets/icon.png`; splash artwork lives in `assets/splash-icon.png`.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Run the Expo dev server (tunneled, cache cleared)**
   ```bash
   npx expo start --tunnel -c
   ```
3. **Open the project** in Expo Go (scan the QR code). Close and reopen Expo Go after updating icons or splash assets to ensure they reload.

## Key Configuration

- `App.js`
  - `ENABLE_OVERRIDE`: set to `false` for builds where the override UI must be hidden.
  - `BANNED_URLS_ENDPOINT`: CDN JSON file containing hostnames to block; edit if moving the list.
   - `HOME_URL`: default landing page (currently `https://duckduckgo.com/`).
- `assets/icon.png`: square PNG (ideally 1024×1024) used for app icon, adaptive icon, and favicon slots.
- `assets/splash-icon.png`: artwork used on the Expo splash screen.
- `app.json`: tweak metadata, orientation, splash colors, etc.

## Project Scripts

| Command | Description |
| --- | --- |
| `npm start` | Launch standard Expo dev server |
| `npm run android` | Start Expo with Android emulator/device |
| `npm run ios` | Start Expo with iOS simulator/device |
| `npm run web` | Run in Expo web target |

## Notes

- The override window persists per calendar day via AsyncStorage. Double-tapping the countdown pill ends the current override early and locks the feature for the rest of the day.
- When changing banned lists or icons, restart the Expo server with `-c` and fully reload the client to avoid stale caches.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
