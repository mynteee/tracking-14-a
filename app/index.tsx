import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import Paho from "paho-mqtt";
import { useEffect, useState } from "react";
import {
  Button,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

const blurhash = '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';
const ALIAS_STORAGE_KEY = '@tracker_aliases';

// --- Utility: Test Data Generator ---
const getTestData = () => ({
  "e2342354": {
    "closestRoom": "room_1",
    "distance": 1.1,
    "distances": { "room_1": 1.1 }
  },
  "f2354938dd": {
    "closestRoom": "room_2",
    "distance": 0.9,
    "distances": { "room_2": 0.9 }
  }
});

export default function Index() {
  const [sidebarData, setSidebarData] = useState<Record<string, any>>(getTestData());
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Disconnected");
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  // 1. Load Custom Names from Storage
  useEffect(() => {
    const loadAliases = async () => {
      const stored = await AsyncStorage.getItem(ALIAS_STORAGE_KEY);
      if (stored) setNameMap(JSON.parse(stored));
    };
    loadAliases();
  }, []);

  // 2. Handle Saving a New Name
  const saveNewName = async () => {
    if (!editingId) return;
    const updatedMap = { ...nameMap, [editingId]: tempName };
    setNameMap(updatedMap);
    await AsyncStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(updatedMap));
    setEditingId(null);
  };

  // 3. MQTT Logic
  useEffect(() => {
    const client = new Paho.Client("10.0.0.250", 9001, `client-${Date.now()}`);
    
    client.onMessageArrived = async (message: any) => {
      try {
        const parsed = JSON.parse(message.payloadString);
        const distance = parseFloat(parsed.distance);
        const room = message.destinationName.split("/").at(-1);

        if (parsed.id.includes("known:")) {
          const id = parsed.id.split(":")[1];
          
          setSidebarData(prev => {
            const currentDevice = prev[id] || { distances: {} };
            const updatedDistances = { ...currentDevice.distances, [room]: distance };
            
            // Calculate closest room logic
            let closestRoom = null;
            let minDistance = Infinity;
            for (const [r, d] of Object.entries(updatedDistances)) {
              if (d !== null && (d as number) < minDistance) {
                minDistance = d as number;
                closestRoom = r;
              }
            }

            return {
              ...prev,
              [id]: {
                distances: updatedDistances,
                closestRoom,
                distance: minDistance === Infinity ? null : minDistance
              }
            };
          });
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

    return () => { if (client.isConnected()) client.disconnect(); };
  }, []);

  return (
    <View style={styles.container}>
      <Image style={styles.map} source={require("../assets/floor1.png")} placeholder={{ blurhash }} contentFit="cover" />

      <View style={styles.sidebar}>
        <Text style={styles.title}>Devices</Text>
        <Text style={[styles.status, { color: status === "Connected" ? "#4CAF50" : "#F44336" }]}>{status}</Text>
        
        <ScrollView showsVerticalScrollIndicator={false}>
          {Object.entries(sidebarData).map(([id, info]) => (
            <TouchableOpacity 
              key={id} 
              style={styles.card}
              onLongPress={() => {
                setEditingId(id);
                setTempName(nameMap[id] || id);
              }}
            >
              <Text style={styles.deviceId}>{nameMap[id] || id}</Text>
              <Text style={styles.roomText}>
                📍 {info.closestRoom || "Searching..."} 
                {info.distance ? ` • ${info.distance.toFixed(2)}m` : ""}
              </Text>
              <Text style={styles.idSubtitle}>ID: {id}</Text>
              <Text style={styles.hint}>Hold to rename</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Rename Modal */}
      <Modal visible={!!editingId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rename Tracker</Text>
            <TextInput 
              style={styles.input}
              value={tempName}
              onChangeText={setTempName}
              autoFocus
              placeholder="Enter friendly name"
              placeholderTextColor="#999"
            />
            <View style={styles.modalButtons}>
              <View style={{ flex: 1, marginRight: 5 }}>
                <Button title="Cancel" color="#666" onPress={() => setEditingId(null)} />
              </View>
              <View style={{ flex: 1, marginLeft: 5 }}>
                <Button title="Save" onPress={saveNewName} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row' },
  map: { ...StyleSheet.absoluteFillObject, zIndex: -1 },
  sidebar: {
    width: 280,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingTop: 60,
    paddingHorizontal: 15,
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  status: { fontSize: 11, fontWeight: '700', marginBottom: 20, letterSpacing: 1 },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  deviceId: { fontSize: 16, fontWeight: '700', color: '#2c3e50' },
  idSubtitle: { fontSize: 10, color: '#bdc3c7', marginTop: 4 },
  hint: { fontSize: 9, color: '#d1d1d1', marginTop: 8, fontStyle: 'italic' },
  roomText: { color: '#7f8c8d', fontSize: 13, marginTop: 5 },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalContent: { 
    width: 300, 
    backgroundColor: 'white', 
    padding: 20, 
    borderRadius: 20,
    elevation: 10 
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  input: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    padding: 12, 
    marginBottom: 20,
    color: '#000'
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' }
});