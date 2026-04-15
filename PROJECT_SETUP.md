# MyApp (Maps Cycle Location)

MyApp is a React Native MVP for cyclists and riders who need live GPS tracking, a real road route on the map, and ride progress feedback without relying on Google Maps.

## Project Summary

This app uses:
- React Native 0.85.1
- OpenStreetMap tiles rendered through Leaflet inside WebView
- OSRM public routing API for free road directions
- Device GPS via `@react-native-community/geolocation`

## Core Features

- Live device location tracking on a physical device
- Road-based route polyline from start point to destination point
- OpenStreetMap map rendering without Google Maps API keys
- Start point, destination point, and checkpoint markers
- Distance covered, remaining distance, and total route distance
- Ride progress bar and motivational ride alerts
- Android and iOS support

## Environment Requirements

## Required Versions

- Node.js `22.11.0` or newer
- Yarn `1.x`
- Ruby and Bundler for iOS CocoaPods
- Android Studio with Android SDK
- Xcode and CocoaPods for iOS builds

## Device Requirements

- Physical Android or iPhone device recommended for real GPS testing
- Device Location / GPS must be enabled
- Internet connection is required for:
  - OpenStreetMap tiles
  - OSRM route requests

## Installation

From the project root:

```sh
yarn install
```

For iOS:

```sh
cd ios
bundle install
bundle exec pod install
cd ..
```

## Running the Project

## Start Metro

```sh
yarn start
```

## Run on Android

```sh
yarn android
```

## Run on iOS

```sh
yarn ios
```

## Android Setup Notes

Before testing on Android:

1. Enable Location on the phone.
2. Set location accuracy to high accuracy if available.
3. Allow app location permission when prompted.
4. Keep mobile data or Wi-Fi enabled so map tiles and route data can load.

If GPS is off, the app prompts the user to open device location settings.

## iOS Setup Notes

Before testing on iPhone:

1. Allow location permission when prompted.
2. Ensure internet connection is active.
3. Run CocoaPods install after dependency changes.

## Mapping and Routing Stack

This MVP intentionally avoids Google Maps.

## Map Provider

- OpenStreetMap tiles
- Rendered via Leaflet in `react-native-webview`

## Routing Provider

- OSRM public API
- Endpoint used for road route generation:

```txt
https://router.project-osrm.org/route/v1/bicycle/
```

## Limitations of Current Free MVP Stack

- OSRM public endpoint is free but not guaranteed for production-scale traffic
- OpenStreetMap tiles depend on internet availability
- Route quality depends on available OpenStreetMap road data
- For production, use a hosted routing backend or your own OSRM server

## Main Project Files

- `App.tsx`: app root
- `src/navigation/AppNavigator.tsx`: navigation setup
- `src/screens/MapsCycleScreen.tsx`: main ride tracking screen
- `src/services/LocationService.ts`: permissions and GPS access
- `android/app/src/main/AndroidManifest.xml`: Android permissions
- `ios/MyApp/Info.plist`: iOS location permission text

## Validation Commands

Run lint:

```sh
yarn lint
```

Run tests:

```sh
yarn test --watchAll=false
```

## Suggested Next Features

- Turn-by-turn instruction list
- Live speed and average speed
- Ride duration timer
- Calories estimate
- Saved ride history
- Custom destination selection from the map
- Production routing backend
