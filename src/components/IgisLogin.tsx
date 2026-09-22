import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  X,
} from "lucide-react";
import {
  igis,
  connectIgis,
  authBridge,
  authMessage,
  recoveryRoute,
  recoverIgis,
  signOutIgis,
} from "../lib/igis-auth";
import { igisProfileImage } from "../lib/igis-profile";
type Step =
  | "email"
  | "password"
  | "enroll"
  | "forgot"
  | "change"
  | "recover"
  | "sent"
  | "changed";
export default function IgisLogin({
  onClose,
  onSuccess,
  initialMode = "email",
  initialEmail = "",
  initialName = "",
}: {
  onClose: () => void;
  onSuccess: () => void;
  initialMode?: "email" | "change";
  initialEmail?: string;
  initialName?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [step, setStep] = useState<Step>(
    recoveryRoute ? "recover" : initialMode,
  );
  const [email, setEmail] = useState(initialEmail),
    [name, setName] = useState(initialName);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [oldPassword, setOldPassword] = useState(""),
    [accessCode, setAccessCode] = useState("");
  const [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0),
    [recoveryReady, setRecoveryReady] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [step]);
  useEffect(() => {
    if (!recoveryRoute) return;
    let alive = true;
    recoverIgis()
      .then((email) => {
        if (alive) {
          setRecoveryReady(true);
          setEmail(email);
        }
      })
      .catch((error) => {
        if (alive) setError(authMessage(error));
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  function go(next: Step) {
    if (next === "email") {
      setName("");
      setPhotoFailed(false);
    }
    setError("");
    setPassword("");
    setConfirmation("");
    setOldPassword("");
    setVisible(false);
    setStep(next);
  }
  function cleanRecovery() {
    const u = new URL(location.href);
    u.searchParams.delete("igis-recovery");
    u.searchParams.delete("login");
    u.searchParams.delete("code");
    u.hash = "";
    history.replaceState(null, "", u);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const normalized = email.trim().toLowerCase();
    try {
      if (step === "email") {
        const { data, error } = await igis
          .from("iota_seoul_pilot_members")
          .select("staff_name,auth_id")
          .eq("email", normalized)
          .eq("is_active", true)
          .maybeSingle();
        if (error)
          throw Error(
            "직원 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
        if (!data)
          throw Error(
            "등록되지 않았거나 이용이 중지된 계정입니다. 관리자에게 문의해 주세요.",
          );
        setEmail(normalized);
        setName(data.staff_name);
        setPhotoFailed(false);
        go(data.auth_id ? "password" : "enroll");
      } else if (step === "password") {
        const { data, error } = await igis.auth.signInWithPassword({
          email: normalized,
          password,
        });
        if (error) throw error;
        await connectIgis(data.session);
        onSuccess();
      } else if (step === "enroll") {
        if (password !== confirmation)
          throw Error("비밀번호가 일치하지 않습니다.");
        const data = await authBridge("enroll", undefined, {
          email: normalized,
          password,
          access_code: accessCode,
        });
        if (!data.session) throw Error("계정 등록을 완료하지 못했습니다.");
        const { error } = await igis.auth.setSession(data.session);
        if (error) throw error;
        await connectIgis(data.session);
        onSuccess();
      } else if (step === "forgot") {
        if (cooldown) return;
        const redirect = new URL(import.meta.env.BASE_URL, location.origin);
        redirect.searchParams.set("igis-recovery", "1");
        const { error } = await igis.auth.resetPasswordForEmail(normalized, {
          redirectTo: redirect.href,
        });
        if (error) throw error;
        setCooldown(60);
        go("sent");
      } else if (step === "change" || step === "recover") {
        if (password !== confirmation)
          throw Error("새 비밀번호가 일치하지 않습니다.");
        if (step === "change") {
          if (oldPassword === password)
            throw Error("기존 비밀번호와 다른 비밀번호를 입력해 주세요.");
          const { error } = await igis.auth.signInWithPassword({
            email: normalized,
            password: oldPassword,
          });
          if (error) throw error;
        } else if (!recoveryReady)
          throw Error("유효한 재설정 링크로 다시 접속해 주세요.");
        const { error } = await igis.auth.updateUser({ password });
        if (error) throw error;
        // Resetting a password must not silently grant access to this service.
        await signOutIgis();
        cleanRecovery();
        go("changed");
      }
    } catch (e) {
      setError(authMessage(e));
      if ((e as { status?: number }).status === 429) setCooldown(60);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const title: Record<Step, string> = {
    email: "IGIS 계정으로 로그인",
    password: `${name}님, 반갑습니다`,
    enroll: "처음 오셨네요",
    forgot: "비밀번호 찾기",
    change: "비밀번호 변경",
    recover: "새 비밀번호 설정",
    sent: "메일을 확인해 주세요",
    changed: "비밀번호가 변경되었습니다",
  };
  const description: Record<Step, string> = {
    email: "기존 IGIS 이메일에서 @ 앞의 아이디만 입력해 주세요.",
    password: "기존 IGIS 계정의 비밀번호를 입력해 주세요.",
    enroll: "최초 접속 코드와 앞으로 사용할 비밀번호를 입력해 주세요.",
    forgot: "등록된 이메일로 비밀번호 재설정 링크를 보내드립니다.",
    change: "현재 비밀번호를 확인하고 새 비밀번호로 변경합니다.",
    recover: "다른 IGIS 서비스에서도 새 비밀번호를 사용하게 됩니다.",
    sent: "해당 이메일의 받은편지함과 스팸함을 확인해 주세요.",
    changed: "새 비밀번호로 다시 로그인해 주세요.",
  };
  const success = step === "sent" || step === "changed";
  // The IGIS directory stores the employee name; its existing profile assets
  // use that name as the filename (same convention as IGIS profileImage.js).
  const photo = igisProfileImage(name);
  const showPhoto =
    ["password", "enroll", "change"].includes(step) && photo && !photoFailed;
  const passwordField = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    autoComplete: string,
  ) => (
    <label className="igis-field">
      {label}
      <span className="igis-password">
        <input
          aria-label={label}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete={autoComplete}
          required
          minLength={6}
          maxLength={128}
          disabled={busy}
        />
        <button
          type="button"
          className="igis-eye"
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 표시"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
  return (
    <dialog
      ref={dialog}
      className="login-dialog igis-login"
      aria-labelledby="login-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={() => {
        cleanRecovery();
        onClose();
      }}
    >
      <button
        className="close"
        aria-label="로그인 닫기"
        disabled={busy}
        onClick={() => dialog.current?.close()}
      >
        <X size={20} />
      </button>
      <div className="igis-brand">
        <span className="brand-mark">w.</span>
        <span>
          Workplace <span>Seoul</span>
        </span>
      </div>
      {step !== "email" && (
        <button
          type="button"
          className="igis-back"
          disabled={busy}
          onClick={() => go("email")}
        >
          <ArrowLeft size={16} /> 이메일 다시 입력
        </button>
      )}
      <div
        className={`igis-symbol ${success ? "is-success" : ""} ${showPhoto ? "has-photo" : ""}`}
      >
        {success ? (
          <Check size={24} />
        ) : showPhoto ? (
          <img
            src={photo}
            alt={`${name} 프로필 사진`}
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <LockKeyhole size={24} />
        )}
      </div>
      <h2 id="login-title">{title[step]}</h2>
      <p className="igis-description">{description[step]}</p>
      {email && step !== "email" && step !== "forgot" && (
        <div className="igis-email">{email}</div>
      )}
      <form onSubmit={submit} aria-busy={busy}>
        {(step === "email" || step === "forgot") && (
          <label className="igis-field">
            회사 이메일
            <span className="igis-email-input">
              <input
                type="text"
                inputMode="email"
                aria-label="이메일 아이디"
                aria-describedby="igis-email-domain"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
                value={email.split("@")[0]}
                onChange={(e) => {
                  const id = e.target.value.split("@")[0].replace(/\s/g, "");
                  setEmail(id ? `${id}@igisam.com` : "");
                }}
                placeholder="아이디"
                disabled={busy}
              />
              <span id="igis-email-domain" className="igis-email-domain">
                @igisam.com
              </span>
            </span>
          </label>
        )}
        {step === "enroll" && (
          <label className="igis-field">
            최초 접속 코드
            <input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              autoComplete="off"
              required
              disabled={busy}
            />
          </label>
        )}
        {step === "change" &&
          passwordField(
            "현재 비밀번호",
            oldPassword,
            setOldPassword,
            "current-password",
          )}
        {["password", "enroll", "change", "recover"].includes(step) &&
          passwordField(
            step === "password" ? "비밀번호" : "새 비밀번호",
            password,
            setPassword,
            step === "password" ? "current-password" : "new-password",
          )}
        {["enroll", "change", "recover"].includes(step) &&
          passwordField(
            "새 비밀번호 확인",
            confirmation,
            setConfirmation,
            "new-password",
          )}
        {error && (
          <p className="igis-error" role="alert">
            {error}
          </p>
        )}
        {!success && (
          <button
            className="primary igis-submit"
            disabled={
              busy ||
              (step === "forgot" && cooldown > 0) ||
              (step === "recover" && !recoveryReady)
            }
          >
            {busy
              ? "확인 중…"
              : step === "forgot" && cooldown
                ? `${cooldown}초 후 다시 시도`
                : step === "email"
                  ? "다음"
                  : step === "password"
                    ? "로그인"
                    : step === "forgot"
                      ? "재설정 링크 보내기"
                      : step === "enroll"
                        ? "비밀번호 설정하고 시작"
                        : "비밀번호 변경"}
            {!busy && <ArrowRight size={17} />}
          </button>
        )}
        {success && (
          <button
            type="button"
            className="primary igis-submit"
            onClick={() => go("email")}
          >
            로그인으로 돌아가기
            <ArrowRight size={17} />
          </button>
        )}
      </form>
      {(step === "password" || step === "enroll") && (
        <div className="igis-links">
          <button disabled={busy} onClick={() => go("forgot")}>
            비밀번호 찾기
          </button>
          <span />
          <button disabled={busy} onClick={() => go("change")}>
            비밀번호 변경
          </button>
        </div>
      )}
      {step === "recover" && !recoveryReady && (
        <button className="igis-back" onClick={() => go("forgot")}>
          재설정 링크 다시 받기
        </button>
      )}
      <p className="igis-note">
        IGIS 직원 계정으로 연결됩니다.
        <br />
        서비스 이용 권한은 Workplace Seoul에서 관리합니다.
      </p>
    </dialog>
  );
}
