import Geolocation from '@react-native-community/geolocation';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

type Coords = {
  latitude: number;
  longitude: number;
};

type LocationError = {
  code?: number;
  message: string;
};

const ANDROID_LOCATION_PERMISSION_DENIED_MESSAGE =
  'Location permission denied. Please allow location in app settings.';

function openAndroidLocationSettings() {
  if (Platform.OS !== 'android') {
    return;
  }

  Alert.alert(
    'Turn On Device Location',
    'Location services are off or unavailable. Please turn on Location (GPS) on your device to continue.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open Location Settings',
        onPress: async () => {
          try {
            if (typeof Linking.sendIntent === 'function') {
              await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
              return;
            }
          } catch (err) {
            console.warn('[locationService] Could not open Android location settings via intent:', err);
          }

          try {
            await Linking.openSettings();
          } catch (err) {
            console.warn('[locationService] Could not open app settings:', err);
          }
        },
      },
    ]
  );
}

function getCurrentPositionAsync(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<Coords> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        resolve(coords);
      },
      error => {
        reject(error);
      },
      options
    );
  });
}

// Request location permissions for Android
async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const permissionResult = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);

      const fine = permissionResult[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const coarse = permissionResult[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];

      const granted =
        fine === PermissionsAndroid.RESULTS.GRANTED ||
        coarse === PermissionsAndroid.RESULTS.GRANTED;

      return granted;
    } catch (err) {
      console.warn('[locationService] Permission error:', err);
      return false;
    }
  }

  if (Platform.OS === 'ios') {
    const requestAuthorization = (Geolocation as any).requestAuthorization;
    if (typeof requestAuthorization === 'function') {
      const status = await requestAuthorization();

      if (typeof status === 'string') {
        return (
          status === 'granted' ||
          status === 'authorizedAlways' ||
          status === 'authorizedWhenInUse'
        );
      }

      return status === true;
    }
  }

  return true;
}

// Live location tracking
export function watchUserLocation(
  onLocation: (coords: Coords) => void,
  onError?: (error: LocationError) => void
): number | null {
  console.log('[locationService] Starting watchUserLocation');
  
  // Check if Geolocation is available
  if (!Geolocation) {
    console.warn('[locationService] Geolocation API not available');
    if (onError) {
      onError({
        message: 'Geolocation not available',
      });
    }
    return null;
  }

  const watchId = Geolocation.watchPosition(
    position => {
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      console.log('[locationService] Live device coordinates:', coords);
      syncLocationToBackend(coords);
      onLocation(coords);
    },
    error => {
      console.warn('[locationService] Failed to get live device location:', error);
      if (onError) {
        onError({
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      enableHighAccuracy: true,
      distanceFilter: 3,
      interval: 5000,
      fastestInterval: 2000,
      timeout: 20000,
      maximumAge: 5000,
    }
  );
  return watchId;
}

export function clearLocationWatch(watchId: number | null) {
  if (watchId != null && Geolocation) {
    Geolocation.clearWatch(watchId);
  }
}

export async function getCurrentCoordinates(): Promise<Coords> {
  // Request permissions first
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    throw new Error(ANDROID_LOCATION_PERMISSION_DENIED_MESSAGE);
  }

  // Check if Geolocation is available
  if (!Geolocation) {
    throw new Error('Geolocation API not available');
  }

  try {
    const highAccuracyCoords = await getCurrentPositionAsync({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 5000,
    });

    console.log('[locationService] Got high-accuracy coordinates:', highAccuracyCoords);
    syncLocationToBackend(highAccuracyCoords);
    return highAccuracyCoords;
  } catch (highAccuracyError: any) {
    console.warn('[locationService] High-accuracy location failed. Falling back:', highAccuracyError);

    try {
      const fallbackCoords = await getCurrentPositionAsync({
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 30000,
      });

      console.log('[locationService] Got fallback coordinates:', fallbackCoords);
      syncLocationToBackend(fallbackCoords);
      return fallbackCoords;
    } catch (fallbackError: any) {
      console.warn('[locationService] Fallback location failed:', fallbackError);

      if (fallbackError?.code === 1) {
        throw new Error(ANDROID_LOCATION_PERMISSION_DENIED_MESSAGE);
      }

      if (fallbackError?.code === 2 || fallbackError?.code === 3) {
        openAndroidLocationSettings();
        throw new Error('Device location is off or unavailable. Turn on Location and retry.');
      }

      throw new Error(fallbackError?.message || 'Unable to get current location');
    }
  }
}

// Sync location to backend
async function syncLocationToBackend(coords: Coords) {
  try {
    console.log('[locationService] Syncing location to backend:', coords);
    // TODO: Replace with your actual API call
  } catch (err) {
    console.error('[locationService] Failed to sync location to backend:', err);
  }
}

