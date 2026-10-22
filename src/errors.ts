import { AxiError } from "axi-sdk-js";

// Mã lỗi của tool. SDK chỉ map VALIDATION_ERROR → exit 2; mọi mã khác → exit 1.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "ENGINE_MISSING" // không tìm thấy engine Impeccable (binary hoặc launcher)
  | "SCAN_FAILED" // engine chạy nhưng không trả JSON đọc được
  | "SKILL_MISSING" // patch-skill: không có thư mục skill Impeccable
  | "IO_ERROR";

export function fail(message: string, code: ErrorCode, help: string[] = []): never {
  throw new AxiError(message, code, help);
}

export { AxiError };
