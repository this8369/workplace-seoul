import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import path from "node:path";
test("deployed Edge handler type-checks against the same Supabase SDK version", () => {
  const entry = path.resolve("supabase/functions/igis-auth/index.ts");
  const second = path.resolve("supabase/source-functions/igis-enroll/index.ts");
  const ambient = path.resolve(
    "supabase/functions/igis-auth/deno-test-globals.d.ts",
  );
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  };
  const host = ts.createCompilerHost(options),
    read = host.readFile.bind(host);
  host.readFile = (file) =>
    file === ambient
      ? "declare const Deno: {env: {get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};"
      : file === entry || file === second
        ? read(file).replace(
            "npm:@supabase/supabase-js@2.116.0",
            "@supabase/supabase-js",
          )
        : read(file);
  const program = ts.createProgram([entry, second, ambient], options, host);
  const errors = ts.getPreEmitDiagnostics(program);
  assert.equal(
    errors.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
});
