import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  FloorPlanCanvas,
  FLOOR_VIEWBOX,
  FLOOR_ZONE_RECTS,
} from "@/src/components/FloorPlanCanvas";
import { lookupAsset } from "@/src/config/assetRegistry";
import { floorMaps } from "@/src/config/floorMaps";
import { useTrackingFeed } from "@/src/hooks/useTrackingFeed";
import type { DeviceLocation } from "@/src/types/tracking";

const ALIAS_STORAGE_KEY = "@tracker_aliases";
const LIVE_WINDOW_MS = 15_000;
const MAP_CHROME_WIDTH = 356;

const TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  hour: "2-digit",
  minute: "2-digit",
});

type EquipmentMode = "all" | "live" | "unplaced";

const CATEGORY_COLORS: Record<string, string> = {
  Emergency: "#ff6b6b",
  General: "#d4d4d4",
  Imaging: "#6ad4ff",
  Monitor: "#82f17d",
  Pump: "#ffd166",
  Respiratory: "#d8a8ff",
};

function isLive(device: DeviceLocation, now: number) {
  return now - device.updatedAt <= LIVE_WINDOW_MS;
}

function categoryName(device: DeviceLocation) {
  return device.assetCategory ?? "General";
}

function categoryColor(device: DeviceLocation) {
  return CATEGORY_COLORS[categoryName(device)] ?? CATEGORY_COLORS.General;
}

function equipmentMatches(device: DeviceLocation, query: string, label: string) {
  if (!query) {
    return true;
  }

  return [
    label,
    device.deviceId,
    device.anchorLabel,
    device.anchorId,
    device.topic,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function roomName(device: DeviceLocation) {
  return device.anchorLabel ?? device.anchorId ?? "UNPLACED";
}

function ageText(updatedAt: number, now: number) {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.round(seconds / 60)}m`;
}

function displayLabelFor(device: DeviceLocation, nameMap: Record<string, string>) {
  const alias = nameMap[device.deviceId]?.trim();
  return alias ? alias : device.label;
}

function FilterToggle(props: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ hovered, pressed }) => [
        styles.toggle,
        props.active ? styles.toggleActive : null,
        !props.active && (hovered || pressed) ? styles.toggleHover : null,
      ]}
    >
      <Text style={[styles.toggleText, props.active ? styles.toggleTextActive : null]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export default function Index() {
  const { devices, status, telemetry } = useTrackingFeed();
  const { width, height } = useWindowDimensions();
  const floor = floorMaps.floor1;
  const isWide = width >= 980;
  const compactTopBar = width < 760;

  const [mode, setMode] = useState<EquipmentMode>("all");
  const [search, setSearch] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  const [now, setNow] = useState(Date.now());

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const hasEquipmentFilter = deferredSearch.length > 0 || selectedCategory !== "all";
  const activeRoomId = hasEquipmentFilter ? null : selectedRoomId;

  useEffect(() => {
    let cancelled = false;

    const loadAliases = async () => {
      try {
        const stored = await AsyncStorage.getItem(ALIAS_STORAGE_KEY);
        if (!cancelled && stored) {
          setNameMap(JSON.parse(stored) as Record<string, string>);
        }
      } catch (error) {
        console.error("Failed to load tracker aliases", error);
      }
    };

    void loadAliases();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const filteredDevices = useMemo(
    () =>
      devices.filter((device) => {
        if (activeRoomId && device.anchorId !== activeRoomId) {
          return false;
        }

        if (mode === "live" && !isLive(device, now)) {
          return false;
        }

        if (mode === "unplaced" && device.floorId !== null) {
          return false;
        }

        if (selectedCategory !== "all" && categoryName(device) !== selectedCategory) {
          return false;
        }

        return equipmentMatches(device, deferredSearch, displayLabelFor(device, nameMap));
      }),
    [activeRoomId, deferredSearch, devices, mode, nameMap, now, selectedCategory],
  );

  const sortedDevices = useMemo(
    () =>
      [...filteredDevices].sort((left, right) => {
        if ((left.anchorLabel ?? "") !== (right.anchorLabel ?? "")) {
          return (left.anchorLabel ?? "zzz").localeCompare(right.anchorLabel ?? "zzz");
        }

        return displayLabelFor(left, nameMap).localeCompare(displayLabelFor(right, nameMap));
      }),
    [filteredDevices, nameMap],
  );

  const selectedDevice =
    sortedDevices.find((device) => device.deviceId === selectedDeviceId) ?? null;
  const selectedAsset = selectedDevice ? lookupAsset(selectedDevice.deviceId) : null;

  useEffect(() => {
    if (sortedDevices.length === 0) {
      setSelectedDeviceId(null);
      return;
    }

    if (!selectedDevice) {
      setSelectedDeviceId(sortedDevices[0].deviceId);
    }
  }, [selectedDevice, sortedDevices]);

  const plottedDevices = sortedDevices.filter(
    (device) =>
      device.floorId === floor.id &&
      device.xPercent !== null &&
      device.yPercent !== null,
  );

  const availableWidth = isWide
    ? Math.max(320, width - MAP_CHROME_WIDTH - 64)
    : Math.max(320, width - 24);
  const availableHeight = isWide ? Math.max(260, height - 96) : Math.max(260, height - 448);
  const mapWidth = Math.min(availableWidth, availableHeight * floor.aspectRatio);
  const mapHeight = mapWidth / floor.aspectRatio;

  const connected =
    status.toLowerCase().includes("connected") || status.toLowerCase().includes("subscribed");
  const liveCount = devices.filter((device) => isLive(device, now)).length;
  const liveNodeCount = telemetry.filter((node) => now - node.updatedAt <= 30_000).length;
  const selectedRoomLabel = selectedRoomId
    ? floor.anchors.find((anchor) => anchor.id === selectedRoomId)?.label ?? selectedRoomId
    : "All Rooms";
  const selectedRoomTelemetry =
    telemetry.find((node) => node.roomId === (selectedDevice?.anchorId ?? selectedRoomId)) ?? null;
  const categories = useMemo(
    () =>
      [...new Set(devices.map((device) => categoryName(device)))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [devices],
  );

  const openRename = (device: DeviceLocation) => {
    setEditingDeviceId(device.deviceId);
    setTempName(displayLabelFor(device, nameMap));
  };

  const closeRename = () => {
    setEditingDeviceId(null);
    setTempName("");
  };

  const saveRename = async () => {
    if (!editingDeviceId) {
      return;
    }

    const originalLabel =
      devices.find((device) => device.deviceId === editingDeviceId)?.label ?? "";
    const nextName = tempName.trim();
    const nextMap = { ...nameMap };

    if (!nextName || nextName === originalLabel) {
      delete nextMap[editingDeviceId];
    } else {
      nextMap[editingDeviceId] = nextName;
    }

    setNameMap(nextMap);

    try {
      await AsyncStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(nextMap));
    } catch (error) {
      console.error("Failed to save tracker alias", error);
    }

    closeRename();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.topBar, compactTopBar ? styles.topBarCompact : null]}>
        <Text style={styles.topBarTitle}>FLOOR 1</Text>
        <View style={styles.topBarGroup}>
          <Text style={styles.topBarText}>
            ROOM {(activeRoomId ? selectedRoomLabel : "All Rooms").toUpperCase()}
          </Text>
          <Text style={styles.topBarText}>ITEMS {sortedDevices.length}</Text>
          <Text style={styles.topBarText}>LIVE {liveCount}</Text>
          <Text style={styles.topBarText}>NODES {liveNodeCount}</Text>
        </View>
        <View style={styles.topBarGroup}>
          <View
            style={[styles.statusDot, connected ? styles.statusDotLive : styles.statusDotOff]}
          />
          <Text style={styles.topBarText}>{connected ? "LINK OK" : "LINK OFF"}</Text>
        </View>
      </View>

      <View style={styles.stage}>
        <View style={styles.mapStage}>
          <View style={[styles.mapFrameWrap, isWide ? styles.mapFrameWrapWide : null]}>
            <View style={[styles.mapFrame, { height: mapHeight, width: mapWidth }]}>
              <FloorPlanCanvas activeAnchorId={activeRoomId} />

              {floor.anchors.map((anchor) => {
                const area = FLOOR_ZONE_RECTS[anchor.id as keyof typeof FLOOR_ZONE_RECTS];
                if (!area) {
                  return null;
                }

                const active = activeRoomId === anchor.id;

                return (
                  <Pressable
                    key={anchor.id}
                    onPress={() =>
                      setSelectedRoomId((current) => (current === anchor.id ? null : anchor.id))
                    }
                    style={({ hovered, pressed }) => [
                      styles.roomHitArea,
                      {
                        height: `${(area.height / FLOOR_VIEWBOX.height) * 100}%`,
                        left: `${((area.x - FLOOR_VIEWBOX.x) / FLOOR_VIEWBOX.width) * 100}%`,
                        top: `${((area.y - FLOOR_VIEWBOX.y) / FLOOR_VIEWBOX.height) * 100}%`,
                        width: `${(area.width / FLOOR_VIEWBOX.width) * 100}%`,
                      },
                      active ? styles.roomHitAreaActive : null,
                      !active && (hovered || pressed) ? styles.roomHitAreaHover : null,
                    ]}
                  />
                );
              })}

              {plottedDevices.map((device) => {
                const active = selectedDevice?.deviceId === device.deviceId;

                return (
                  <Pressable
                    key={device.deviceId}
                    onPress={() => setSelectedDeviceId(device.deviceId)}
                    style={({ hovered, pressed }) => [
                      styles.markerWrap,
                      active || hovered || pressed ? styles.markerWrapExpanded : null,
                      {
                        left: `${device.xPercent! * 100}%`,
                        top: `${device.yPercent! * 100}%`,
                      },
                    ]}
                  >
                    {({ hovered, pressed }) => {
                      const expanded = active || hovered || pressed;

                      return (
                        <View style={styles.markerShell}>
                          {expanded ? (
                            <View
                              style={[
                                styles.markerHalo,
                                { borderColor: categoryColor(device) },
                              ]}
                            />
                          ) : null}
                          <View
                            style={[
                              styles.marker,
                              expanded ? styles.markerActive : null,
                              { borderColor: categoryColor(device) },
                            ]}
                          >
                            <View
                              style={[
                                styles.markerCore,
                                expanded ? styles.markerCoreActive : null,
                                { backgroundColor: categoryColor(device) },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    }}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.sidebar, isWide ? styles.sidebarFloating : styles.sidebarStacked]}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>EQUIPMENT</Text>
              <Pressable
                onPress={() => setSelectedRoomId(null)}
                style={({ hovered, pressed }) => [
                  styles.clearButton,
                  hovered || pressed ? styles.clearButtonHover : null,
                ]}
              >
                <Text style={styles.clearButtonText}>CLEAR ROOM</Text>
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <MaterialCommunityIcons color="#7b7b7b" name="magnify" size={18} />
              <TextInput
                onChangeText={(value) => startTransition(() => setSearch(value))}
                placeholder="SEARCH EQUIPMENT"
                placeholderTextColor="#666666"
                selectionColor="#f4f4f4"
                style={styles.searchInput}
                value={search}
              />
            </View>

            <View style={styles.toggleRow}>
              <FilterToggle active={mode === "all"} label="ALL" onPress={() => setMode("all")} />
              <FilterToggle active={mode === "live"} label="LIVE" onPress={() => setMode("live")} />
              <FilterToggle
                active={mode === "unplaced"}
                label="LOOSE"
                onPress={() => setMode("unplaced")}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
            >
              <View style={styles.categoryRow}>
                <FilterToggle
                  active={selectedCategory === "all"}
                  label="ALL TYPES"
                  onPress={() => setSelectedCategory("all")}
                />
                {categories.map((category) => (
                  <Pressable
                    key={category}
                    onPress={() => setSelectedCategory(category)}
                    style={({ hovered, pressed }) => [
                      styles.categoryChip,
                      selectedCategory === category ? styles.categoryChipActive : null,
                      !selectedCategory || selectedCategory !== category
                        ? hovered || pressed
                          ? styles.categoryChipHover
                          : null
                        : null,
                      { borderColor: CATEGORY_COLORS[category] ?? "#6f6f6f" },
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryChipDot,
                        { backgroundColor: CATEGORY_COLORS[category] ?? "#d8d8d8" },
                      ]}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        selectedCategory === category ? styles.categoryChipTextActive : null,
                      ]}
                    >
                      {category.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.resultsList}>
              <View style={styles.resultsStack}>
                {sortedDevices.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyText}>NO MATCHES</Text>
                  </View>
                ) : (
                  sortedDevices.map((device) => {
                    const active = selectedDevice?.deviceId === device.deviceId;

                    return (
                      <Pressable
                        key={device.deviceId}
                        onLongPress={() => openRename(device)}
                        onPress={() => setSelectedDeviceId(device.deviceId)}
                        style={({ hovered, pressed }) => [
                          styles.resultRow,
                          active ? styles.resultRowActive : null,
                          !active && (hovered || pressed) ? styles.resultRowHover : null,
                        ]}
                      >
                        <View
                          style={[
                            styles.resultAccent,
                            { backgroundColor: categoryColor(device) },
                          ]}
                        />
                        <View style={styles.resultCopy}>
                          <Text
                            numberOfLines={1}
                            style={[styles.resultName, active ? styles.resultNameActive : null]}
                          >
                            {displayLabelFor(device, nameMap).toUpperCase()}
                          </Text>
                          <View style={styles.resultMetaRow}>
                            <Text style={styles.resultMeta}>
                              {categoryName(device).toUpperCase()}  {roomName(device).toUpperCase()}
                            </Text>
                            <Text
                              style={[
                                styles.resultMeta,
                                isLive(device, now) ? styles.liveText : null,
                              ]}
                            >
                              {ageText(device.updatedAt, now)}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </ScrollView>

            <View style={styles.selectionStrip}>
              <View style={styles.selectionHeader}>
                <Text numberOfLines={1} style={styles.selectionTitle}>
                  {selectedDevice
                    ? displayLabelFor(selectedDevice, nameMap).toUpperCase()
                    : "NO SELECTION"}
                </Text>
                {selectedDevice ? (
                  <Pressable
                    onPress={() => openRename(selectedDevice)}
                    style={({ hovered, pressed }) => [
                      styles.selectionAction,
                      hovered || pressed ? styles.selectionActionHover : null,
                    ]}
                  >
                    <Text style={styles.selectionActionText}>RENAME</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.selectionMeta}>
                {selectedDevice
                  ? `${roomName(selectedDevice).toUpperCase()}  ${TIME_FORMATTER.format(
                      new Date(selectedDevice.updatedAt),
                    )}`
                  : "TAP MAP OR LIST"}
              </Text>
              {selectedDevice ? (
                <Text style={styles.selectionMeta}>
                  {(selectedAsset?.manufacturer ?? "UNKNOWN").toUpperCase()}  {categoryName(selectedDevice).toUpperCase()}
                  {selectedRoomTelemetry?.rssi !== null && selectedRoomTelemetry?.rssi !== undefined
                    ? `  RSSI ${selectedRoomTelemetry.rssi} DBM`
                    : ""}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      <Modal animationType="fade" transparent visible={!!editingDeviceId}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>RENAME EQUIPMENT</Text>
            <TextInput
              autoFocus
              onChangeText={setTempName}
              placeholder="ENTER FRIENDLY NAME"
              placeholderTextColor="#666666"
              selectionColor="#f4f4f4"
              style={styles.modalInput}
              value={tempName}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={closeRename}
                style={({ hovered, pressed }) => [
                  styles.modalButton,
                  hovered || pressed ? styles.modalButtonHover : null,
                ]}
              >
                <Text style={styles.modalButtonText}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={saveRename}
                style={({ hovered, pressed }) => [
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  hovered || pressed ? styles.modalButtonPrimaryHover : null,
                ]}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>SAVE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050505",
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "#090909",
    borderBottomColor: "#242424",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topBarCompact: {
    alignItems: "flex-start",
    gap: 8,
    flexDirection: "column",
  },
  topBarTitle: {
    color: "#f4f4f4",
    fontFamily: "monospace",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2,
  },
  topBarGroup: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "center",
  },
  topBarText: {
    color: "#969696",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "700",
  },
  statusDot: {
    borderRadius: 99,
    height: 10,
    width: 10,
  },
  statusDotLive: {
    backgroundColor: "#f4f4f4",
  },
  statusDotOff: {
    backgroundColor: "#666666",
  },
  stage: {
    flex: 1,
    padding: 12,
  },
  mapStage: {
    flex: 1,
    position: "relative",
  },
  mapFrameWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  mapFrameWrapWide: {
    paddingRight: MAP_CHROME_WIDTH,
  },
  mapFrame: {
    backgroundColor: "#080808",
    borderColor: "#242424",
    borderRadius: 2,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  roomHitArea: {
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 2,
    borderWidth: 1,
    position: "absolute",
  },
  roomHitAreaActive: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "#f4f4f4",
  },
  roomHitAreaHover: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: "#7a7a7a",
  },
  markerWrap: {
    position: "absolute",
    transform: [{ translateX: -4.5 }, { translateY: -4.5 }],
  },
  markerWrapExpanded: {
    transform: [{ translateX: -9 }, { translateY: -9 }],
  },
  markerShell: {
    alignItems: "center",
    justifyContent: "center",
  },
  markerHalo: {
    borderRadius: 99,
    borderWidth: 1,
    height: 22,
    opacity: 0.45,
    position: "absolute",
    width: 22,
  },
  marker: {
    alignItems: "center",
    backgroundColor: "#050505",
    borderColor: "#f4f4f4",
    borderRadius: 99,
    borderWidth: 1.25,
    height: 9,
    justifyContent: "center",
    width: 9,
  },
  markerActive: {
    backgroundColor: "#0d0d0d",
    borderWidth: 1.5,
    height: 18,
    width: 18,
  },
  markerCore: {
    backgroundColor: "#f4f4f4",
    borderRadius: 99,
    height: 3,
    width: 3,
  },
  markerCoreActive: {
    height: 5,
    width: 5,
  },
  sidebar: {
    backgroundColor: "rgba(9, 9, 9, 0.98)",
    borderColor: "#262626",
    borderRadius: 2,
    borderWidth: 1,
    gap: 12,
    padding: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    zIndex: 20,
  },
  sidebarFloating: {
    bottom: 18,
    position: "absolute",
    right: 18,
    top: 18,
    width: 320,
  },
  sidebarStacked: {
    marginTop: 12,
  },
  sidebarHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sidebarTitle: {
    color: "#f4f4f4",
    fontFamily: "monospace",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  clearButton: {
    backgroundColor: "#111111",
    borderColor: "#262626",
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearButtonHover: {
    backgroundColor: "#171717",
    borderColor: "#5a5a5a",
  },
  clearButtonText: {
    color: "#c8c8c8",
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "700",
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: "#070707",
    borderColor: "#222222",
    borderRadius: 2,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    color: "#f4f4f4",
    flex: 1,
    fontFamily: "monospace",
    fontSize: 13,
    paddingVertical: 0,
  },
  categoryScroll: {
    flexGrow: 0,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  categoryChip: {
    alignItems: "center",
    backgroundColor: "#070707",
    borderRadius: 2,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  categoryChipActive: {
    backgroundColor: "#141414",
  },
  categoryChipHover: {
    backgroundColor: "#101010",
  },
  categoryChipDot: {
    borderRadius: 99,
    height: 8,
    width: 8,
  },
  categoryChipText: {
    color: "#8f8f8f",
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "700",
  },
  categoryChipTextActive: {
    color: "#f4f4f4",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggle: {
    backgroundColor: "#070707",
    borderColor: "#232323",
    borderRadius: 2,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  toggleActive: {
    backgroundColor: "#141414",
    borderColor: "#f4f4f4",
  },
  toggleHover: {
    backgroundColor: "#101010",
    borderColor: "#464646",
  },
  toggleText: {
    color: "#8f8f8f",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  toggleTextActive: {
    color: "#f4f4f4",
  },
  resultsList: {
    flex: 1,
  },
  resultsStack: {
    gap: 8,
  },
  emptyRow: {
    backgroundColor: "#070707",
    borderColor: "#232323",
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyText: {
    color: "#8f8f8f",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "700",
  },
  resultRow: {
    backgroundColor: "#070707",
    borderColor: "#232323",
    borderRadius: 2,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultRowActive: {
    backgroundColor: "#141414",
    borderColor: "#f4f4f4",
  },
  resultRowHover: {
    backgroundColor: "#101010",
    borderColor: "#5a5a5a",
  },
  resultAccent: {
    alignSelf: "stretch",
    borderRadius: 99,
    marginRight: 10,
    width: 3,
  },
  resultCopy: {
    flex: 1,
    gap: 4,
  },
  resultName: {
    color: "#ededed",
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "800",
  },
  resultNameActive: {
    color: "#ffffff",
  },
  resultMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultMeta: {
    color: "#898989",
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "700",
  },
  liveText: {
    color: "#ffffff",
  },
  selectionStrip: {
    backgroundColor: "#070707",
    borderColor: "#232323",
    borderRadius: 2,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  selectionTitle: {
    color: "#f4f4f4",
    flex: 1,
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "800",
  },
  selectionAction: {
    backgroundColor: "#111111",
    borderColor: "#2a2a2a",
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  selectionActionHover: {
    backgroundColor: "#171717",
    borderColor: "#5a5a5a",
  },
  selectionActionText: {
    color: "#c8c8c8",
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "800",
  },
  selectionMeta: {
    color: "#8f8f8f",
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "700",
  },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.74)",
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#080808",
    borderColor: "#2b2b2b",
    borderRadius: 2,
    borderWidth: 1,
    gap: 12,
    maxWidth: 360,
    padding: 16,
    width: "100%",
  },
  modalTitle: {
    color: "#f4f4f4",
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  modalInput: {
    backgroundColor: "#060606",
    borderColor: "#262626",
    borderRadius: 2,
    borderWidth: 1,
    color: "#f4f4f4",
    fontFamily: "monospace",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalButton: {
    backgroundColor: "#111111",
    borderColor: "#2a2a2a",
    borderRadius: 2,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  modalButtonHover: {
    backgroundColor: "#171717",
    borderColor: "#575757",
  },
  modalButtonPrimary: {
    backgroundColor: "#f4f4f4",
    borderColor: "#f4f4f4",
  },
  modalButtonPrimaryHover: {
    backgroundColor: "#d9d9d9",
    borderColor: "#d9d9d9",
  },
  modalButtonText: {
    color: "#c8c8c8",
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "800",
  },
  modalButtonTextPrimary: {
    color: "#050505",
  },
});
