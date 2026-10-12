import type { TiktokenModel } from "tiktoken";
import { encoding_for_model, get_encoding } from "tiktoken";

const FALLBACK_ENCODING = "cl100k_base";

export function createTokenizer(model: string) {
  return createTokenizerWithInfo(model).encoding;
}

export function createTokenizerWithInfo(model: string) {
  try {
    const normalized = model.trim();
    if (!normalized) throw new Error("No model");
    const encoding = encoding_for_model(normalized as TiktokenModel);
    return { encoding, info: { encoding: encoding.name ?? "unknown", source: "model" as const } };
  }
  catch {
    return { encoding: get_encoding(FALLBACK_ENCODING), info: { encoding: FALLBACK_ENCODING, source: "fallback" as const } };
  }
}
