import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { colors, radius, space, type } from "../theme";
import { useConnectionStore } from "../stores/connectionStore";
import { useMobileSession } from "../stores/sessionStore";

/**
 * Images in the transcript, the way a chat app shows them: small rounded
 * cards in the flow — several in a row when several were sent — and a tap
 * opens the full picture. Used for both what the phone sent and what the
 * agent produced.
 */

/** A row of small image cards; the sent-message and artifact paths share it. */
export function ImageCards({ uris, align }: { uris: string[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={[styles.row, align === "right" && styles.rowRight]}>
      {uris.map((uri, i) => (
        <Pressable key={`${i}-${uri.slice(-24)}`} onPress={() => setOpen(uri)}>
          <Image source={{ uri }} style={styles.card} resizeMode="cover" />
        </Pressable>
      ))}
      <Lightbox uri={open} onClose={() => setOpen(null)} />
    </View>
  );
}

function Lightbox({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.lightbox} onPress={onClose}>
        {uri && <Image source={{ uri }} style={styles.full} resizeMode="contain" />}
        <View style={styles.closeBar}>
          <Feather name="x" size={22} color="#fff" />
        </View>
      </Pressable>
    </Modal>
  );
}

/** An image artifact: resolve its dataUrl, then render as a card. */
export function InlineImage({ artifactId, title }: { artifactId: string; title: string }) {
  // The artifact envelope usually carries the dataUrl; artifact:read is the
  // fallback for a snapshot that arrived without content.
  const fromStore = useMobileSession(
    (s) => s.artifacts.find((a) => a.artifactId === artifactId)?.content,
  );
  const [fetched, setFetched] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
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
  return <ImageCards uris={[src]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginVertical: space.xs,
  },
  rowRight: { justifyContent: "flex-end" },
  card: {
    width: 112,
    height: 112,
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
  closeBar: {
    position: "absolute",
    top: 54,
    right: space.xl,
  },
});
