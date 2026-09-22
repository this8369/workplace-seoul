/** Keep transport failures separate from errors returned by IGIS password authentication. */
export async function requestIgisBridge(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw Object.assign(
      new Error("로그인 연결 서버에 접속하지 못했습니다. 비밀번호 오류가 아닙니다. 잠시 후 다시 시도해 주세요."),
      { code: "igis_bridge_unreachable" },
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404 && data.code === "NOT_FOUND") {
      throw Object.assign(
        new Error("로그인 연결 서버의 운영 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요."),
        { code: "igis_bridge_not_deployed", status: 404 },
      );
    }
    throw Object.assign(
      new Error(typeof data.error === "string" ? data.error : "로그인 연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."),
      { status: response.status },
    );
  }
  return data;
}
