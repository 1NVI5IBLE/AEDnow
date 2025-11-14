import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { View, Alert, StyleSheet } from 'react-native';


const AED_SAMPLE_LOCATIONS = [
  { id: 1, name: 'AED 1', latitude: 53.3498, longitude: -6.2603 },
  { id: 2, name: 'AED 2', latitude: 53.3478, longitude: -6.2590},
  { id: 3, name: 'AED 3', latitude: 53.3505, longitude: -6.2620 },
];




function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {{
  const R = 6371e3;
  const toRad = (value: number) => value * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = 
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}}




export default function HomeScreen() {
  const [userLocation, setUserLocation] = useState<{
  latitude: number;
  longitude: number;
} | null>(null);




  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission denied", "We need your location to find nearby AEDs.");
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    })();
  }, []);




  if (!userLocation) {
    return <View style={styles.container}><></></View>;
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker
          coordinate={userLocation}
          title="You are here"
        />

        <Marker
          coordinate={{ latitude: 53.3498, longitude: -6.2603 }}
          title="Sample AED"
          description="This is the nearest AED."
        />
      </MapView>
    </View>
  );
}




const styles = StyleSheet.create({
  container: { flex: 1 },
  map: {
    width: '100%',
    height: '100%',
  },
});
