import { z } from "zod";

export const PermissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  /** Everything runs, no questions — including destructive shell commands. */
  "unrestricted",
]);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

/** What kind of side effect a tool call has — drives dialog copy and mode defaults. */
export const PermissionKindSchema = z.enum(["read", "edit", "execute", "fetch", "other"]);
export type PermissionKind = z.infer<typeof PermissionKindSchema>;

export const PermissionRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  kind: PermissionKindSchema,
  /** One-line humanized summary, e.g. `Run \`npm test\` in C:\proj`. */
  summary: z.string(),
  args: z.unknown(),
  /** For file edits: proposed change so the UI can show a diff before approval. */
  diff: z
    .object({ path: z.string(), oldText: z.string(), newText: z.string() })
    .optional(),
  /** Rule strings the UI offers under "Allow always" (already scoped by main). */
  suggestedRules: z.array(z.string()),
});
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;

export const PermissionResponseSchema = z.object({
  id: z.string(),
  behavior: z.enum(["allow", "deny"]),
  /** "once" applies to this call only; "always" persists `rule` into settings. */
  scope: z.enum(["once", "always"]).default("once"),
  rule: z.string().optional(),
  /** Optional user note on deny — forwarded to the model as the tool error. */
  message: z.string().optional(),
});
export type PermissionResponse = z.infer<typeof PermissionResponseSchema>;

export const PermissionRulesSchema = z.object({
  mode: PermissionModeSchema.default("default"),
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
});
export type PermissionRules = z.infer<typeof PermissionRulesSchema>;
