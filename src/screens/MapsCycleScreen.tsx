import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { watchUserLocation, clearLocationWatch, getCurrentCoordinates } from '../services/LocationService';

interface RoutePoint {
  latitude: number;
  longitude: number;
}

type MapPayload = {
  currentPosition: RoutePoint | null;
  polylineCoords: RoutePoint[];
  checkpoints: RoutePoint[];
  startPoint: RoutePoint | null;
  endPoint: RoutePoint | null;
};

const LEAFLET_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      background: #f1f5f9;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([37.7749, -122.4194], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const overlays = L.layerGroup().addTo(map);

    let lastRouteKey = '';

    function renderPayload(payload) {
      if (!payload) {
        return;
      }

      overlays.clearLayers();

      if (payload.polylineCoords && payload.polylineCoords.length > 0) {
        const line = payload.polylineCoords.map((p) => [p.latitude, p.longitude]);
        L.polyline(line, {
          color: '#2563eb',
          weight: 5,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(overlays);

        const routeKey = line.length + ':' + line[0][0] + ':' + line[0][1] + ':' + line[line.length - 1][0] + ':' + line[line.length - 1][1];
        if (routeKey !== lastRouteKey) {
          map.fitBounds(line, { padding: [40, 40] });
          lastRouteKey = routeKey;
        }
      }

      if (payload.startPoint) {
        L.circleMarker([payload.startPoint.latitude, payload.startPoint.longitude], {
          radius: 8,
          color: '#14532d',
          fillColor: '#22c55e',
          fillOpacity: 1,
          weight: 2
        }).addTo(overlays).bindPopup('Start');
      }

      if (payload.endPoint) {
        L.circleMarker([payload.endPoint.latitude, payload.endPoint.longitude], {
          radius: 8,
          color: '#7f1d1d',
          fillColor: '#ef4444',
          fillOpacity: 1,
          weight: 2
        }).addTo(overlays).bindPopup('Destination');
      }

      if (payload.currentPosition) {
        const user = [payload.currentPosition.latitude, payload.currentPosition.longitude];
        L.circleMarker(user, {
          radius: 8,
          color: '#0f172a',
          fillColor: '#38bdf8',
          fillOpacity: 1,
          weight: 2
        }).addTo(overlays).bindPopup('Your Live Position');

        if (!payload.polylineCoords || payload.polylineCoords.length === 0) {
          map.setView(user, 16);
        }
      }

      if (payload.checkpoints && payload.checkpoints.length > 0) {
        payload.checkpoints.forEach((cp, index) => {
          const marker = L.circleMarker([cp.latitude, cp.longitude], {
            radius: 7,
            color: '#a16207',
            fillColor: '#facc15',
            fillOpacity: 1,
            weight: 2
          }).addTo(overlays);
          marker.bindPopup('Checkpoint ' + (index + 1));
        });
      }
    }

    function onMessage(event) {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'map-data') {
          renderPayload(data.payload);
        }
      } catch (error) {
        // Ignore invalid messages.
      }
    }

    document.addEventListener('message', onMessage);
    window.addEventListener('message', onMessage);
  </script>
</body>
</html>
`;

const toRadians = (degrees: number) => degrees * Math.PI / 180;
const toDegrees = (radians: number) => radians * 180 / Math.PI;

const haversineDistanceMeters = (a: RoutePoint, b: RoutePoint): number => {
  const earthRadius = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const buildDestinationPoint = (start: RoutePoint, distanceMeters: number, bearingDegrees: number): RoutePoint => {
  const earthRadius = 6371000;
  const angularDistance = distanceMeters / earthRadius;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(start.latitude);
  const lon1 = toRadians(start.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    latitude: toDegrees(lat2),
    longitude: toDegrees(lon2),
  };
};

const toCheckpointsFromRoute = (route: RoutePoint[], count: number = 3): RoutePoint[] => {
  if (route.length < 4) {
    return [];
  }

  const checkpoints: RoutePoint[] = [];
  for (let i = 1; i <= count; i++) {
    const index = Math.floor((i * (route.length - 1)) / (count + 1));
    checkpoints.push(route[index]);
  }

  return checkpoints;
};

const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(2)} km`;
};

const calculateRouteDistanceMeters = (route: RoutePoint[]): number => {
  if (route.length < 2) {
    return 0;
  }

  let distance = 0;
  for (let i = 1; i < route.length; i++) {
    distance += haversineDistanceMeters(route[i - 1], route[i]);
  }

  return distance;
};

const getMotivationMessage = (totalMeters: number): string => {
  if (totalMeters < 250) {
    return 'Warm-up done. Keep your rhythm steady.';
  }

  if (totalMeters < 750) {
    return 'Great cadence. You are building momentum.';
  }

  if (totalMeters < 1500) {
    return 'Strong ride. Your route progress is climbing.';
  }

  if (totalMeters < 3000) {
    return 'Excellent endurance. You are flying.';
  }

  return 'Outstanding effort. Keep pushing to the finish.';
};

const fetchRoadRoute = async (start: RoutePoint, end: RoutePoint): Promise<RoutePoint[]> => {
  const url =
    `https://router.project-osrm.org/route/v1/bicycle/` +
    `${start.longitude},${start.latitude};${end.longitude},${end.latitude}` +
    `?overview=full&geometries=geojson&steps=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Routing request failed with status ${response.status}`);
  }

  const data = await response.json();
  const coordinates = data?.routes?.[0]?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) {
    throw new Error('No route geometry returned');
  }

  return coordinates.map((coord: [number, number]) => ({
    latitude: coord[1],
    longitude: coord[0],
  }));
};

const MapsCycleScreen: React.FC = () => {
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [polylineCoords, setPolylineCoords] = useState<RoutePoint[]>([]);
  const [checkpoints, setCheckpoints] = useState<RoutePoint[]>([]);
  const [startPoint, setStartPoint] = useState<RoutePoint | null>(null);
  const [endPoint, setEndPoint] = useState<RoutePoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [totalDistanceMeters, setTotalDistanceMeters] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeOriginRef = useRef<RoutePoint | null>(null);
  const routingInProgressRef = useRef(false);
  const previousPositionRef = useRef<RoutePoint | null>(null);
  const motivationMilestoneRef = useRef(0);

  const updatePosition = useCallback((coords: { latitude: number; longitude: number }) => {
    const pos: RoutePoint = {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };

    const previousPosition = previousPositionRef.current;
    if (previousPosition) {
      const segmentDistance = haversineDistanceMeters(previousPosition, pos);
      if (segmentDistance > 1 && segmentDistance < 250) {
        setTotalDistanceMeters(current => current + segmentDistance);
      }
    }

    previousPositionRef.current = pos;
    setCurrentPosition(pos);
  }, []);

  const buildRoadDirections = useCallback(async (origin: RoutePoint, forceRebuild: boolean = false) => {
    if (routingInProgressRef.current) {
      return;
    }

    if (!forceRebuild && routeOriginRef.current) {
      const moved = haversineDistanceMeters(routeOriginRef.current, origin);
      if (moved < 120) {
        return;
      }
    }

    routingInProgressRef.current = true;

    try {
      const destination = buildDestinationPoint(origin, 1800, 35);
      const roadRoute = await fetchRoadRoute(origin, destination);

      routeOriginRef.current = origin;
      setStartPoint(roadRoute[0] ?? origin);
      setEndPoint(roadRoute[roadRoute.length - 1] ?? destination);
      setPolylineCoords(roadRoute);
      setCheckpoints(toCheckpointsFromRoute(roadRoute));
    } catch (routeError) {
      console.warn('Road routing failed, using straight fallback line:', routeError);
      const destination = buildDestinationPoint(origin, 1800, 35);
      const fallback = [origin, destination];

      routeOriginRef.current = origin;
      setStartPoint(origin);
      setEndPoint(destination);
      setPolylineCoords(fallback);
      setCheckpoints([]);
    } finally {
      routingInProgressRef.current = false;
    }
  }, []);

  const mapPayload = useMemo<MapPayload>(() => ({
    currentPosition,
    polylineCoords,
    checkpoints,
    startPoint,
    endPoint,
  }), [currentPosition, polylineCoords, checkpoints, startPoint, endPoint]);

  const routeDistanceMeters = useMemo(() => {
    return calculateRouteDistanceMeters(polylineCoords);
  }, [polylineCoords]);

  const remainingDistanceMeters = useMemo(() => {
    if (routeDistanceMeters <= 0) {
      return 0;
    }

    return Math.max(routeDistanceMeters - totalDistanceMeters, 0);
  }, [routeDistanceMeters, totalDistanceMeters]);

  const progressRatio = useMemo(() => {
    if (routeDistanceMeters <= 0) {
      return 0;
    }

    return Math.min(totalDistanceMeters / routeDistanceMeters, 1);
  }, [routeDistanceMeters, totalDistanceMeters]);

  const motivationMessage = useMemo(() => {
    return getMotivationMessage(totalDistanceMeters);
  }, [totalDistanceMeters]);

  const sendMapPayloadToWebView = useCallback(() => {
    if (!webViewRef.current) {
      return;
    }

    const message = JSON.stringify({
      type: 'map-data',
      payload: mapPayload,
    });

    webViewRef.current.postMessage(message);
  }, [mapPayload]);

  useEffect(() => {
    sendMapPayloadToWebView();
  }, [sendMapPayloadToWebView]);

  useEffect(() => {
    if (!tracking) {
      return;
    }

    const milestone = Math.floor(totalDistanceMeters / 500);
    if (milestone > 0 && milestone > motivationMilestoneRef.current) {
      motivationMilestoneRef.current = milestone;
      Alert.alert('Keep Going', getMotivationMessage(totalDistanceMeters));
    }
  }, [totalDistanceMeters, tracking]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current) {
      clearLocationWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  const startTracking = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTotalDistanceMeters(0);
      previousPositionRef.current = null;
      motivationMilestoneRef.current = 0;
      const coords = await getCurrentCoordinates();
      updatePosition(coords);
      await buildRoadDirections(coords, true);
      const watchId = watchUserLocation((newCoords) => {
        updatePosition(newCoords);
        buildRoadDirections(newCoords).catch((routeError) => {
          console.warn('Failed to refresh road directions:', routeError);
        });
      }, (err) => {
        console.error('Tracking error:', err);
        setError(`Tracking stopped: ${err?.message ?? 'Unknown error'}`);
        setTracking(false);
      });
      if (watchId) {
        watchIdRef.current = watchId;
        setTracking(true);
      }
    } catch (err: unknown) {
      console.error('Start tracking error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to start location tracking');
      }
    } finally {
      setLoading(false);
    }
  }, [buildRoadDirections, updatePosition]);

  useEffect(() => {
    startTracking();
    return () => {
      stopTracking();
    };
  }, [startTracking, stopTracking]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Initializing live location tracking...</Text>
      </View>
    );
  }

  if (error && !tracking) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={startTracking}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CycleRoute Tracker</Text>
        <TouchableOpacity style={[styles.button, tracking && styles.buttonActive]} onPress={tracking ? stopTracking : startTracking}>
          <Text style={styles.buttonText}>{tracking ? 'Stop Live Tracking' : 'Start Live Tracking'}</Text>
        </TouchableOpacity>
      </View>
      <WebView
        ref={webViewRef}
        style={styles.map}
        source={{ html: LEAFLET_HTML }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={sendMapPayloadToWebView}
      />
      <Text style={styles.info}>
        {tracking ? 'Live tracking active - Road directions are shown from start to destination' : 'Press Start for live GPS tracking'}
      </Text>
      <View style={styles.dashboard}>
        <Text style={styles.dashboardTitle}>Ride Progress</Text>
        <Text style={styles.startPointText}>
          {startPoint
            ? `Your start point: ${startPoint.latitude.toFixed(5)}, ${startPoint.longitude.toFixed(5)}`
            : 'Your start point: waiting for GPS lock'}
        </Text>

        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${Math.max(progressRatio * 100, 2)}%` }]} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Covered</Text>
            <Text style={styles.statValue}>{formatDistance(totalDistanceMeters)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Remaining</Text>
            <Text style={styles.statValue}>{formatDistance(remainingDistanceMeters)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Route</Text>
            <Text style={styles.statValue}>{formatDistance(routeDistanceMeters)}</Text>
          </View>
        </View>

        <View style={styles.motivationCard}>
          <Text style={styles.motivationTitle}>Motivation</Text>
          <Text style={styles.motivationText}>{motivationMessage}</Text>
        </View>

        <View style={styles.statusList}>
          <Text style={styles.statusItem}>{startPoint ? 'Done: Start point locked' : 'Pending: Start point lock'}</Text>
          <Text style={styles.statusItem}>{polylineCoords.length > 1 ? 'Done: Road route loaded' : 'Pending: Building route'}</Text>
          <Text style={styles.statusItem}>{tracking ? 'Done: Live tracking active' : 'Pending: Tracking paused'}</Text>
          <Text style={styles.statusItem}>Live distance updates are running continuously.</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#f0f0f0' },
  title: { fontSize: 20, fontWeight: 'bold' },
  map: { flex: 1 },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonActive: { backgroundColor: '#FF3B30' },
  buttonText: { color: 'white', fontWeight: 'bold' },
  error: { color: 'red', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  info: { paddingHorizontal: 15, paddingTop: 12, textAlign: 'center', fontSize: 14, color: '#4b5563', backgroundColor: '#f9fafb' },
  dashboard: {
    paddingHorizontal: 15,
    paddingVertical: 14,
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  dashboardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  startPointText: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 10,
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563eb',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginTop: 2,
  },
  motivationCard: {
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  motivationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 2,
  },
  motivationText: {
    fontSize: 13,
    color: '#075985',
  },
  statusList: {
    gap: 4,
  },
  statusItem: {
    fontSize: 12,
    color: '#334155',
  },
});

export default MapsCycleScreen;

