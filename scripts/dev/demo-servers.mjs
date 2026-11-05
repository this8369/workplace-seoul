// macOS owns these processes, independent of any chat or terminal session.
import { execFileSync } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const projects = dirname(root);
const home = homedir();
const domain = `gui/${process.getuid()}`;
const agents = join(home, "Library/LaunchAgents");
const logs = join(home, "Library/Logs/WorkplaceDemoServers");
const configuredSites = [
  {
    name: "Workplace Seoul",
    port: 5173,
    dir: root,
    host: "127.0.0.1",
    title: "Workplace Seoul",
  },
  {
    name: "IOTA CFT",
    port: 8082,
    dir: join(projects, "IGIS Fund Production DP"),
    host: "0.0.0.0",
    mode: "staging",
    title: "IOTA Seoul CFT",
  },
  {
    name: "송현 BID TF",
    port: 8083,
    dir: join(projects, "IGIS_Strategy_Project_BID"),
    host: "127.0.0.1",
    title: "송현 BID TF",
  },
  {
    name: "개발사업관리플랫폼 로컬 작업실",
    port: 4178,
    dir: join(home, "Documents/ChatGPT/개발사업관리플랫폼"),
    host: "127.0.0.1",
    node: "/usr/local/bin/node",
    script: "scripts/local-preview/server.mjs",
    args: ["--port=4178"],
    requiredFiles: [".build/local-preview/original-workspace.json"],
    titlePrefix: "로컬 디자인 작업실 · 개발사업관리플랫폼",
  },
].map((site) => ({
  ...site,
  label: `com.workplace.demo.${site.port}`,
  url: `http://127.0.0.1:${site.port}/`,
  entry: join(site.dir, site.script || "node_modules/vite/bin/vite.js"),
}));
const onlyPort = process.argv
  .find((arg) => arg.startsWith("--only="))
  ?.slice(7);
const sites = onlyPort
  ? configuredSites.filter((site) => String(site.port) === onlyPort)
  : configuredSites;

function command(file, args, options = {}) {
  return execFileSync(file, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
}
function service(site) {
  return `${domain}/${site.label}`;
}
function state(site) {
  try {
    const output = command("/bin/launchctl", ["print", service(site)]);
    return {
      loaded: true,
      state: output.match(/^\s*state = (.+)$/m)?.[1],
      pid: Number(output.match(/^\s*pid = (\d+)$/m)?.[1]) || null,
    };
  } catch {
    return { loaded: false, state: "not loaded", pid: null };
  }
}
function listeners(site) {
  try {
    return [
      ...new Set(
        command("/usr/sbin/lsof", [
          "-nP",
          `-iTCP:${site.port}`,
          "-sTCP:LISTEN",
          "-t",
        ])
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(Number),
      ),
    ];
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}
function expectedServer(site, pid) {
  const cwd = command("/usr/sbin/lsof", [
    "-a",
    "-p",
    String(pid),
    "-d",
    "cwd",
    "-Fn",
  ])
    .split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1);
  const cmd = command("/bin/ps", ["-p", String(pid), "-o", "command="]);
  return (
    cwd === site.dir &&
    (site.script
      ? cmd.includes(site.entry) && site.args.every((arg) => cmd.includes(arg))
      : /node_modules\/(?:\.bin\/vite|vite\/bin\/vite\.js)(?:\s|$)/.test(cmd))
  );
}
async function probe(site) {
  try {
    const response = await fetch(site.url, {
      signal: AbortSignal.timeout(3000),
    });
    const title = (await response.text()).match(
      /<title>([^<]+)<\/title>/i,
    )?.[1];
    return (
      response.ok &&
      (site.titlePrefix
        ? title?.startsWith(site.titlePrefix) === true
        : title === site.title)
    );
  } catch {
    return false;
  }
}
async function waitReady(site, oldPid) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const current = state(site);
    if (current.pid && current.pid !== oldPid && (await probe(site)))
      return current;
    await delay(500);
  }
  throw Error(
    `${site.name}: 서버가 준비되지 않았습니다. 로그: ${join(logs, `${site.port}.error.log`)}`,
  );
}
async function status() {
  const result = await Promise.all(
    sites.map(async (site) => ({
      name: site.name,
      url: site.url,
      ...state(site),
      healthy: await probe(site),
    })),
  );
  console.log(JSON.stringify(result, null, 2));
  return result;
}
async function install(takeover) {
  // Validate every project and occupied port before changing any running server.
  for (const site of sites) {
    await access(site.entry);
    await access(site.node || process.execPath);
    for (const file of site.requiredFiles || [])
      await access(join(site.dir, file));
    const current = state(site);
    for (const pid of listeners(site)) {
      if (pid === current.pid) continue;
      if (!takeover || !expectedServer(site, pid))
        throw Error(
          `${site.port} 포트가 사용 중입니다. 지정된 프로젝트 서버만 --takeover로 전환할 수 있습니다.`,
        );
    }
  }
  await mkdir(agents, { recursive: true });
  await mkdir(logs, { recursive: true, mode: 0o700 });
  for (const site of sites) {
    const node = await realpath(site.node || process.execPath);
    const plist = join(agents, `${site.label}.plist`);
    const definition = {
      Label: site.label,
      ProgramArguments: [
        node,
        site.entry,
        ...(site.args || [
          ...(site.mode ? ["--mode", site.mode] : []),
          "--host",
          site.host,
          "--port",
          String(site.port),
          "--strictPort",
        ]),
      ],
      WorkingDirectory: site.dir,
      EnvironmentVariables: {
        PATH: `${dirname(node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
        NODE_ENV: "development",
      },
      RunAtLoad: true,
      KeepAlive: true,
      ThrottleInterval: 5,
      StandardOutPath: join(logs, `${site.port}.log`),
      StandardErrorPath: join(logs, `${site.port}.error.log`),
    };
    const json = JSON.stringify(definition);
    const xml = command(
      "/usr/bin/plutil",
      ["-convert", "xml1", "-o", "-", "-"],
      { input: json },
    );
    let unchanged = false;
    try {
      unchanged = (await readFile(plist, "utf8")) === xml;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const current = state(site);
    if (current.loaded && unchanged && (await probe(site))) {
      console.log(`${site.name}: already managed (${site.port})`);
      continue;
    }
    if (current.loaded) command("/bin/launchctl", ["bootout", service(site)]);
    for (const pid of listeners(site)) {
      if (!takeover || !expectedServer(site, pid))
        throw Error(
          `${site.port}: 지정된 서버가 아닌 프로세스가 있어 중단했습니다.`,
        );
      process.kill(pid, "SIGTERM");
    }
    for (let attempt = 0; listeners(site).length; attempt++) {
      if (attempt >= 20)
        throw Error(`${site.port}: 기존 서버가 종료되지 않았습니다.`);
      await delay(250);
    }
    await writeFile(plist, xml, { mode: 0o600 });
    await chmod(plist, 0o600);
    command("/bin/launchctl", ["enable", service(site)]);
    command("/bin/launchctl", ["bootstrap", domain, plist]);
    const ready = await waitReady(site);
    console.log(
      `${site.name}: launchd running (${site.port}, PID ${ready.pid})`,
    );
  }
}
async function verifyRecovery() {
  for (const site of sites) {
    const before = state(site);
    if (
      !before.pid ||
      !listeners(site).includes(before.pid) ||
      !expectedServer(site, before.pid)
    )
      throw Error(`${site.name}: launchd가 관리하는 정상 서버부터 필요합니다.`);
    process.kill(before.pid, "SIGTERM");
    const after = await waitReady(site, before.pid);
    console.log(
      `${site.name}: automatic restart verified (${before.pid} -> ${after.pid})`,
    );
  }
}
async function stop() {
  for (const site of sites)
    if (state(site).loaded)
      command("/bin/launchctl", ["bootout", service(site)]);
  console.log(
    "현재 세션의 시연 서버를 중지했습니다. 다음 로그인 때 다시 시작됩니다.",
  );
}

try {
  if (process.platform !== "darwin")
    throw Error("macOS launchd 전용 명령입니다.");
  if (!sites.length) throw Error(`등록되지 않은 포트입니다: ${onlyPort}`);
  const action = process.argv[2] || "status";
  if (action === "install") {
    await install(process.argv.includes("--takeover"));
    await status();
  } else if (action === "verify-recovery") {
    await verifyRecovery();
    await status();
  } else if (action === "stop") await stop();
  else if (action === "status") {
    if ((await status()).some((site) => !site.loaded || !site.healthy))
      process.exitCode = 1;
  } else
    throw Error(
      "사용법: node scripts/dev/demo-servers.mjs install [--takeover] | status | verify-recovery | stop [--only=포트]",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
