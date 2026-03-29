import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import Paho from "paho-mqtt";
import { useEffect, useState } from "react";
import { View } from "react-native";

/*
I have no idea what Im doing I also didn't comment so lowk kinda cooked
*/

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

const loadStorage = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);

  const data: Record<string, Record<string, number | null> | { closestRoom: string | null; distance: number | null }> = {};
  pairs.forEach(([key, value]) => {
    if (value) {    
      data[key] = JSON.parse(value);
    }
  });

  for (const [id, rooms] of Object.entries(data)) {
    let closestRoom: string | null = null;
    let minDistance: number | null = null;

    if (typeof rooms === 'object' && 'closestRoom' in rooms) {
      continue;
    }

    for (const room of  Object.keys(rooms)) {
      const distance = (rooms as Record<string, number | null>)[room];
      if (distance !== null && (minDistance === null || distance < minDistance)) {
        minDistance = distance;
        closestRoom = room;
      }
    }

    if (closestRoom) {
      data[id] = { closestRoom, distance: minDistance };
    } else {
      data[id] = { closestRoom: null, distance: null };
    }
  }

  console.log(data);
  return JSON.stringify(data, null, 2);
};

export default function Index() {
  const [data, setData] = useState("Waiting for data...");
  const [status, setStatus] = useState("Disconnected");
  
  useEffect(() => {
    clearAppStorage();
    console.log("Connecting to MQTT broker...");
    const client = new Paho.Client("10.0.0.250", 9001, `client-${Date.now()}`);
    client.onConnectionLost = onConnectionLost;
    
    /*
    very impt but im too lazy to explain it
    */
    client.onMessageArrived = async (message: any) => {
      try {
        const parsed = JSON.parse(message.payloadString);
        const distance = parseFloat(parsed.distance);
        const room = message.destinationName.split("/").at(-1);
        if (parsed.id.includes("known:")) {
          const id = parsed.id.split(":")[1];
          const current = await AsyncStorage.getItem(id);
          if(current){
            var values = JSON.parse(current);
            values[room] = distance;
            await AsyncStorage.setItem(id, JSON.stringify(values));
          } else {
            const values: Record<string, number | null> = {
              "room_1": null, "room_2": null, "room_3": null
            };            
            values[room] = distance;
            await AsyncStorage.setItem(id, JSON.stringify(values));
          }
          /*
          if(current != null){
            if(distance < parseFloat(current.split(",")[1])) {
              await AsyncStorage.setItem(id, [room, distance].join(","));
            }
          } else {
            await AsyncStorage.setItem(id, [room, distance].join(","));
          }
            */
          // console.log(current, [parsed,distance].join(","));
          setData(await loadStorage());
        }
      } catch {
        
      }
      
    };

    client.connect({
      onSuccess: () => {
        setStatus("Connected to MQTT broker");
        console.log("Connected to MQTT broker");
        client.subscribe("espresense/#", {
          qos: 0,
          onSuccess: () => {
            console.log("Subscribed to espresense/#");
            setStatus("Subscribed to espresense/#");
          },
          onFailure: (err: any) => {
            console.log("Subscribe failed:", err);
            setStatus("Subscribe failed");
          },
        });
      },
      onFailure: (error) => {
        setStatus("Failed to connect to MQTT broker");
        console.error("Failed to connect to MQTT broker", error);
      }
    });
  }, []);
  

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "flex-start",
        alignItems: "center",
      }}
    > 
      <b>Malware</b> 
      <p>Status: {status}</p>
      <p>Data: {data}</p>
      <Image
        style={{
          flex: 1,
          width: '100%',
          backgroundColor: '#0553'
        }}
        source={require("../assets/floor1.png")}
        placeholder={{ blurhash }}
        contentFit="cover"
        transition={1000}
      />
    </View>
  );
}
