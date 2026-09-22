// Read-only preparation: does not edit or deploy the IGIS repository.
import { readFile, writeFile } from "node:fs/promises";
const source =
  "/Users/jkjeon2025/Documents/GitHub/IGIS Fund Production DP/src/components/system/AuthSetup.jsx";
let code = await readFile(source, "utf8");
code = code.replace(/^\s*const PILOT_ACCESS_CODE = .*;\n/m, "\n");
code = code.replace(
  "accessCode.trim().toUpperCase() !== PILOT_ACCESS_CODE",
  "!accessCode.trim()",
);
const from = code.indexOf("                // Sign up new user");
const to = code.indexOf(
  "                // Update auth_id in our members table",
  from,
);
if (from < 0 || to < 0)
  throw Error("Source login changed; re-review the adapter");
code =
  code.slice(0, from) +
  `                // Enrollment is verified server-side; the shared code is never bundled in the UI.
                const response = await fetch('https://qgrszltduzblpvpqvkqr.supabase.co/functions/v1/igis-enroll', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({action:'enroll',email:email.trim().toLowerCase(),password,access_code:accessCode}),
                    signal: AbortSignal.timeout(20000),
                });
                const enrollment = await response.json();
                if (!response.ok || !enrollment.session) {
                    triggerError(enrollment.error || '계정 설정을 완료하지 못했습니다.');
                    return;
                }
                const {data, error} = await supabase.auth.setSession(enrollment.session);
                if (error) { triggerError('로그인 세션을 저장하지 못했습니다.'); return; }

` +
  code.slice(to);
code = code.replace(
  "// Update auth_id in our members table",
  "// The server has already linked auth_id; update the login timestamp only.",
);
code = code.replace(
  ".update({ auth_id: data.user.id, last_login_at:",
  ".update({ last_login_at:",
);
await writeFile("/tmp/igis-AuthSetup.jsx", code);
console.log("Prepared /tmp/igis-AuthSetup.jsx; source repository unchanged");
