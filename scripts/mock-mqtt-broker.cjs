const http = require("http");
const websocketStream = require("websocket-stream");

const HTTP_PORT = Number(process.env.MOCK_MQTT_PORT ?? 9001);
const MQTT_PATH = process.env.MOCK_MQTT_PATH ?? "/mqtt";
const PUBLISH_INTERVAL_MS = Number(process.env.MOCK_MQTT_INTERVAL_MS ?? 2000);

const sampleMessages = [
  {
    payload: {
      mac: "eeede852bd0b",
      id: "known:eeede852bd0b",
      "rssi@1m": -71,
      rssi: -37.1,
      rxAdj: 0,
      rssiVar: 7.32,
      distance: 0.06,
      var: 0,
      close: true,
      int: 1101,
    },
    topic: "espresense/devices/known:eeede852bd0b/room_1",
  },
  {
    payload: {
      mac: "d8a07885c1d",
      id: "d8a07885c1d",
      "rssi@1m": -65,
      rssi: -48.33,
      rxAdj: 0,
      rssiVar: 0,
      distance: 4.22,
      var: 0.24,
      int: 3002,
    },
    topic: "espresense/devices/d8a07885c1d/room_1",
  },
  {
    payload: {
      mac: "f9f0e964a753e",
      id: "f9f0e964a753e",
      "rssi@1m": -65,
      rssi: -72.5,
      rxAdj: 0,
      rssiVar: 6.75,
      distance: 1.9,
      var: 0.19,
      int: 3509,
    },
    topic: "espresense/devices/f9f0e964a753e/room_1",
  },
  {
    payload: {
      mac: "e7b2ab1200c1",
      id: "known:e7b2ab1200c1",
      "rssi@1m": -69,
      rssi: -44.2,
      rxAdj: 0,
      rssiVar: 3.14,
      distance: 0.42,
      var: 0.03,
      close: true,
      int: 1244,
    },
    topic: "espresense/devices/known:e7b2ab1200c1/room_2",
  },
  {
    payload: {
      mac: "c1a5ff023991",
      id: "c1a5ff023991",
      "rssi@1m": -66,
      rssi: -58.4,
      rxAdj: 0,
      rssiVar: 2.67,
      distance: 2.18,
      var: 0.11,
      int: 2560,
    },
    topic: "espresense/devices/c1a5ff023991/room_3",
  },
  {
    payload: {
      mac: "a4f91cb88310",
      id: "known:a4f91cb88310",
      "rssi@1m": -70,
      rssi: -46.8,
      rxAdj: 0,
      rssiVar: 4.89,
      distance: 0.88,
      var: 0.08,
      close: true,
      int: 1430,
    },
    topic: "espresense/devices/known:a4f91cb88310/room_4",
  },
];

const telemetryMessages = [
  {
    payload: {
      ip: "10.0.0.116",
      uptime: 30,
      firm: "esp32",
      rssi: -32,
      ver: "v4.0.6",
      adverts: 346,
      seen: 319,
      reported: 72,
      freeHeap: 91284,
      maxHeap: 63476,
    },
    topic: "espresense/rooms/room_1/telemetry",
  },
  {
    payload: {
      ip: "10.0.0.117",
      uptime: 41,
      firm: "esp32",
      rssi: -38,
      ver: "v4.0.6",
      adverts: 402,
      seen: 355,
      reported: 88,
      freeHeap: 90112,
      maxHeap: 62140,
    },
    topic: "espresense/rooms/room_2/telemetry",
  },
  {
    payload: {
      ip: "10.0.0.118",
      uptime: 25,
      firm: "esp32",
      rssi: -41,
      ver: "v4.0.6",
      adverts: 287,
      seen: 250,
      reported: 59,
      freeHeap: 89540,
      maxHeap: 61792,
    },
    topic: "espresense/rooms/room_3/telemetry",
  },
  {
    payload: {
      ip: "10.0.0.119",
      uptime: 56,
      firm: "esp32",
      rssi: -35,
      ver: "v4.0.6",
      adverts: 440,
      seen: 401,
      reported: 93,
      freeHeap: 92364,
      maxHeap: 64012,
    },
    topic: "espresense/rooms/room_4/telemetry",
  },
];

async function main() {
  const { Aedes } = await import("aedes");
  const broker = await Aedes.createBroker();

  const server = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("Mock MQTT broker is running.\n");
  });

  const wsServer = websocketStream.createServer(
    {
      server,
      path: MQTT_PATH,
    },
    broker.handle,
  );

  wsServer.on("connection", () => {
    console.log(`[mock-mqtt] websocket client connected on ${MQTT_PATH}`);
  });

  broker.on("client", (client) => {
    console.log(`[mock-mqtt] mqtt client connected: ${client?.id ?? "unknown"}`);
  });

  broker.on("subscribe", (subscriptions, client) => {
    const topics = subscriptions
      .map((subscription) => subscription.topic)
      .join(", ");
    console.log(
      `[mock-mqtt] subscription from ${client?.id ?? "unknown"}: ${topics}`,
    );
  });

  broker.on("publish", (packet, client) => {
    if (!client) {
      return;
    }

    console.log(
      `[mock-mqtt] received from ${client.id}: ${packet.topic} ${packet.payload.toString()}`,
    );
  });

  server.listen(HTTP_PORT, () => {
    console.log(
      `[mock-mqtt] broker ready at ws://localhost:${HTTP_PORT}${MQTT_PATH}`,
    );
    console.log(
      `[mock-mqtt] publishing sample ESPresense topics every ${PUBLISH_INTERVAL_MS}ms`,
    );
  });

  let index = 0;
  setInterval(() => {
    const message = sampleMessages[index % sampleMessages.length];
    const telemetry = telemetryMessages[index % telemetryMessages.length];
    index += 1;

    const payloadString = JSON.stringify(message.payload);
    const telemetryPayloadString = JSON.stringify(telemetry.payload);
    broker.publish(
      {
        payload: payloadString,
        qos: 0,
        retain: false,
        topic: message.topic,
      },
      (error) => {
        if (error) {
          console.error("[mock-mqtt] publish failed", error);
          return;
        }

        console.log(`[mock-mqtt] published ${message.topic} ${payloadString}`);
      },
    );

    broker.publish(
      {
        payload: telemetryPayloadString,
        qos: 0,
        retain: false,
        topic: telemetry.topic,
      },
      (error) => {
        if (error) {
          console.error("[mock-mqtt] telemetry publish failed", error);
          return;
        }

        console.log(
          `[mock-mqtt] published ${telemetry.topic} ${telemetryPayloadString}`,
        );
      },
    );
  }, PUBLISH_INTERVAL_MS);
}

main().catch((error) => {
  console.error("[mock-mqtt] startup failed", error);
  process.exit(1);
});
