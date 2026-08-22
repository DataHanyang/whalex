import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { colors, radius, space, type } from "../theme";
import { useConnectionStore } from "../stores/connectionStore";
import { useMobileSession } from "../stores/sessionStore";

/**
 * An image artifact, rendered where it happened instead of as an
 * "open on desktop" IOU. Small in the flow — a transcript is a work log, not
 * a gallery — and a tap opens it full screen.
 */
export function InlineImage({ artifactId, title }: { artifactId: string; title: string }) {
  // The artifact envelope usually carries the dataUrl; artifact:read is the
  // fallback for a snapshot that arrived without content.
  const fromStore = useMobileSession(
    (s) => s.artifacts.find((a) => a.artifactId === artifactId)?.content,
  );
  const [fetched, setFetched] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const src = fromStore ?? fetched;

  useEffect(() => {
    if (fromStore || fetched || failed) return;
    const client = useConnectionStore.getState().client;
    if (!client) return;
    let live = true;
    client
      .invoke("artifact:read", { artifactId })
      .then((a) => {
        if (!live) return;
        if (a?.content) setFetched(a.content);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [artifactId, fromStore, fetched, failed]);

  if (failed || !src) {
    return (
      <View style={styles.placeholder}>
        {failed ? (
          <Feather name="image" size={15} color={colors.faint} />
        ) : (
          <ActivityIndicator size="small" color={colors.faint} />
        )}
        <Text style={styles.placeholderText} numberOfLines={1}>
          {title}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <Image source={{ uri: src }} style={styles.thumb} resizeMode="cover" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.lightbox} onPress={() => setOpen(false)}>
          <Image source={{ uri: src }} style={styles.full} resizeMode="contain" />
          <View style={styles.lightboxBar}>
            <Text style={styles.lightboxTitle} numberOfLines={1}>
              {title}
            </Text>
            <Feather name="x" size={20} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
  },
  placeholderText: { ...type.caption, flexShrink: 1 },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    justifyContent: "center",
  },
  full: { width: "100%", height: "100%" },
  lightboxBar: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  lightboxTitle: { ...type.ui, color: "#fff", flex: 1 },
});
