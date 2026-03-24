import { Image } from 'expo-image';
import Paho from "paho-mqtt";
import { useEffect, useState } from "react";
import { View } from "react-native";

function onConnectionLost(responseObject: any) {
  if (responseObject.errorCode !== 0) {
    console.log("onConnectionLost:" + responseObject.errorMessage);
  }
}

const blurhash = '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';


export default function Index() {
  const [data, setData] = useState("Waiting for data...");
  const [status, setStatus] = useState("Disconnected");
  
  useEffect(() => {
    console.log("Connecting to MQTT broker...");
    const client = new Paho.Client("172.20.10.2", 9001, `client-${Date.now()}`);
    client.onConnectionLost = onConnectionLost;
    
    client.onMessageArrived = (message: any) => {
      console.log("Topic:", message.destinationName);
      console.log("Payload:", message.payloadString);
      setData(`${message.destinationName}: ${message.payloadString}`);
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
