import Paho from "paho-mqtt";
import { useEffect, useMemo, useRef, useState } from "react";

import { floorMaps } from "../config/floorMaps";
import { formatBrokerAddress, mqttConfig } from "../config/mqttConfig";
import { parseRoomTelemetryUpdate, parseTrackingUpdates } from "../lib/trackingParser";
import type { DeviceLocation, RoomTelemetry } from "../types/tracking";

type DeviceObservationMap = Record<string, Record<string, DeviceLocation>>;
type RoomTelemetryMap = Record<string, RoomTelemetry>;

const COORDINATE_OBSERVATION_KEY = "__coordinates__";
const UNMAPPED_OBSERVATION_KEY = "__unmapped__";
const OBSERVATION_TTL_MS = 30_000;

function observationKey(location: DeviceLocation) {
  if (location.source === "coordinates") {
    return COORDINATE_OBSERVATION_KEY;
  }

  return location.anchorId ?? UNMAPPED_OBSERVATION_KEY;
}

function chooseBestLocation(locations: DeviceLocation[]) {
  if (locations.length === 0) {
    return null;
  }

  const freshLocations = locations.filter(
    (location) => Date.now() - location.updatedAt <= OBSERVATION_TTL_MS,
  );
  const candidates = freshLocations.length > 0 ? freshLocations : locations;

  const coordinateLocation = candidates.find(
    (location) => location.source === "coordinates",
  );
  if (coordinateLocation) {
    return coordinateLocation;
  }

  return [...candidates].sort((left, right) => {
    if (left.floorId && !right.floorId) {
      return -1;
    }

    if (!left.floorId && right.floorId) {
      return 1;
    }

    if (left.distanceMeters !== null && right.distanceMeters !== null) {
      return left.distanceMeters - right.distanceMeters;
    }

    return right.updatedAt - left.updatedAt;
  })[0];
}

export function useTrackingFeed() {
  const [deviceObservations, setDeviceObservations] =
    useState<DeviceObservationMap>({});
  const [roomTelemetry, setRoomTelemetry] = useState<RoomTelemetryMap>({});
  const [status, setStatus] = useState("Disconnected");
  const messageHandlerRef = useRef((message: Paho.Message) => {
    const telemetryUpdate = parseRoomTelemetryUpdate({
      floors: floorMaps,
      payload: message.payloadString,
      topic: message.destinationName,
    });

    if (telemetryUpdate) {
      setRoomTelemetry((current) => ({
        ...current,
        [telemetryUpdate.roomId]: telemetryUpdate,
      }));
      return;
    }

    const nextLocations = parseTrackingUpdates({
      floors: floorMaps,
      payload: message.payloadString,
      topic: message.destinationName,
    });

    if (nextLocations.length === 0) {
      return;
    }

    setDeviceObservations((current) => {
      const nextState = { ...current };

      for (const nextLocation of nextLocations) {
        nextState[nextLocation.deviceId] = {
          ...(nextState[nextLocation.deviceId] ?? {}),
          [observationKey(nextLocation)]: nextLocation,
        };
      }

      return nextState;
    });
  });

  const mappedRoomsCount = useMemo(
    () =>
      Object.values(floorMaps).reduce(
        (count, floor) => count + floor.anchors.length,
        0,
      ),
    [],
  );

  useEffect(() => {
    const clientId = `tracking-14-a-${Date.now()}`;
    const client = new Paho.Client(
      mqttConfig.brokerHost,
      mqttConfig.brokerPort,
      mqttConfig.brokerPath,
      clientId,
    );

    client.onConnectionLost = (response) => {
      if (response.errorCode !== 0) {
        setStatus(`Connection lost: ${response.errorMessage}`);
        return;
      }

      setStatus("Disconnected");
    };

    client.onMessageArrived = (message) => {
      messageHandlerRef.current(message);
    };
    setStatus(`Connecting to ${formatBrokerAddress()}...`);

    client.connect({
      cleanSession: true,
      keepAliveInterval: mqttConfig.keepAliveSeconds,
      onFailure: (error) => {
        setStatus(
          `Failed to connect: ${error.errorMessage ?? "unknown error"}`,
        );
      },
      onSuccess: () => {
        setStatus(`Connected to ${formatBrokerAddress()}`);
        client.subscribe(mqttConfig.topic, {
          onFailure: (error) => {
            setStatus(
              `Subscribe failed: ${error.errorMessage ?? mqttConfig.topic}`,
            );
          },
          onSuccess: () => {
            setStatus(`Subscribed to ${mqttConfig.topic}`);
          },
          qos: 0,
        });
        client.subscribe(mqttConfig.telemetryTopic, {
          onFailure: (error) => {
            setStatus(
              `Telemetry subscribe failed: ${error.errorMessage ?? mqttConfig.telemetryTopic}`,
            );
          },
          qos: 0,
        });
      },
      reconnect: true,
      useSSL: mqttConfig.useSsl,
    });

    return () => {
      if (client.isConnected()) {
        client.disconnect();
      }
    };
  }, []);

  const devices = useMemo(
    () =>
      Object.values(deviceObservations)
        .map((observations) => chooseBestLocation(Object.values(observations)))
        .filter((location): location is DeviceLocation => location !== null)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [deviceObservations],
  );

  const telemetry = useMemo(
    () =>
      Object.values(roomTelemetry).sort((left, right) =>
        (left.roomLabel ?? left.roomId).localeCompare(right.roomLabel ?? right.roomId),
      ),
    [roomTelemetry],
  );

  return {
    brokerDisplay: formatBrokerAddress(),
    devices,
    mappedRoomsCount,
    status,
    subscribedTopic: mqttConfig.topic,
    telemetry,
    telemetryTopic: mqttConfig.telemetryTopic,
  };
}
