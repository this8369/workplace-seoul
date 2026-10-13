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
export default function IgisAssetPanel({ buildingId }: { buildingId: string }) {
  const { areaField, areaLabel, showAreaField } = useAreaUnit();
  const revision = useDataReviewVersion();
  const [data, setData] = useState<{
      objects: MasterRecord[];
      vehicles: MasterRecord[];
    } | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<MasterRecord | null>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setSelected(null);
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
  if (!data.vehicles.length && !data.objects.length)
    return (
      <div className="section-empty">
        <h3>확정 연결된 이지스 펀드가 없습니다.</h3>
        <p>
          원본 자산과 기존 건물의 연결을 검토하고 있습니다. 과거 보유와 현재
          보유도 구분해 반영합니다.
        </p>
      </div>
    );
  return (
    <section>
      <div className="section-heading">
        <h2>이지스 투자 정보</h2>
      </div>
      <p className="context-note">
        원본에 연결된 펀드입니다. 청산·매각된 과거 관계가 포함될 수 있습니다.
        펀드 금액은 해당 건물에 배분된 금액과 다릅니다.
      </p>
      <div className="master-tabs">
        <button aria-pressed={!selected} onClick={() => setSelected(null)}>
          자산 원본 정보
        </button>
        {data.vehicles.map((v) => (
          <button
            key={v.id}
            aria-pressed={selected?.id === v.id}
            onClick={() => setSelected(v)}
          >
            {masterDisplay(v.short_name)} · {masterDisplay(v.operation_status)}
          </button>
        ))}
      </div>
      {selected ? (
        <MasterWorkspace
          key={selected.id}
          vehicleScope={selected.id}
          embedded
        />
      ) : (
        <div className="igis-object-records">
          {data.objects.map((object) => (
            <section key={object.id}>
              <div className="section-heading">
                <h3>{masterDisplay(object.name)}</h3>
              </div>
              <dl className="igis-object-fields">
                {masterFields.master_investment_objects
                  .filter(
                    (field) =>
                      field.key in object && showAreaField(field.key, object),
                  )
                  .map((field) => (
                    <div key={field.key}>
                      <dt>{areaLabel(field.key, field.label)}</dt>
                      <dd>
                        <ReviewValue
                          entity="master_investment_objects"
                          id={object.id}
                          field={field.key}
                        >
                          {areaField(field.key, object[field.key]) ??
                            masterDisplay(object[field.key])}
                        </ReviewValue>
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
          {!data.objects.length && (
            <p className="context-note">연결된 투자자산 정보가 없습니다.</p>
          )}
        </div>
      )}
    </section>
  );
}
