import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  KeyRound,
  LogOut,
  Mail,
  UserRound,
  X,
} from "lucide-react";
import { igisProfileImage } from "../lib/igis-profile";

export default function AccountMenu({
  name,
  email,
  title,
  onLogin,
  onPassword,
  onLogout,
}: {
  name: string;
  email?: string;
  title?: string;
  onLogin: () => void;
  onPassword: () => void;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"contact" | "logout" | null>(null);
  const [failedPhoto, setFailedPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 8, bottom: 72 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const photo = igisProfileImage(name);
  useEffect(() => {
    setOpen(false);
    setPanel(null);
  }, [email]);
  useEffect(() => {
    if (!open) return;
    function positionMenu() {
      const rect = trigger.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 266)),
        bottom: window.innerHeight - rect.top + 8,
      });
    }
    function outside(event: PointerEvent) {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    positionMenu();
    const resize = new ResizeObserver(positionMenu);
    resize.observe(trigger.current!);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", positionMenu);
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      resize.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", positionMenu);
    };
  }, [open]);
  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);
  return (
    <div className="profile-account">
      <button
        ref={trigger}
        className="profile-trigger"
        aria-label={email ? "프로필 메뉴 열기" : "로그인"}
        aria-expanded={email ? open : undefined}
        aria-controls={open ? "account-popover" : undefined}
        title={email ? `${name || email}${title ? ` ${title}` : ""}` : "로그인"}
        onClick={() => (email ? setOpen((v) => !v) : onLogin())}
      >
        <span className="profile-portrait">
          {photo && failedPhoto !== photo ? (
            <img
              src={photo}
              alt={`${name} 프로필`}
              referrerPolicy="no-referrer"
              onError={() => setFailedPhoto(photo)}
            />
          ) : (
            <UserRound size={20} />
          )}
        </span>
        <span className="profile-details">
          <strong>
            {email
              ? `${name || "사용자"}${title ? ` ${title}` : ""}`
              : "Guest"}
          </strong>
          <small>{email || "로그인 해주세요."}</small>
        </span>
        <ChevronRight className="profile-chevron" size={16} />
      </button>
      {open &&
        email &&
        createPortal(
          <div
            ref={menu}
            id="account-popover"
            className="profile-popover"
            style={position}
            aria-label="계정 메뉴"
          >
            <button
              onClick={() => {
                setOpen(false);
                onPassword();
              }}
            >
              <KeyRound size={18} />
              비밀번호 변경
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setPanel("contact");
              }}
            >
              <Mail size={18} />
              플랫폼 이용 문의
            </button>
            <div className="profile-menu-divider" />
            <button
              className="profile-logout"
              onClick={() => {
                setOpen(false);
                setError("");
                setPanel("logout");
              }}
            >
              <LogOut size={18} />
              로그아웃
            </button>
          </div>,
          document.body,
        )}
      {createPortal(
        <dialog
          ref={dialog}
          className="profile-dialog"
          aria-labelledby="profile-dialog-title"
          onCancel={(e) => {
            if (busy) e.preventDefault();
          }}
          onClose={() => {
            setPanel(null);
            trigger.current?.focus();
          }}
        >
          <button
            className="close"
            aria-label="닫기"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
          <h2 id="profile-dialog-title">
            {panel === "contact" ? "플랫폼 이용 문의" : "로그아웃"}
          </h2>
          {panel === "contact" ? (
            <>
              <p>전기영 매니저에게 연락해 주세요.</p>
              <a href="mailto:jk.jeon@igisam.com">jk.jeon@igisam.com</a>
              <a href="tel:01090765369">010-9076-5369</a>
              <button
                className="profile-confirm"
                onClick={() => dialog.current?.close()}
              >
                닫기
              </button>
            </>
          ) : (
            <>
              <p>현재 계정에서 로그아웃하시겠습니까?</p>
              {error && <p role="alert">{error}</p>}
              <div className="profile-dialog-actions">
                <button disabled={busy} onClick={() => dialog.current?.close()}>
                  취소
                </button>
                <button
                  className="profile-confirm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onLogout();
                      dialog.current?.close();
                    } catch {
                      setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "로그아웃 중…" : "로그아웃"}
                </button>
              </div>
            </>
          )}
        </dialog>,
        document.body,
      )}
    </div>
  );
}
