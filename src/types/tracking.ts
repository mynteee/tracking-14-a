export type FloorId = "floor1";

export type MapAnchor = {
  aliases?: string[];
  color?: string;
  floorId: FloorId;
  id: string;
  label: string;
  xPercent: number;
  yPercent: number;
};

export type FloorConfig = {
  aspectRatio: number;
  anchors: MapAnchor[];
  id: FloorId;
  label: string;
  worldBounds: {
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
  };
};

export type FloorsById = {
  floor1: FloorConfig;
};

export type DeviceLocation = {
  anchorId: string | null;
  anchorLabel: string | null;
  assetCategory: string | null;
  coordinateText: string | null;
  deviceId: string;
  distanceMeters: number | null;
  floorId: FloorId | null;
  label: string;
  rawPayload: string;
  source: "coordinates" | "anchor" | "unmapped";
  topic: string;
  updatedAt: number;
  xPercent: number | null;
  yPercent: number | null;
};

export type RoomTelemetry = {
  adverts: number | null;
  firmware: string | null;
  freeHeap: number | null;
  ip: string | null;
  maxHeap: number | null;
  reported: number | null;
  roomId: string;
  roomLabel: string | null;
  rssi: number | null;
  seen: number | null;
  topic: string;
  updatedAt: number;
  uptimeSeconds: number | null;
  version: string | null;
};
