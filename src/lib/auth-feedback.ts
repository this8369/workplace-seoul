export function loginErrorMessage(error: unknown): string {
  const details =
    error && typeof error === "object"
      ? (error as { code?: string; status?: number; name?: string })
      : {};
  switch (details.code) {
    case "over_email_send_rate_limit":
      return "로그인 메일 발송 한도를 초과했습니다. 지금은 다시 눌러도 발송되지 않습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.";
    case "over_request_rate_limit":
      return "로그인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    case "email_address_not_authorized":
      return "현재 메일 발송 설정에서는 이 이메일로 로그인 링크를 보낼 수 없습니다. 관리자에게 메일 발송 설정을 요청해 주세요.";
    case "email_address_invalid":
    case "validation_failed":
      return "이메일 주소를 확인해 주세요.";
    case "signup_disabled":
    case "otp_disabled":
      return "이 계정은 이메일 링크 로그인을 사용할 수 없습니다. 관리자에게 문의해 주세요.";
  }
  if (details.status === 429)
    return "로그인 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.";
  if (details.name === "AuthRetryableFetchError" || error instanceof TypeError)
    return "인증 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  return "로그인 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
