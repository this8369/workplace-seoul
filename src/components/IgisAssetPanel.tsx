import { useEffect, useState } from "react";
import { useAreaUnit } from "./AreaUnit";
import {
  masterDisplay,
  masterRpc,
  type MasterRecord,
} from "../lib/master-data";
import MasterWorkspace from "./MasterWorkspace";
import { masterFields } from "../lib/master-fields";
import { ReviewValue, useDataReviewVersion } from "./DataReview";
import "./IgisAssetPanel.css";
export default function IgisAssetPanel({ buildingId }: { buildingId: string }) {
  const revision = useDataReviewVersion();
  const [data, setData] = useState<{
      objects: MasterRecord[];
      vehicles: MasterRecord[];
    } | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    void masterRpc<{ objects: MasterRecord[]; vehicles: MasterRecord[] }>(
      "master_asset_context",
      { building_key: buildingId },
    )
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [buildingId, attempt, revision]);
  if (error)
    return (
      <div className="empty">
        <p>{error}</p>
        <button onClick={() => setAttempt((x) => x + 1)}>다시 시도</button>
      </div>
    );
  if (!data)
    return <p className="context-note">이지스 정보를 불러오는 중입니다.</p>;
  return <IgisInvestmentView key={`${buildingId}-${revision}`} data={data} />;
}

export function IgisInvestmentView({
  data,
}: {
  data: { objects: MasterRecord[]; vehicles: MasterRecord[] };
}) {
  const { areaField, areaLabel, showAreaField } = useAreaUnit();
  const [selected, setSelected] = useState("");
  if (!data.vehicles.length && !data.objects.length)
    return (
      <div className="igis-panel-status">등록된 투자 정보가 없습니다.</div>
    );
  function fieldsFor(object: MasterRecord, missing: boolean) {
    return masterFields.master_investment_objects.filter(
      (field) =>
        !["source_code", "name"].includes(field.key) &&
        field.key in object &&
        showAreaField(field.key, object) &&
        (object[field.key] == null || object[field.key] === "") === missing,
    );
  }
  function fields(object: MasterRecord, missing: boolean) {
    return fieldsFor(object, missing).map((field) => (
      <div key={field.key}>
        <dt>
          {field.key === "address_raw"
            ? "주소"
            : areaLabel(field.key, field.label)}
        </dt>
        <dd>
          <ReviewValue
            entity="master_investment_objects"
            id={object.id}
            field={field.key}
          >
            {areaField(field.key, object[field.key]) ??
              (typeof object[field.key] === "number"
                ? (object[field.key] as number).toLocaleString("ko-KR", {
                    maximumFractionDigits: 1,
                  })
                : masterDisplay(object[field.key]))}
          </ReviewValue>
        </dd>
      </div>
    ));
  }
  return (
    <section className="info-panel igis-investment-panel">
      <div className="section-heading">
        <h2>투자 정보</h2>
      </div>
      <label className="igis-investment-select">
        <span>조회 항목</span>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">자산 정보</option>
          {data.vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {masterDisplay(vehicle.short_name)} ·{" "}
              {masterDisplay(vehicle.operation_status)}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <>
          <MasterWorkspace key={selected} vehicleScope={selected} embedded />
          <p className="context-note igis-investment-note">
            펀드 금액은 해당 건물에 배분된 금액과 다릅니다.
          </p>
        </>
      ) : (
        <div className="igis-object-records">
          {data.objects.map((object) => (
            <section className="igis-object-record" key={object.id}>
              <header className="igis-object-heading">
                <h3>
                  <ReviewValue
                    entity="master_investment_objects"
                    id={object.id}
                    field="name"
                  >
                    {masterDisplay(object.name)}
                  </ReviewValue>
                </h3>
                {Boolean(object.source_code) && (
                  <span className="igis-object-code">
                    {masterDisplay(object.source_code)}
                  </span>
                )}
              </header>
              <dl className="igis-object-fields">{fields(object, false)}</dl>
              {fieldsFor(object, true).length > 0 && (
                <details className="igis-empty-fields">
                  <summary>
                    미입력 항목 {fieldsFor(object, true).length}개
                  </summary>
                  <dl className="igis-object-fields">{fields(object, true)}</dl>
                </details>
              )}
            </section>
          ))}
          {!data.objects.length && (
            <p className="context-note">등록된 자산 정보가 없습니다.</p>
          )}
        </div>
      )}
    </section>
  );
}
