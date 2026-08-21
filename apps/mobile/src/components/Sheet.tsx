import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { colors, radius, space } from "../theme";

/**
 * Bottom sheet built on RN's own Animated/Modal rather than a gesture library:
 * these sheets are decision points, not browsable surfaces, so a spring-in
 * with a tap-blocking backdrop is the whole interaction. Keeps the native
 * dependency list — and the rebuild risk — at zero.
 */
export function Sheet({
  visible,
  onDismiss,
  children,
  accent = colors.line,
}: {
  visible: boolean;
  /** Omit to make the sheet non-dismissable — a pending approval must be answered. */
  onDismiss?: () => void;
  children: React.ReactNode;
  /** Colours the top edge, carrying the sheet's urgency. */
  accent?: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 160,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} disabled={!onDismiss} />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            {
              borderTopColor: accent,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) },
              ],
            },
          ]}
        >
          <View style={styles.grabber} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(3,7,11,0.72)" },
  anchor: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.hull,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 2,
    paddingBottom: space.xxl,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    marginTop: space.md,
    marginBottom: space.xs,
  },
});
