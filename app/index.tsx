import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import Paho from "paho-mqtt";
import { useEffect, useState } from "react";
import { View } from "react-native";

/*
I have no idea what Im doing I also didn't comment so lowk kinda cooked
*/

const blurhash = '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';
const rooms = ["room_1", "room_2", "room_3", "room_4", "room_5"];


function onConnectionLost(responseObject: any) {
  if (responseObject.errorCode !== 0) {
    console.log("onConnectionLost:" + responseObject.errorMessage);
  }
}

async function getDataFromRoom(room: string) {
  const value = await AsyncStorage.getItem(room);
  console.log(`Data for ${room}:`, value);
  return value;
}

export default function Index() {
  const [data, setData] = useState("Waiting for data...");
  const [status, setStatus] = useState("Disconnected");
  
  useEffect(() => {
    console.log("Connecting to MQTT broker...");
    const client = new Paho.Client("172.20.10.2", 9001, `client-${Date.now()}`);
    client.onConnectionLost = onConnectionLost;
    
    /*
    very impt but im too lazy to explain it
    */
    client.onMessageArrived = async (message: any) => {
      console.log("Topic:", message.destinationName);
      console.log("Payload:", message.payloadString);
      const payload = JSON.parse(message.payloadString)["known"];
      const room = message.destinationName.split("/")[-1];
      await AsyncStorage.setItem(room, payload);
      setData("");
      for (const r of rooms) {
        setData(`${data}${r}: ${await getDataFromRoom(r)},`);
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
