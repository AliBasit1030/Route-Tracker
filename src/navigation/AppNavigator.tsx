import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MapsCycleScreen from '../screens/MapsCycleScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="MapsCycle" screenOptions={{ headerShown: false }}>
<Stack.Screen name="MapsCycle" component={MapsCycleScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;

