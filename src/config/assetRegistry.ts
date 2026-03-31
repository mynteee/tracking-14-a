type AssetRecord = {
  category: string;
  label: string;
  manufacturer?: string;
  roomId?: string;
};

const assetRegistry: Record<string, AssetRecord> = {
  "known:eeede852bd0b": {
    category: "Monitor",
    label: "Patient Monitor 04",
    manufacturer: "Philips",
    roomId: "room-1",
  },
  d8a07885c1d: {
    category: "Pump",
    label: "IV Pump 01",
    manufacturer: "BD Alaris",
    roomId: "room-1",
  },
  f9f0e964a753e: {
    category: "Imaging",
    label: "Portable Ultrasound 02",
    manufacturer: "GE",
    roomId: "room-1",
  },
  "known:e7b2ab1200c1": {
    category: "Respiratory",
    label: "Ventilator 03",
    manufacturer: "Hamilton",
    roomId: "room-2",
  },
  c1a5ff023991: {
    category: "Imaging",
    label: "Portable X-Ray 01",
    manufacturer: "Carestream",
    roomId: "room-3",
  },
  "known:a4f91cb88310": {
    category: "Emergency",
    label: "Crash Cart 01",
    manufacturer: "Capsa",
    roomId: "room-4",
  },
};

function compactDeviceId(deviceId: string) {
  if (deviceId.startsWith("known:")) {
    return deviceId.slice("known:".length);
  }

  return deviceId;
}

export function lookupAsset(deviceId: string) {
  const normalized = compactDeviceId(deviceId).toLowerCase();

  return (
    assetRegistry[deviceId.toLowerCase()] ??
    assetRegistry[normalized] ??
    null
  );
}

export function assetLabelFor(deviceId: string, fallbackLabel: string) {
  return lookupAsset(deviceId)?.label ?? fallbackLabel;
}

export function assetCategoryFor(deviceId: string) {
  return lookupAsset(deviceId)?.category ?? null;
}
