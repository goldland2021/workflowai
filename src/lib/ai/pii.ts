const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const PHONE_PATTERN = /(?:\+\d[\d\s-]{7,}\d|\b0\d{1,3}[\s-]\d{3,4}[\s-]\d{3,4}\b)/gu;

export function redactContactDetails(text: string): string {
  return text
    .replace(EMAIL_PATTERN, "[email redacted]")
    .replace(PHONE_PATTERN, "[phone redacted]");
}
