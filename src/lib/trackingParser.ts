import { assetCategoryFor, assetLabelFor } from "../config/assetRegistry";
import type {
  DeviceLocation,
  FloorConfig,
  FloorId,
  FloorsById,
  MapAnchor,
  RoomTelemetry,
} from "../types/tracking";

type TrackingEnvelope = {
  floors: FloorsById;
  payload: string;
  topic: string;
};

type BatchDevicePayload = {
  alias?: unknown;
  closestRoom?: unknown;
  distance?: unknown;
  floor?: unknown;
  floorId?: unknown;
  floor_id?: unknown;
  room?: unknown;
  roomName?: unknown;
  room_id?: unknown;
  x?: unknown;
  y?: unknown;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseJson(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function floorFromValue(value: string | null, floors: FloorsById): FloorId | null {
  if (!value) {
    return null;
  }

  const normalized = slugify(value);
  if (normalized === "floor1" || normalized === "1" || normalized === "floor-1") {
    return "floor1";
  }

  if (normalized in floors) {
    return normalized as FloorId;
  }

  return null;
}

function normalizePoint(value: number, min: number, max: number) {
  if (max <= min) {
    return null;
  }

  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function findAnchor(anchorId: string, floors: FloorsById): MapAnchor | null {
  const normalized = slugify(anchorId);

  for (const floor of Object.values(floors)) {
    for (const anchor of floor.anchors) {
      if (anchor.id === normalized) {
        return anchor;
      }

      if (anchor.aliases?.some((alias) => slugify(alias) === normalized)) {
        return anchor;
      }
    }
  }

  return null;
}

function createCoordinateLocation(args: {
  assetCategory: string | null;
  coordinateText: string;
  deviceId: string;
  floor: FloorConfig;
  floorId: FloorId;
  label: string;
  payload: string;
  topic: string;
  worldX: number;
  worldY: number;
}): DeviceLocation | null {
  const x = normalizePoint(
    args.worldX,
    args.floor.worldBounds.minX,
    args.floor.worldBounds.maxX,
  );
  const y = normalizePoint(
    args.worldY,
    args.floor.worldBounds.minY,
    args.floor.worldBounds.maxY,
  );

  if (x === null || y === null) {
    return null;
  }

  return {
    anchorId: null,
    anchorLabel: null,
    assetCategory: args.assetCategory,
    coordinateText: args.coordinateText,
    deviceId: args.deviceId,
    distanceMeters: null,
    floorId: args.floorId,
    label: args.label,
    rawPayload: args.payload,
    source: "coordinates",
    topic: args.topic,
    updatedAt: Date.now(),
    xPercent: x,
    yPercent: 1 - y,
  };
}

function createAnchorLocation(args: {
  anchor: MapAnchor;
  assetCategory: string | null;
  deviceId: string;
  distanceMeters: number | null;
  label: string;
  payload: string;
  topic: string;
}): DeviceLocation {
  return {
    anchorId: args.anchor.id,
    anchorLabel: args.anchor.label,
    assetCategory: args.assetCategory,
    coordinateText: null,
    deviceId: args.deviceId,
    distanceMeters: args.distanceMeters,
    floorId: args.anchor.floorId,
    label: args.label,
    rawPayload: args.payload,
    source: "anchor",
    topic: args.topic,
    updatedAt: Date.now(),
    xPercent: args.anchor.xPercent,
    yPercent: args.anchor.yPercent,
  };
}

function createUnmappedLocation(args: {
  anchorId: string | null;
  assetCategory: string | null;
  deviceId: string;
  distanceMeters: number | null;
  label: string;
  payload: string;
  topic: string;
}): DeviceLocation {
  return {
    anchorId: args.anchorId,
    anchorLabel: null,
    assetCategory: args.assetCategory,
    coordinateText: null,
    deviceId: args.deviceId,
    distanceMeters: args.distanceMeters,
    floorId: null,
    label: args.label,
    rawPayload: args.payload,
    source: "unmapped",
    topic: args.topic,
    updatedAt: Date.now(),
    xPercent: null,
    yPercent: null,
  };
}

function parseBatchTrackingPayload(
  parsed: Record<string, unknown> | null,
  floors: FloorsById,
  payload: string,
  topic: string,
) {
  if (!parsed) {
    return [];
  }

  const entries = Object.entries(parsed).filter(
    ([, value]) => value && typeof value === "object" && !Array.isArray(value),
  ) as [string, BatchDevicePayload][];

  const looksLikeBatch = entries.some(([, value]) =>
    [
      value.closestRoom,
      value.alias,
      value.distance,
      value.room,
      value.roomName,
      value.room_id,
      value.x,
      value.y,
    ].some((field) => field !== undefined),
  );

  if (!looksLikeBatch) {
    return [];
  }

  return entries
    .map(([entryDeviceId, value]) => {
      const label =
        assetLabelFor(
          entryDeviceId,
          pickString(value.alias, entryDeviceId) ?? entryDeviceId,
        );
      const deviceId = entryDeviceId;
      const assetCategory = assetCategoryFor(deviceId);
      const floorId = floorFromValue(
        pickString(value.floor, value.floorId, value.floor_id),
        floors,
      );
      const worldX = pickNumber(value.x);
      const worldY = pickNumber(value.y);
      const distanceMeters = pickNumber(value.distance);
      const anchorId =
        pickString(
          value.closestRoom,
          value.room,
          value.roomName,
          value.room_id,
        ) ?? null;

      if (worldX !== null && worldY !== null && floorId) {
        const location = createCoordinateLocation({
          coordinateText: `x ${worldX.toFixed(1)}, y ${worldY.toFixed(1)}`,
          assetCategory,
          deviceId,
          floor: floors[floorId],
          floorId,
          label,
          payload,
          topic,
          worldX,
          worldY,
        });

        if (location) {
          return location;
        }
      }

      if (anchorId) {
        const anchor = findAnchor(anchorId, floors);
        if (anchor) {
          return createAnchorLocation({
            anchor,
            assetCategory,
            deviceId,
            distanceMeters,
            label,
            payload,
            topic,
          });
        }
      }

      return createUnmappedLocation({
        anchorId,
        assetCategory,
        deviceId,
        distanceMeters,
        label,
        payload,
        topic,
      });
    })
    .filter((location): location is DeviceLocation => location !== null);
}

export function parseTrackingUpdates({
  floors,
  payload,
  topic,
}: TrackingEnvelope): DeviceLocation[] {
  const parsed = parseJson(payload);
  const batchLocations = parseBatchTrackingPayload(parsed, floors, payload, topic);

  if (batchLocations.length > 0) {
    return batchLocations;
  }

  const singleLocation = parseTrackingUpdate({
    floors,
    payload,
    topic,
  });

  return singleLocation ? [singleLocation] : [];
}

export function parseTrackingUpdate({
  floors,
  payload,
  topic,
}: TrackingEnvelope): DeviceLocation | null {
  const deviceMatch = topic.match(/\/devices\/([^/]+)(?:\/([^/]+))?$/);
  if (!deviceMatch) {
    return null;
  }

  const trackerIndex = deviceMatch[1];
  const topicAnchorId = deviceMatch[2] ?? null;
  const parsed = parseJson(payload);
  const deviceId = pickString(parsed?.id, trackerIndex) ?? trackerIndex;
  const assetCategory = assetCategoryFor(deviceId);
  const label = assetLabelFor(
    deviceId,
    pickString(parsed?.name, parsed?.deviceName, parsed?.id, trackerIndex) ??
      trackerIndex,
  );

  const awayValue = pickString(parsed?.state, parsed?.status, payload);
  if (
    awayValue &&
    ["away", "not-home", "not_home", "unknown"].includes(slugify(awayValue))
  ) {
    return createUnmappedLocation({
      anchorId: null,
      assetCategory,
      deviceId,
      distanceMeters: null,
      label,
      payload,
      topic,
    });
  }

  const nestedLocation =
    parsed?.location && typeof parsed.location === "object"
      ? (parsed.location as Record<string, unknown>)
      : null;
  const nestedPosition =
    parsed?.position && typeof parsed.position === "object"
      ? (parsed.position as Record<string, unknown>)
      : null;

  const worldX = pickNumber(
    parsed?.x,
    parsed?.posX,
    parsed?.pixelX,
    parsed?.coordX,
    nestedLocation?.x,
    nestedPosition?.x,
  );
  const worldY = pickNumber(
    parsed?.y,
    parsed?.posY,
    parsed?.pixelY,
    parsed?.coordY,
    nestedLocation?.y,
    nestedPosition?.y,
  );
  const floorId = floorFromValue(
    pickString(
      parsed?.floor,
      parsed?.floorId,
      parsed?.floor_id,
      parsed?.level,
      nestedLocation?.floor,
      nestedPosition?.floor,
    ),
    floors,
  );
  const distanceMeters = pickNumber(
    parsed?.distance,
    nestedLocation?.distance,
    nestedPosition?.distance,
  );

  if (worldX !== null && worldY !== null && floorId) {
    const location = createCoordinateLocation({
      coordinateText: `x ${worldX.toFixed(1)}, y ${worldY.toFixed(1)}`,
      assetCategory,
      deviceId,
      floor: floors[floorId],
      floorId,
      label,
      payload,
      topic,
      worldX,
      worldY,
    });

    if (location) {
      return location;
    }
  }

  const anchorId =
    pickString(
      topicAnchorId,
      parsed?.room,
      parsed?.roomName,
      parsed?.room_id,
      nestedLocation?.room,
    ) ?? null;

  if (anchorId) {
    const anchor = findAnchor(anchorId, floors);
    if (anchor) {
      return createAnchorLocation({
        anchor,
        assetCategory,
        deviceId,
        distanceMeters,
        label,
        payload,
        topic,
      });
    }
  }

  return createUnmappedLocation({
    anchorId,
    assetCategory,
    deviceId,
    distanceMeters,
    label,
    payload,
    topic,
  });
}

export function parseRoomTelemetryUpdate(args: {
  floors: FloorsById;
  payload: string;
  topic: string;
}): RoomTelemetry | null {
  const match = args.topic.match(/\/rooms\/([^/]+)\/telemetry$/);
  if (!match) {
    return null;
  }

  const parsed = parseJson(args.payload);
  if (!parsed) {
    return null;
  }

  const anchor = findAnchor(match[1], args.floors);
  const roomId = anchor?.id ?? slugify(match[1]);

  return {
    adverts: pickNumber(parsed.adverts),
    firmware: pickString(parsed.firm),
    freeHeap: pickNumber(parsed.freeHeap),
    ip: pickString(parsed.ip),
    maxHeap: pickNumber(parsed.maxHeap),
    reported: pickNumber(parsed.reported),
    roomId,
    roomLabel: anchor?.label ?? null,
    rssi: pickNumber(parsed.rssi),
    seen: pickNumber(parsed.seen),
    topic: args.topic,
    updatedAt: Date.now(),
    uptimeSeconds: pickNumber(parsed.uptime),
    version: pickString(parsed.ver),
  };
}
