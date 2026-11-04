# 로컬 시연 서버 유지

세 시연 서버는 macOS의 사용자 LaunchAgent로 실행한다. 채팅·터미널이 닫혀도 계속 실행되며, 프로세스가 종료되면 launchd가 다시 시작한다. Mac에 로그인하면 자동 시작한다.

| 포트 | 프로젝트                                | 실행 모드   |
| ---- | --------------------------------------- | ----------- |
| 5173 | Workplace Seoul                         | development |
| 8082 | IGIS Fund Production DP / IOTA CFT      | staging     |
| 8083 | IGIS_Strategy_Project_BID / 송현 BID TF | development |

현재 저장소와 두 프로젝트가 같은 GitHub 폴더 안에 있어야 한다. 각 프로젝트의 기존 `.env`와 `node_modules`를 사용하며, 자격 증명을 LaunchAgent에 복사하지 않는다. 8082는 기존 IOTA 설정대로 LAN 접속도 유지하고, 나머지는 localhost로 실행한다.

```sh
# 최초 설치·기존 임시 Vite 실행을 관리형 서버로 전환
node scripts/dev/demo-servers.mjs install --takeover

# 상태와 실제 HTTP 페이지 제목 확인
node scripts/dev/demo-servers.mjs status

# 각 서버를 차례로 종료해 자동 재시작 확인 (짧은 접속 중단 발생)
node scripts/dev/demo-servers.mjs verify-recovery

# 현재 로그인 세션에서 중지
node scripts/dev/demo-servers.mjs stop

# 다시 시작·설정 갱신
node scripts/dev/demo-servers.mjs install
```

`--takeover`는 해당 포트의 실행 경로가 지정된 프로젝트이고 Vite 프로세스인 경우에만 종료한다. 다른 프로그램은 종료하지 않는다. 포트가 점유되었을 때 다른 번호로 이동하지 않도록 `--strictPort`를 사용한다. 이미 정상 관리 중인 서버는 재설치 시 중단하지 않는다.

설정은 `~/Library/LaunchAgents/com.workplace.demo.<포트>.plist`, 출력·오류 로그는 `~/Library/Logs/WorkplaceDemoServers/`에 저장한다. 설정 파일에는 Node 절대 경로와 프로젝트 작업 경로를 기록한다. Node 설치 경로나 프로젝트 위치를 바꾼 경우 설치 명령을 다시 실행한다.

이 설정은 로컬 Mac에서 실행하는 개발 서버용이다. Mac의 잠자기·종료 중에는 접속할 수 없으며, 전원이 꺼져도 외부에서 항상 접속해야 하는 시연에는 별도 호스팅이 필요하다.
