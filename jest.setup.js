/* eslint-env jest */

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');

  return {
    GestureHandlerRootView: View,
    State: {},
    PanGestureHandler: View,
    TapGestureHandler: View,
    LongPressGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    NativeViewGestureHandler: View,
    Directions: {},
  };
});

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  const MockMapView = ({ children, ...props }) => React.createElement(View, props, children);
  const MockMarker = ({ children, ...props }) => React.createElement(View, props, children);
  const MockPolyline = ({ children, ...props }) => React.createElement(View, props, children);
  const MockPolygon = ({ children, ...props }) => React.createElement(View, props, children);

  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Polyline: MockPolyline,
    Polygon: MockPolygon,
    PROVIDER_GOOGLE: 'google',
  };
});

jest.mock('@react-native-community/geolocation', () => ({
  requestAuthorization: jest.fn(() => Promise.resolve('granted')),
  getCurrentPosition: jest.fn((success) => {
    success({
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
      },
    });
  }),
  watchPosition: jest.fn((success) => {
    success({
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
      },
    });
    return 1;
  }),
  clearWatch: jest.fn(),
}));
