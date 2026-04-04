const DEFAULT_TOPIC = "espresense/devices/#";

function normalizeTopicFilter(value: string | undefined) {
  const normalized = value?.trim().replace(/^['"]|['"]$/g, "");

  if (!normalized) {
    return DEFAULT_TOPIC;
  }

  // Unquoted `#` is treated as a comment by dotenv, which leaves the topic
  // prefix ending in `/`. Repair that common case so web subscriptions still work.
  if (!normalized.includes("#") && !normalized.includes("+") && normalized.endsWith("/")) {
    return `${normalized}#`;
  }

  return normalized;
}

export const mqttConfig = {
  brokerHost: process.env.EXPO_PUBLIC_MQTT_HOST ?? "10.0.0.250",
  brokerPath: process.env.EXPO_PUBLIC_MQTT_PATH ?? "",
  brokerPort: Number(process.env.EXPO_PUBLIC_MQTT_PORT ?? "9001"),
  keepAliveSeconds: Number(process.env.EXPO_PUBLIC_MQTT_KEEPALIVE ?? "60"),
  telemetryTopic: process.env.EXPO_PUBLIC_MQTT_TELEMETRY_TOPIC ?? "espresense/rooms/+/telemetry",
  topic: normalizeTopicFilter(process.env.EXPO_PUBLIC_MQTT_TOPIC),
  useSsl: process.env.EXPO_PUBLIC_MQTT_USE_SSL === "true",
};

export function formatBrokerAddress() {
  const protocol = mqttConfig.useSsl ? "wss" : "ws";
  return `${protocol}://${mqttConfig.brokerHost}:${mqttConfig.brokerPort}${mqttConfig.brokerPath}`;
}
