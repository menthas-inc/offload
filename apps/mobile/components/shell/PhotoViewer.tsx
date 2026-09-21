// The photo, larger.
//
// The one screen no kit draws. It opens over whatever was on screen, on a
// dark plane: the large rendition as big as the screen allows, and under a
// pull beneath it the row's title and what the row says about the picture,
// which is where the four things offload wrote are read on a phone. The
// controls sit in the platform's own bar, an M3 top app bar on Android and a
// translucent bar on iOS, in the kit's pane order: `maximize-2` for Full
// screen, `ellipsis` for More, `x` for Close. More opens the row's own action
// sheet, the same one a row opens from its list, so the phone has one place a
// row's tools live.
//
// Pinch to zoom; a swipe left or right pages the set; a swipe down and the
// Android back gesture close it. Full screen hides everything but the picture
// until a tap. Reduced motion opens it plain.

import { useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Glyph } from "../Glyph";
import { atOpacity, useColors } from "../../lib/colors";
import type { ContentRow } from "../../lib/threads";
import { useScreenSheet } from "./conversation-context";
import { PhotoThumb } from "./PhotoThumb";


export interface ViewerPhoto {
  blobId: string;
  ready: boolean;
  width: number;
  height: number;
  /** The row's title, or the photo's name in the conversation. */
  title: string;
  /** What the row says about the picture, when there is a row. */
  body?: string | null;
  /** The row, when the photo was opened from one. Its tools follow it. */
  row?: ContentRow;
  /** This device's copy of a photo just sent, until the renditions land. */
  localUri?: string | undefined;
}

export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  onMore,
}: {
  photos: ViewerPhoto[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  /** The row's tools, on the phone's own action sheet. Absent when the photo
   *  has no row, as in the conversation. */
  onMore?: ((row: ContentRow) => void) | undefined;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [full, setFull] = useState(false);
  // Bumped by the Retry under "Not here yet.": the same id, a new attempt.
  const [attempt, setAttempt] = useState(0);
  const photo = photos[index];

  // The plate is above the router and would paint over this.
  useScreenSheet(true);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Every gesture state resets when the picture changes.
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
  }, [index, scale, savedScale, tx, ty, savedTx, savedTy]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(4, Math.max(1, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (savedScale.value > 1) {
        tx.value = savedTx.value + event.translationX;
        ty.value = savedTy.value + event.translationY;
      }
    })
    .onEnd((event) => {
      if (savedScale.value > 1) {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        return;
      }
      // Not zoomed: a swipe pages, a pull down closes.
      if (event.translationY > 90 && Math.abs(event.translationX) < 60) {
        runOnJS(onClose)();
      } else if (event.translationX < -60 && index < photos.length - 1) {
        runOnJS(onIndex)(index + 1);
      } else if (event.translationX > 60 && index > 0) {
        runOnJS(onIndex)(index - 1);
      }
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(setFull)(!full);
  });

  const picture = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  if (!photo) return null;

  const barHeight = 56;
  const captionHeight = full ? 0 : 160;
  const pictureHeight = height - insets.top - insets.bottom - (full ? 0 : barHeight + captionHeight);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      className="absolute inset-0"
      style={{ backgroundColor: COLOR.viewerPlane }}
      accessibilityViewIsModal
    >
      {/* The status bar rides above the plane in white, the way a phone's
          does when a dark full-screen view opens, in both themes. */}
      <StatusBar style="light" />
      {/* The bar: AppBar's geometry over the plane, transparent, starting
          below the status bar, and gone when a tap hides the chrome. More and
          Close only; full screen is the web's, a phone has no window to fill. */}
      {full ? null : (
        <View
          className="flex-row items-center justify-end gap-space-2 px-gutter-screen"
          style={{
            paddingTop: insets.top,
            minHeight: barHeight + insets.top,
          }}
        >
          <Text
            className="flex-1 font-core font-medium"
            style={{ fontSize: 15, color: COLOR.onBrand }}
            numberOfLines={1}
          >
            {photos.length > 1 ? `${index + 1} of ${photos.length}` : ""}
          </Text>
          {photo.row && onMore ? (
            <Tool icon="ellipsis" label="More" onPress={() => onMore(photo.row!)} />
          ) : null}
          <Tool icon="x" label="Close" onPress={onClose} />
        </View>
      )}

      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, tap)}>
        <Animated.View style={[{ width, height: pictureHeight, alignItems: "center", justifyContent: "center", marginTop: full ? insets.top : 0 }, picture]}>
          <PhotoThumb
            blobId={photo.blobId}
            ready={photo.ready}
            rendition="large"
            resizeMode="contain"
            style={{ width, height: pictureHeight }}
            localUri={photo.localUri}
            attempt={attempt}
            accessibilityLabel={photo.body ?? photo.title}
            fallback={
              <View className="items-center gap-space-3">
                <Glyph name="image" size={28} color={COLOR.onBrand} />
                <Text className="font-core" style={{ fontSize: 14, color: COLOR.onBrand }}>
                  Not here yet.
                </Text>
                <Pressable
                  onPress={() => setAttempt((n) => n + 1)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Retry"
                >
                  <Text
                    className="font-core font-medium underline"
                    style={{ fontSize: 14, color: COLOR.onBrand }}
                  >
                    Retry
                  </Text>
                </Pressable>
              </View>
            }
          />
        </Animated.View>
      </GestureDetector>

      {full ? null : (
        <ScrollView
          className="rounded-t-lg bg-surface-raised px-gutter-screen"
          style={{ minHeight: captionHeight + insets.bottom, maxHeight: captionHeight + insets.bottom }}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: insets.bottom + 14 }}
        >
          <Text className="font-core font-medium text-text-primary" style={{ fontSize: 15 }}>
            {photo.title}
          </Text>
          {photo.body ? (
            <Text
              className="mt-space-2 font-core text-text-secondary"
              style={{ fontSize: 13, lineHeight: 19 }}
            >
              {photo.body}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Animated.View>
  );
}

function Tool({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const COLOR = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      accessibilityRole="button"
      className="items-center justify-center rounded-pill"
      style={{ width: 40, height: 40, backgroundColor: atOpacity(COLOR.onBrand, 0.12) }}
    >
      <Glyph name={icon} size={18} color={COLOR.onBrand} />
    </Pressable>
  );
}
