import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import Paho from "paho-mqtt";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const blurhash = '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';
const rooms = ["room_1", "room_2", "room_3"];


function onConnectionLost(responseObject: any) {
  if (responseObject.errorCode !== 0) {
    console.log("onConnectionLost:" + responseObject.errorMessage);
  }
}

const clearAppStorage = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys);
    console.log('App-specific storage successfully cleared!');
  } catch (e) {
    console.error('Error clearing app storage:', e);
  }
};

const testData = () => {
  return JSON.stringify({
    "e2342354": {
      "closestRoom": "room_1",
      "distance": 1.12,
      "alias": "tracker"+ Math.floor(Math.random() * 1000)
    },
    "f2354938dd": {
      "closestRoom": "room_2",
      "distance": 0.9,
      "alias": "tracker"+ Math.floor(Math.random() * 1000)
    }
  }, null, 2);
}

const loadStorageSorted = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);

  const data: Record<string, { closestRoom: string | null; distance: number | null; alias: string | null }> = {};
  
  pairs.forEach(([key, value]) => {
    if (!value) return;

    const parsed: Record<string, number | string | null> = JSON.parse(value);
    const alias = parsed.alias as string | null;

    let closestRoom: string | null = null;
    let minDistance: number | null = null;

    for (const [room, dist] of Object.entries(parsed)) {
      if (room === 'alias') continue; // skip the alias key
      const distance = dist as number | null;
      if (distance !== null && (minDistance === null || distance < minDistance)) {
        minDistance = distance;
        closestRoom = room;
      }
    }

    data[key] = { closestRoom, distance: minDistance, alias };
  });

  return data; // Return JSON data
};

export default function Index() {
  const [sidebarData, setSidebarData] = useState<Record<string, any>>({});
  const [status, setStatus] = useState("Disconnected");

  useEffect(() => {
    // 1. Initialize with Test Data immediately
    setSidebarData(JSON.parse(testData()));

    clearAppStorage();
    
    // 2. Setup MQTT logic
    const client = new Paho.Client("10.0.0.250", 9001, `client-${Date.now()}`);
    
    client.onMessageArrived = async (message: any) => {
      try {
        const parsed = JSON.parse(message.payloadString);
        const distance = parseFloat(parsed.distance);
        const room = message.destinationName.split("/").at(-1);

        if (parsed.id.includes("known:")) {
          const id = parsed.id.split(":")[1];
          const current = await AsyncStorage.getItem(id);
          let values = current ? JSON.parse(current) : { "room_1": null, "room_2": null, "room_3": null, alias: `tracker-${Math.floor(Math.random() * 1000)}` };
          
          values[room] = distance;
          await AsyncStorage.setItem(id, JSON.stringify(values));
          
          // Overwrite test data with real live data as it comes in
          const sorted = await loadStorageSorted();
          setSidebarData(sorted);
        }
      } catch (e) {
        console.error("MQTT Error:", e);
      }
    };

    client.connect({
      onSuccess: () => {
        setStatus("Connected");
        client.subscribe("espresense/#");
      },
      onFailure: () => setStatus("Failed to connect")
    });

    return () => {
      if (client.isConnected()) client.disconnect();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Image
        style={styles.map}
        source={require("../assets/floor1.png")}
        placeholder={{ blurhash }}
        contentFit="cover"
      />

      <View style={styles.sidebar}>
        <Text style={styles.title}>Device Locations</Text>
        <Text style={[styles.status, { color: status === "Connected" ? "green" : "red" }]}>
          {status}
        </Text>
        
        <ScrollView showsVerticalScrollIndicator={false}>
          {Object.entries(sidebarData).map(([id, info]) => (
            <View key={id} style={styles.card}>
              {/* Added Alias display since your test data includes it */}
              <Text style={styles.deviceId}>{info.alias || id}</Text>
              <Text style={styles.roomText}>
                📍 {info.closestRoom || "Searching..."} 
                {info.distance ? ` • ${info.distance.toFixed(2)}m` : ""}
              </Text>
              {info.alias && <Text style={{fontSize: 10, color: '#aaa'}}>ID: {id}</Text>}
            </View>
          ))}
          
          {Object.keys(sidebarData).length === 0 && (
            <Text style={{ textAlign: 'center', marginTop: 20, color: '#999' }}>
              No devices detected...
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  sidebar: {
    width: 260,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingTop: 60,
    paddingHorizontal: 20,
    borderRightWidth: 1,
    borderRightColor: '#ddd',
    height: '100%',
    // Glassmorphism effect for Web/iOS
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 5,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 25,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 3, // Android shadow
  },
  deviceId: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  roomText: {
    color: '#666',
    fontSize: 13,
    marginTop: 6,
    fontWeight: '500',
  }
});