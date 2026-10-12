import { supabase } from "./supabase";
export type MasterRecord = {
  id: string;
  revision: number;
  [key: string]: unknown;
};
export async function masterRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw Error("서비스 연결을 확인해 주세요.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.message.includes("revision_conflict"))
      throw Error(
        "다른 사용자가 먼저 수정했습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요.",
      );
    if (error.message.includes("denied"))
      throw Error("로그인 상태와 이용 권한을 확인해 주세요.");
    throw Error("처리하지 못했습니다. 입력값과 연결 상태를 확인해 주세요.");
  }
  return data as T;
}
export function masterDisplay(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
