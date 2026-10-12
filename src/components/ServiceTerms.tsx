import { useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./ServiceTerms.css";
export default function ServiceTerms() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="service-terms-trigger"
        onClick={() => dialog.current?.showModal()}
      >
        서비스 이용약관
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="service-terms"
          aria-labelledby="service-terms-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) dialog.current?.close();
          }}
        >
          <header>
            <div>
              <small>WORKPLACE SEOUL · 초안 v1 · 2026.10.12</small>
              <h2 id="service-terms-title">서비스 이용약관 및 제공 기준</h2>
            </div>
            <button
              autoFocus
              aria-label="약관 닫기"
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
          </header>
          <section>
            <h3>1. 서비스 목적</h3>
            <p>
              Workplace Seoul은 자산·건물과 관련 정보를 탐색하고, 등록된
              사용자가 업무에 필요한 상세 정보를 조회·관리하는 서비스입니다. 이
              문서는 현재 서비스 기준을 안내하는 초안입니다.
            </p>
          </section>
          <section>
            <h3>2. 자산 제공 기준</h3>
            <p>
              기본 화면은 연면적 1만 평 이상의 오피스를 대상으로 합니다. 이지스
              투자·운용 연관 자산은 면적 제한 없이 포함하며, 이지스 모드에서는
              호텔·물류센터·데이터센터·리테일·주거 등 다른 유형도 조회할 수
              있습니다. 기본 오피스 화면에는 다른 유형을 표시하지 않습니다.
            </p>
            <p>
              IGIS 표시는 원본 자료에서 확인된 투자·운용 관계를 뜻하며 직접
              소유를 보증하지 않습니다. 매각·청산 등 관계 변화는 확인된 자료를
              기준으로 갱신합니다. 자산 유형·면적·위치가 확인되지 않은 경우 이를
              미확인으로 표시하고 임의로 보완하지 않습니다. 지도는 좌표가 확인된
              국내 자산을 표시하며, 해외·위치 미확인 자산은 이지스 목록에서
              확인할 수 있습니다.
            </p>
          </section>
          <section>
            <h3>3. 공개 범위와 회원 이용</h3>
            <p>
              기본 목록·지도와 이지스 모드·IGIS 표시는 로그인 없이 이용할 수
              있습니다. 모든 자산 상세, 펀드·투자자·대주·AUM 등 내부 정보는 등록
              및 접근 권한이 확인된 사용자에게만 제공됩니다. 계정 공유, 접근
              권한 우회, 내부 자료의 무단 반출·배포는 허용하지 않습니다.
            </p>
          </section>
          <section>
            <h3>4. 정보 출처와 정정</h3>
            <p>
              정보는 공공 데이터와 확인된 업무 자료를 바탕으로 하며, 출처와
              기준일에 따라 실제 현황과 차이가 있을 수 있습니다. 투자·거래
              결정에는 최신 원문과 현장을 함께 확인해야 합니다. 누락된 정보는
              수집·검토 후 보완합니다.
            </p>
            <p>
              MY 및 항목별 수정 요청으로 오류를 알려줄 수 있습니다. 허용된
              담당자·관리자의 변경은 이력으로 기록합니다. 건축물대장 정보는 직접
              수정하지 않으며 공식 원천 갱신에 따라 반영합니다.
            </p>
          </section>
          <section>
            <h3>5. 이용자와 서비스의 책임</h3>
            <p>
              이용자는 적법한 업무 목적으로 서비스를 이용하고 타인의
              개인정보·저작권 및 데이터 제공기관의 이용 조건을 준수해야 합니다.
              서비스의 정상 운영을 방해하는 과도한 자동 수집은 제한될 수
              있습니다. 서비스 장애나 잘못된 정보에 대한 책임은 관계 법령에
              따르며, 이 안내로 법정 권리를 배제하지 않습니다.
            </p>
          </section>
          <section>
            <h3>6. 변경 및 문의</h3>
            <p>
              제공 범위나 이용 조건이 변경되면 변경 내용과 적용 시점을
              서비스에서 안내합니다. 이용 문의와 정보 정정은 계정 메뉴의 플랫폼
              이용 문의 또는 MY를 이용해 주세요. 회원 개인정보의 처리
              목적·항목·보유기간 등은 별도 개인정보 처리 안내에서 고지할
              사항입니다.
            </p>
          </section>
        </dialog>,
        document.body,
      )}
    </>
  );
}
