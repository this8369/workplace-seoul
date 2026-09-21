import { fetchRegister } from "./client.mjs";
import { writeFile } from "node:fs/promises";
try {
  const result = await fetchRegister("getBrTitleInfo", {
    sigunguCd: "11680",
    bjdongCd: "10300",
    platGbCd: "0",
    bun: "0012",
    ji: "0000",
  });
  await writeFile(
    "data/private/building-register-probe.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      ok: true,
      count: result.items.length,
      buildings: result.items.map((b) => ({
        pk: b.mgmBldrgstPk,
        name: b.bldNm,
        address: b.platPlc,
        approval: b.useAprDay,
      })),
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
