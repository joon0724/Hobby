# ULTRON · Windows 위젯

## 실행

1. `Ultron-Windows-x64.zip`을 폴더 전체로 압축 해제합니다.
2. `Ultron.exe`를 실행합니다. Node.js나 서버 설치는 필요 없습니다. DLL과 resources 폴더도 함께 유지하세요.
3. 설정에서 Groq·OpenAI·Claude·Gemini 중 대화 AI 제공사를 고르고 **키 발급 ↗**에서 본인 키를 발급받습니다.
4. 해당 제공사의 키를 넣고 **키 확인 · 모델 불러오기**를 누른 다음 사용할 **대화 모델**을 선택합니다. 모델 목록은 해당 계정의 API에서 조회합니다. 연결 확인은 모델 목록 조회이며 결제·모델 이용 권한은 첫 요청에서 확인됩니다.
5. **이 Windows 계정에 암호화해 저장**을 선택하면 다음 실행에도 연결됩니다. 선택하지 않으면 앱 종료 시 키가 사라집니다.

Windows 10/11 64비트용입니다. 인터넷 연결과 선택한 제공사의 API 계정이 필요합니다. 코드 서명 인증서가 없는 개인 배포용 빌드입니다.

## 대화와 음성을 따로 설정

**음성 인식 연결**을 펼쳐 Groq 또는 OpenAI를 선택하고 해당 키를 연결한 다음 음성 모델을 고릅니다. 예: 대화는 Claude, 음성은 Groq. 같은 제공사를 양쪽에서 사용하면 연결한 키를 공유하며 한쪽에서 키를 삭제하면 그 제공사를 쓰는 양쪽 기능이 해제됩니다. 음성이 필요 없으면 **사용 안 함**을 선택합니다. 웹에서는 **브라우저 기본**도 사용할 수 있습니다.

제공사나 대화 모델을 변경하면 이전 대화 문맥을 초기화하여 다른 제공사에 이전 대화를 보내지 않습니다. 키 확인 후 목록을 다시 불러올 때도 대화 문맥이 초기화됩니다. 새 버전에서는 기존 Groq 암호화 키를 읽어올 수 있으며, 저장된 키의 모델 목록은 재시작할 때 자동으로 불러옵니다. 오프라인 등으로 실패하면 이전 선택을 유지하며 키 확인 버튼으로 재시도할 수 있습니다.

Claude 계정에서 요구하는 경우 **워크스페이스 ID**에 해당 ID를 입력하세요. 각 서비스의 웹 구독과 API 이용 권한은 별개일 수 있습니다. 키를 발급한 계정의 API 이용 권한·결제 상태를 확인하세요.

## 위젯 조작

- 위쪽 ULTRON 막대를 끌어 이동하고 창 가장자리에서 크기를 조절합니다.
- ◇: 항상 위에 표시 켜기/끄기. 처음 실행 시 꺼져 있으며, 이후에는 마지막 선택을 복원합니다. 꺼져 있으면 다른 창을 클릭할 때 뒤로 갑니다.
- −: 작업 표시줄로 최소화. ×: 완전히 종료.
- 코어 또는 마이크 클릭: 녹음 시작. 다시 클릭: 녹음 완료 후 인식·전송.
- Esc: 녹음 취소 또는 말하기 중지. 녹음은 최대 60초입니다.
- 입력창에서 텍스트 대화가 가능합니다. 설정에서 음성, 속도, 언어, 모션을 변경합니다.
- 키 교체는 해당 제공사를 선택하고 새 키 입력 후 키 확인. **키 삭제**는 사용 중인 키와 저장된 암호문을 삭제합니다.

기존 동심원·육각형·깨진 링 코어와 마우스 반응을 유지합니다. ◇ 버튼을 켜면 다른 창 위에 고정할 수 있습니다. 자동 시작·자동 녹음은 하지 않습니다.

## 개인 키와 데이터

Windows 앱은 API 키·대화·녹음을 선택한 제공사로 직접 보냅니다. 앱 제작자의 서버를 거치지 않습니다. 공용 API 키는 포함되어 있지 않으며 사용자마다 본인 계정의 사용량·요금·한도가 적용됩니다.

저장을 선택하면 Electron safeStorage의 Windows DPAPI로 암호화해 사용자 앱 데이터 폴더에 보관합니다. 같은 Windows 계정에서 실행되는 다른 프로그램에 대한 완전한 격리는 아닙니다. 키는 화면에 다시 표시하거나 로그에 남기지 않습니다.

음성 인식은 별도로 선택한 Groq 또는 OpenAI를 사용하고 녹음 파일은 디스크에 저장하지 않습니다. 응답 읽기는 Windows 설치 음성을 사용합니다. 마이크가 차단된 경우 사용자가 Windows 설정에서 허용해야 합니다.

Windows 위젯은 메모, 제공사·모델·음성 설정, 창 위치·크기·고정 상태를 사용자 데이터 폴더에 저장합니다. 설정의 **최근 대화를 이 기기에 저장**을 켜면 최근 대화도 저장합니다. 기존 저장 동작을 유지하기 위해 기본값은 켜짐입니다. 대화 문맥은 최대 12개 메시지, 메시지당 6000자, JSON 기준 총 40000자 안에서 오래된 부분부터 줄입니다. 화면에서는 전체 답변을 볼 수 있지만 재시작 후 마지막 응답 표시는 20000자로 제한합니다. 웹 버전의 대화는 현재 탭에서만 유지합니다. 다른 사람에게는 배포 ZIP만 전달하면 됩니다. 개인 앱 데이터나 API 키를 함께 전달하지 마세요.

## 웹 버전

웹에서는 키를 현재 탭 메모리에만 보관하고 새로고침하면 지웁니다. 요청은 사이트 서버를 거쳐 선택한 제공사로 전달됩니다. 공개 호스팅의 AI API는 아래 인증·공유 제한 설정이 없으면 503으로 차단합니다. Windows 앱은 각 제공사로 직접 연결하므로 이 호스팅 설정이 필요 없습니다. 기존 호스팅 사이트는 이번 소스 수정으로 자동 업데이트되지 않습니다.

## 기본 도구

키 없이 텍스트로 “지금 몇 시야?”, “오늘 날짜가 뭐야”, “메모: 내일 책 가져오기”, “메모 목록 보여줘”를 사용할 수 있습니다. Windows 음성 인식과 자유 대화에는 키가 필요합니다. 컴퓨터 제어·일정 등록·웹 검색은 포함되어 있지 않습니다.

## 소스 실행과 빌드

Node.js 22.12 이상에서 `npm ci` 후 `npm run desktop`으로 실행합니다. `npm ci`가 Electron을 설치합니다. 설치 스크립트를 명시적으로 차단한 환경에서는 `node node_modules/electron/install.js`로 Electron 바이너리를 설치하세요.

배포: `npm run package:windows`가 빌드를 포함하여 실행하며 `release/3.2.2/Ultron-win32-x64`를 만듭니다. 같은 버전의 기존 출력은 덮어쓰지 않습니다. 임시 작업 폴더는 `.build/desktop-*`에 생성하며 성공·실패 모두에서 해당 작업 폴더를 정리합니다. 다운로드 캐시는 `.cache`에 유지합니다. 패키징은 실제 EXE의 Fuses와 EXE/ASAR 체크섬을 자동 검증하며, 실패하면 성공 결과를 기록하지 않습니다. 다른 배포 경로는 `ULTRON_PACKAGE_OUTPUT`, 기존 Electron 캐시는 `ULTRON_ELECTRON_CACHE`로 지정할 수 있습니다.

웹 로컬 실행: `START-ULTRON.cmd` 또는 `npm run dev`, Chrome에서 http://127.0.0.1:4173 접속.
검증: `npm run build`, `npm test`, `npm run validate`.

기술 참고: https://console.groq.com/docs/speech-to-text · https://www.electronjs.org/docs/latest/api/safe-storage

## 연결 구현 참고

- OpenAI Responses: https://developers.openai.com/api/docs/guides/text
- Claude Messages: https://platform.claude.com/docs/en/api/messages/create
- Gemini generateContent: https://ai.google.dev/api/generate-content

이 버전은 개인 키만 사용하며 서버의 공용 GROQ_API_KEY로 자동 연결하지 않습니다. 키는 설정 화면에서 입력하세요.

## 폴더 이동과 업데이트

Windows 위젯 데이터는 실행 폴더가 아닌 고정된 `%APPDATA%\ultron-widget`에 저장됩니다. 같은 컴퓨터·Windows 계정에서 앱 폴더 이름이나 위치를 바꿔도 동일한 데이터를 읽습니다. API 키는 **암호화해 저장**을 선택한 키만 재실행 후 유지됩니다.

3.2 계열에서 고정 저장소로 저장한 메모·설정·키는 3.2.2에서도 그대로 읽습니다. 3.2 이전의 브라우저 저장소에만 데이터가 있는 경우 먼저 3.2.1을 한 번 실행해 고정 저장소로 옮겨야 합니다. 3.2.2는 화면 주소를 app://로 변경하여 이전 file:// 저장소를 직접 읽지 않습니다. 업데이트 후 이전 값이 보이는지 확인한 다음 앱을 종료하고 전체 배포 폴더를 이동하세요. DLL·resources 폴더도 함께 이동해야 합니다. Windows가 실행 중 파일 이동을 제한하는 경우 앱을 종료한 뒤 이동하세요.

설정·메모·최근 대화는 `data/state.json`, 직전 저장본은 `data/state.json.bak`에 보관됩니다. API 키의 기존 암호화 파일 위치는 유지합니다. 데이터 폴더를 삭제하면 복원할 수 없으며, 다른 Windows 계정이나 다른 PC로 API 키 암호문만 복사해 사용하는 방식은 지원하지 않습니다.

저장 위치 기준: https://www.electronjs.org/docs/latest/api/app/

## 3.2.2 수정 사항과 배포 확인

- 설정에서 대화 저장을 끄면 현재 파일과 백업의 대화 기록을 지웁니다. 실행 중의 대화 문맥은 유지됩니다. **대화 기록 삭제**는 현재 문맥과 저장 기록을 모두 비웁니다. 메모와 설정은 유지합니다. 저장 파일의 메모·대화는 평문이며 API 키만 Windows 암호화로 보호됩니다.
- 파일 손상 시 설정의 **손상된 저장 파일 복구**를 사용할 수 있습니다. 확인 후 읽을 수 없는 파일을 별도 이름으로 보존하고 새 설정 파일을 만듭니다. 보존된 손상 파일에는 이전 개인정보가 남아 있을 수 있습니다. **이전 복구 파일 삭제**로 이 파일들을 삭제할 수 있습니다. 대화 기록 삭제·저장 끄기도 복구 파일이 있으면 확인을 받고 함께 삭제합니다. 복구 파일에는 이전 메모도 포함될 수 있으므로 삭제 확인문을 읽어 주세요. 현재 메모·설정·API 키는 유지합니다. 취소하면 삭제 작업을 진행하지 않습니다.
- 긴 답변 후에도 이어서 대화할 수 있도록 전송 문맥을 제한합니다. “메모리 누수”, “파이썬 날짜 포맷” 등 일반 질문을 로컬 명령이 가로채지 않습니다. 메모 저장은 “메모: 내용” 또는 “메모해 줘 내용”을 사용하세요.
- 제공사 출력 한도는 모두 4096 토큰으로 통일했습니다. 실제 출력 길이와 지원 여부는 모델에 따라 다릅니다.
- 외부 폰트를 불러오지 않고 설치된 글꼴을 사용합니다. 코어 모양·마우스 반응은 유지하며 투영점·그리기 객체를 재사용합니다. 숨겨진 창에서는 코어와 시계 예약을 멈춥니다.
- 배포본은 RunAsNode, NODE_OPTIONS, inspect를 차단하고 ASAR 무결성을 검증합니다. `app://ultron/`로 화면을 읽으며 GrantFileProtocolExtraPrivileges도 끕니다. 스크립트와 스타일은 빌드된 SHA-256 해시만 허용하고 unsafe-inline은 사용하지 않습니다. 배포용 DevTools와 smoke-test 진입점도 제거했습니다. 사용자 계정 전체가 침해된 경우까지 보호하는 보안 경계는 아닙니다.
- 배포 ZIP의 SHA-256은 함께 제공되는 SHA256SUMS.txt와 비교할 수 있습니다. PowerShell: `Get-FileHash .\Ultron-Windows-x64.zip -Algorithm SHA256`. 체크섬은 파일 비교용이며 발행자의 신원을 증명하지 않습니다. 코드 서명 인증서가 제공되지 않아 이번 EXE는 서명하지 않았습니다.
- 소스 폴더 내용은 GitHub 저장소에, Windows ZIP과 체크섬은 Releases에 올리세요. 공개 소스의 hosting.json에는 개인 프로젝트 연결 ID를 포함하지 않습니다.

## 공개 웹 호스팅의 인증과 요청 제한

지원하는 공개 API 실행 환경은 Cloudflare Worker 직접 진입입니다. Worker 전체에 Cloudflare Access를 적용하고 모든 접속 도메인에 인증을 요구해야 합니다. 런타임이 제공하는 ctx.access.aud가 설정한 Audience와 일치해야 하며, 사용자가 보낸 인증/IP/프록시 헤더만으로 통과시키지 않습니다. Origin은 보조 검증입니다. 로그인하지 않은 curl 요청도 거절하며, 유효하게 인증된 사용자의 curl 요청은 같은 한도 안에서 허용됩니다.

Cloudflare가 제공하는 CF-Connecting-IP로 Durable Object를 선택합니다. 같은 IP의 모든 키를 합쳐 분당 40회, 그중 키 확인은 분당 8회로 제한합니다. 키를 바꿔도 새 한도가 생기지 않으며 전역 2048개 키 표가 없어 다른 정상 사용자를 표 포화로 막지 않습니다. 같은 공유 IP 사용자는 한도를 공유합니다. 서로 다른 실제 IP를 가진 인증 사용자의 분산 공격까지 막는 전역 예산 제한은 별도 운영 정책입니다.

1. wrangler.example.json을 wrangler.json으로 복사하고 본인 Worker 이름, ULTRON_PUBLIC_ORIGIN, ULTRON_ACCESS_AUD를 설정합니다.
2. Cloudflare Access에서 해당 Worker와 모든 도메인을 보호하고 허용할 사용자 정책을 설정합니다. 요청 헤더에 임의로 넣은 토큰 정보는 런타임 인증의 대체가 아닙니다.
3. 예시의 ULTRON_LIMITER Durable Object binding과 v1 SQLite migration을 유지하고 npm run build 후 본인 Cloudflare 계정의 Wrangler로 배포합니다.
4. 미인증 401/Access 차단, 정상 사용자 연결, IP당 40회·키 확인 8회 제한을 실제 배포 환경에서 확인합니다. 설정·제한기 장애 시 API는 차단합니다.

Origin은 내부 요청 URL이 아닌 명시적으로 설정한 외부 HTTPS origin과 비교합니다. TLS 종료 후 내부 HTTP URL이어도 외부 origin이 맞으면 통과합니다. X-Forwarded-Host/For 같은 임의 헤더로 주소나 신원을 추정하지 않습니다. 범용 프록시·다른 호스팅에서 사용하려면 검증된 인증 컨텍스트와 공유 제한기 어댑터가 필요합니다. 설정 없이 공개 중계기로 동작하지 않습니다. localhost 개발 서버는 소켓의 loopback 주소를 확인하고 프로세스 전체 한도를 적용합니다.

이번 검증은 Cloudflare 런타임 컨텍스트·Durable Object 저장소를 모의한 자동 테스트입니다. 실제 Cloudflare 배포는 수행하지 않았습니다. 앱은 키·본문을 로그에 기록하지 않으며 플랫폼·프록시의 기록 정책은 운영자가 확인해야 합니다.

## 호스팅 프로젝트 연결 보존

공개 소스에는 개인 project_id를 넣지 않습니다. Sites로 배포할 본인 프로젝트가 있으면 npm run hosting:configure -- appgprj_본인ID를 실행하세요. 연결은 Git에서 제외된 .openai/hosting.local.json에 저장됩니다. npm run build:hosting은 연결이 없으면 실패하여 연결 없는 배포물을 조용히 생성하지 않습니다. 일반 npm run build와 Windows 패키징에는 이 ID가 필요 없습니다. Sites 연결 ID만으로 위 Cloudflare 인증·제한기가 설치되지는 않습니다.

## 실제 API 검증과 Windows 서명 준비

키·인증서가 없는 상태이므로 이번 배포본은 **실제 API 검증 미실행, 코드 서명 없음**입니다. 오프라인 테스트와 체크섬을 이 둘의 대체로 표시하지 않습니다.

- 실제 API: .env.live.example을 Git에서 제외된 .env.live.local로 복사해 본인 제공사·키를 로컬에 설정한 뒤 npm run test:live를 실행합니다. 모델 목록 요청을 검증합니다. 대화까지 검증하려면 모델과 ULTRON_LIVE_ALLOW_BILLING=1을 설정하고 npm run test:live -- --chat를 실행하세요. 유료 요청이 발생할 수 있으며 음성 API 검증은 포함하지 않습니다. 키·응답 본문은 결과 로그에 출력하지 않습니다. 키가 없거나 실패하면 종료 코드 1입니다.
- 서명: 본인 인증서의 WINDOWS_CERTIFICATE_FILE, WINDOWS_CERTIFICATE_PASSWORD 또는 서명 서비스에 맞는 WINDOWS_SIGN_WITH_PARAMS를 안전한 로컬 환경에 설정하고 npm run package:windows:signed를 실행합니다. 필요하면 WINDOWS_SIGNTOOL_PATH를 설정합니다. 인증서가 없으면 즉시 중단합니다. 인증서 파일·암호는 공개 소스에 포함하지 마세요.
- 서명 순서는 패키징 → Fuses 변경 → 서명 → 체크섬 → 검증입니다. Authenticode 상태가 Valid인지 확인하며 성공한 서명 빌드만 signed:true를 기록합니다. 서명되지 않은 빌드는 signed:false입니다. 같은 버전을 다시 만들려면 별도 ULTRON_PACKAGE_OUTPUT 경로를 지정하세요.
- 결과 재검증: npm run verify:package -- release/3.2.2/Ultron-win32-x64. 서명 빌드는 마지막에 --signed를 추가합니다.

## 검토 근거와 검증 범위

검토 보고서의 Claude 인증 지적은 2026-11-03 공식 문서 기준으로 해당하지 않습니다. [Claude 인증](https://platform.claude.com/docs/en/manage-claude/authentication)은 Bearer와 선택적 workspace 헤더를 지원하며, [버전 문서](https://platform.claude.com/docs/en/api/versioning)는 2026-10-21을 명시합니다. 따라서 기존 계약을 유지했습니다. 테스트는 오프라인 계약·회귀 테스트이며 유료 실제 API 호출을 대체하지 않습니다.

[Electron 공식 릴리스](https://releases.electronjs.org/)에서 45.2.1이 안정 버전임을 확인했습니다. 빌드 의존성의 glob/minimatch는 npm audit 지적을 해결한 14.0.3/11.0.4로 고정합니다. 전체 항목별 조치는 REVIEW-FIXES.md에 기록했습니다.
