import type { FloorsById } from "../types/tracking";

const FLOOR_IMAGE_WIDTH = 2360;
const FLOOR_IMAGE_HEIGHT = 1640;

export const floorMaps: FloorsById = {
  floor1: {
    aspectRatio: FLOOR_IMAGE_WIDTH / FLOOR_IMAGE_HEIGHT,
    anchors: [
      {
        color: "#ff4fd8",
        floorId: "floor1",
        id: "room-1",
        aliases: ["office", "study", "desk"],
        label: "Office",
        xPercent: 0.74,
        yPercent: 0.78,
      },
      {
        color: "#22e7c5",
        floorId: "floor1",
        id: "room-2",
        aliases: ["storage", "closet", "supply"],
        label: "Storage",
        xPercent: 0.72,
        yPercent: 0.29,
      },
      {
        color: "#ff7f22",
        floorId: "floor1",
        id: "room-3",
        aliases: ["living-room", "living", "lounge"],
        label: "Living Room",
        xPercent: 0.47,
        yPercent: 0.31,
      },
      {
        aliases: ["garage", "workshop", "bay"],
        color: "#2747ff",
        floorId: "floor1",
        id: "room-4",
        label: "Garage",
        xPercent: 0.42,
        yPercent: 0.77,
      },
    ],
    id: "floor1",
    label: "Floor 1",
    worldBounds: {
      maxX: FLOOR_IMAGE_WIDTH,
      maxY: FLOOR_IMAGE_HEIGHT,
      minX: 0,
      minY: 0,
    },
  },
};
