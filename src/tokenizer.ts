import type { TiktokenModel } from "tiktoken";
import { encoding_for_model, get_encoding } from "tiktoken";

const FALLBACK_ENCODING = "cl100k_base";

export function createTokenizer(model: string) {
  try {
    const normalized = model.trim();
    if (!normalized) {
      return get_encoding(FALLBACK_ENCODING);
    }
    return encoding_for_model(normalized as TiktokenModel);
  }
  catch {
    return get_encoding(FALLBACK_ENCODING);
  }
}
