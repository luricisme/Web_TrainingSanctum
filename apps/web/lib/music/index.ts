import { env } from "@/lib/env";
import { createJamendoSource } from "./jamendo";
import type { MusicSource } from "./types";

let source: MusicSource | undefined;

export function getMusicSource(): MusicSource {
  source ??= createJamendoSource(env.JAMENDO_CLIENT_ID);
  return source;
}
