import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';

type LatLng = { latitude: number; longitude: number };

type AEDLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
  address?: string;
};

const FALLBACK_LOCATION: LatLng = {
  latitude: 53.3498,
  longitude: -6.2603, // Dublin city centre
};

// 🔁 Replace this with your real backend endpoint
const AED_API_URL = 'https://example.com/api/aeds'; // <-- CHANGE ME

// Haversine distance in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// assume ~5 km/h walking speed
function estimateWalkingTimeMinutes(meters: number) {
  const metersPerMinute = 5000 / 60; // ≈ 83.3 m/min
  return Math.round(meters / metersPerMinute);
}

export default function HomeScreen() {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [aedLocations, setAedLocations] = useState<AEDLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const [adminMode, setAdminMode] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [newAedName, setNewAedName] = useState('');
  const [newAedDescription, setNewAedDescription] = useState('');

  const [hasShownNearbyAlert, setHasShownNearbyAlert] = useState(false);

  // 1️⃣ Get current location (with safe fallback)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          Alert.alert(
            'Permission denied',
            'We need your location to find nearby AEDs. Using a default location instead.'
          );
          setUserLocation(FALLBACK_LOCATION);
          setRegion({
            latitude: FALLBACK_LOCATION.latitude,
            longitude: FALLBACK_LOCATION.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
          return;
        }

        try {
          const location = await Location.getCurrentPositionAsync({});
          const current: LatLng = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setUserLocation(current);
          setRegion({
            latitude: current.latitude,
            longitude: current.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        } catch (error) {
          Alert.alert(
            'Location unavailable',
            'Using a default location for now (Dublin city centre).'
          );
          setUserLocation(FALLBACK_LOCATION);
          setRegion({
            latitude: FALLBACK_LOCATION.latitude,
            longitude: FALLBACK_LOCATION.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }
      } catch (e) {
        Alert.alert(
          'Error',
          'Something went wrong while accessing your location. Using a default location.'
        );
        setUserLocation(FALLBACK_LOCATION);
        setRegion({
          latitude: FALLBACK_LOCATION.latitude,
          longitude: FALLBACK_LOCATION.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 2️⃣ Fetch AEDs from backend (instead of static array)
  useEffect(() => {
    const fetchAeds = async () => {
      try {
        // Expecting API to return: [{ id, name, latitude, longitude, description, address }, ...]
        const response = await fetch(AED_API_URL);
        if (!response.ok) {
          throw new Error('Failed to load AED data');
        }
        const data: AEDLocation[] = await response.json();

        // Basic validation
        const cleaned = data.filter(
          (aed) =>
            typeof aed.latitude === 'number' &&
            typeof aed.longitude === 'number' &&
            !!aed.name
        );

        setAedLocations(cleaned);
      } catch (err) {
        console.warn('Error loading AEDs, using fallback sample data:', err);
        // Fallback: some sample AEDs in Dublin if API fails
        const fallback: AEDLocation[] = [
          {
            id: '1',
            name: 'Sample AED 1',
            latitude: 53.3498,
            longitude: -6.2603,
            description: 'Fallback city centre AED',
          },
          {
            id: '2',
            name: 'Sample AED 2',
            latitude: 53.3478,
            longitude: -6.259,
            description: 'Fallback nearby street',
          },
        ];
        setAedLocations(fallback);
      }
    };

    fetchAeds();
  }, []);

  // 3️⃣ Compute nearest AED
  const nearestAED = useMemo(() => {
    if (!userLocation || aedLocations.length === 0) return null;

    let nearest: AEDLocation | null = null;
    let closestDistance = Infinity;

    for (const aed of aedLocations) {
      const distance = getDistanceMeters(
        userLocation.latitude,
        userLocation.longitude,
        aed.latitude,
        aed.longitude
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        nearest = aed;
      }
    }

    if (!nearest) return null;

    const distanceMeters = getDistanceMeters(
      userLocation.latitude,
      userLocation.longitude,
      nearest.latitude,
      nearest.longitude
    );
    const minutes = estimateWalkingTimeMinutes(distanceMeters);

    return {
      ...nearest,
      distanceMeters,
      formattedDistance: formatDistance(distanceMeters),
      walkingMinutes: minutes,
    };
  }, [userLocation, aedLocations]);

  // 4️⃣ Alert if an AED is nearby (simple "notification")
  useEffect(() => {
    if (!userLocation || !nearestAED || hasShownNearbyAlert) return;

    if (nearestAED.distanceMeters < 200) {
      Alert.alert(
        'AED Nearby',
        `There is an AED (${nearestAED.name}) less than 200m from you.`
      );
      setHasShownNearbyAlert(true);
    }
  }, [userLocation, nearestAED, hasShownNearbyAlert]);

  // 5️⃣ Emergency call button
  const handleEmergencyCall = () => {
    const phoneNumber = Platform.select({
      ios: 'tel://112',
      android: 'tel:112',
    });
    if (!phoneNumber) return;

    Linking.openURL(phoneNumber).catch(() => {
      Alert.alert('Error', 'Unable to open phone dialer.');
    });
  };

  // 6️⃣ Search function (address / town / place)
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    try {
      const results = await Location.geocodeAsync(searchQuery.trim());
      if (!results || results.length === 0) {
        Alert.alert('Not found', 'Could not find that location.');
        return;
      }
      const first = results[0];
      const newRegion: Region = {
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      setRegion(newRegion);
    } catch (e) {
      Alert.alert('Error', 'There was a problem searching for that location.');
    } finally {
      setSearchLoading(false);
    }
  };

  // 7️⃣ Open external maps app with directions from user → AED
  const openDirectionsToAed = (aed: AEDLocation) => {
    if (!userLocation) {
      Alert.alert('Location unknown', 'Your current location is not available yet.');
      return;
    }

    const { latitude: latFrom, longitude: lonFrom } = userLocation;
    const { latitude: latTo, longitude: lonTo } = aed;

    const url = Platform.select({
      ios: `http://maps.apple.com/?saddr=${latFrom},${lonFrom}&daddr=${latTo},${lonTo}`,
      android: `https://www.google.com/maps/dir/?api=1&origin=${latFrom},${lonFrom}&destination=${latTo},${lonTo}`,
    });

    if (!url) return;

    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Unable to open maps for directions.');
    });
  };

  // 🔐 Simple admin access (demo only)
  const ADMIN_PIN = '1234';

  const handleAdminLogin = () => {
    if (adminMode) {
      setAdminMode(false);
      return;
    }

    if (adminPin === ADMIN_PIN) {
      setAdminMode(true);
      Alert.alert('Admin mode', 'Admin mode enabled.');
    } else {
      Alert.alert('Incorrect PIN', 'The PIN you entered is not correct.');
    }
  };

  const handleAddAED = () => {
    if (!region) {
      Alert.alert('No region', 'Move the map to where you want to place the AED.');
      return;
    }
    if (!newAedName.trim()) {
      Alert.alert('Missing name', 'Please enter a name for the AED.');
      return;
    }

    const newAED: AEDLocation = {
      id: Date.now().toString(),
      name: newAedName.trim(),
      latitude: region.latitude,
      longitude: region.longitude,
      description: newAedDescription.trim() || undefined,
    };

    // In a real app you would POST this to your backend here
    setAedLocations((prev) => [...prev, newAED]);
    setNewAedName('');
    setNewAedDescription('');
    Alert.alert('AED added', 'The AED has been added locally (demo only).');
  };

  if (loading || !region) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top area: Search + Nearest AED info + Emergency call */}
      <View style={styles.topPanel}>
        {/* 🔎 Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search address, town, place…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={searchLoading}
          >
            <Text style={styles.searchButtonText}>
              {searchLoading ? '...' : 'Search'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 🔍 Nearest AED info */}
        {nearestAED && (
          <View style={styles.nearestCard}>
            <Text style={styles.nearestTitle}>Nearest AED</Text>
            <Text style={styles.nearestName}>{nearestAED.name}</Text>
            <Text style={styles.nearestMeta}>
              Distance: {nearestAED.formattedDistance} · ~{nearestAED.walkingMinutes} min walk
            </Text>
            {nearestAED.address && (
              <Text style={styles.nearestMeta}>Address: {nearestAED.address}</Text>
            )}
            {nearestAED.description && (
              <Text style={styles.nearestMeta}>Info: {nearestAED.description}</Text>
            )}
            <TouchableOpacity
              style={styles.nearestDirectionsButton}
              onPress={() => openDirectionsToAed(nearestAED)}
            >
              <Text style={styles.nearestDirectionsText}>Get Directions</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 📞 Emergency call */}
        <TouchableOpacity style={styles.emergencyButton} onPress={handleEmergencyCall}>
          <Text style={styles.emergencyText}>📞 Call 112 (Emergency)</Text>
        </TouchableOpacity>
      </View>

      {/* 🗺️ Map */}
      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation={true}
      >
        {/* AED markers from backend */}
        {aedLocations.map((aed) => (
          <Marker
            key={aed.id}
            coordinate={{ latitude: aed.latitude, longitude: aed.longitude }}
            title={aed.name}
            description={aed.description ?? aed.address ?? 'AED location'}
            onPress={() => openDirectionsToAed(aed)}
          />
        ))}
      </MapView>

      {/* 🔐 Admin panel (local demo) */}
      <View style={styles.adminPanel}>
        <View style={styles.adminRow}>
          <TextInput
            style={[styles.adminInput, { flex: 1 }]}
            placeholder="Admin PIN"
            secureTextEntry
            value={adminPin}
            onChangeText={setAdminPin}
          />
          <TouchableOpacity style={styles.adminButton} onPress={handleAdminLogin}>
            <Text style={styles.adminButtonText}>{adminMode ? 'Logout' : 'Admin'}</Text>
          </TouchableOpacity>
        </View>

        {adminMode && (
          <View style={styles.adminAddContainer}>
            <Text style={styles.adminLabel}>Add AED at map center</Text>
            <TextInput
              style={styles.adminInput}
              placeholder="AED name"
              value={newAedName}
              onChangeText={setNewAedName}
            />
            <TextInput
              style={styles.adminInput}
              placeholder="Description (optional)"
              value={newAedDescription}
              onChangeText={setNewAedDescription}
            />
            <TouchableOpacity style={styles.adminAddButton} onPress={handleAddAED}>
              <Text style={styles.adminAddButtonText}>Add AED</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { justifyContent: 'center', alignItems: 'center' },

  topPanel: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: 'white',
    elevation: 3,
    zIndex: 10,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: 'white',
    fontWeight: '600',
  },

  nearestCard: {
    backgroundColor: '#E6F4FE',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  nearestTitle: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#1f2933',
  },
  nearestName: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 2,
  },
  nearestMeta: {
    fontSize: 12,
    color: '#4b5563',
  },
  nearestDirectionsButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  nearestDirectionsText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },

  emergencyButton: {
    backgroundColor: '#dc2626',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  emergencyText: {
    color: 'white',
    fontWeight: '700',
  },

  map: {
    flex: 1,
  },

  adminPanel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  adminRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  adminInput: {
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  adminButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  adminButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  adminAddContainer: {
    marginTop: 4,
  },
  adminLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  adminAddButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  adminAddButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});