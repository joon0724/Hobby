# 검토 보고서 조치 결과

대상은 Ultron 3.2.2입니다. 2026-11-03 검토 보고서의 35개 항목을 실제 코드와 공식 문서에 대조했습니다. Windows 배포본과 공개용 소스를 수정했으며 기존 호스팅 사이트에 게시하는 작업은 포함하지 않았습니다. 코어의 동심원·육각형·깨진 링 모양과 마우스 반응 계수는 유지했습니다.

| 번호 | 결과                         | 조치 또는 확인 근거                                                                                                                                                                                          |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 지적과 다름                  | Claude 공식 문서가 Bearer 인증, 선택적 anthropic-workspace-id, 2026-10-21 버전을 지원합니다. 정상 헤더를 유지했습니다.                                                                                       |
| 2    | 수정                         | 공유 문맥 정리 함수로 메시지당 6000자, 최대 12개, JSON 40000자 내에서 오래된 문맥을 제거합니다. 긴 화면 답변이 다음 요청을 막지 않습니다.                                                                    |
| 3    | 수정                         | 웹과 개발 서버가 동일한 256KiB JSON 바이트 제한을 사용합니다. 한글 약 35000자 요청을 회귀 테스트했습니다.                                                                                                    |
| 4    | 수정                         | 로컬 명령 파서를 분리하고 문장 전체가 명확한 명령일 때만 처리합니다. 메모리 누수·날짜 포맷·시스템 설계·help 일반 질문은 AI로 전달합니다.                                                                     |
| 5    | 수정                         | build.sh는 build.mjs만 실행하는 래퍼로 통일했습니다. 별도 미완성 산출물을 만들지 않습니다.                                                                                                                   |
| 6    | 외부 검증 준비               | 실제 제공사별 모델 조회·대화 검증 명령 test:live를 추가했습니다. 사용자에게 API 키가 없어 실제 호출은 미실행입니다. 오프라인 통과를 API 실검증으로 표시하지 않습니다.                                        |
| 7    | 수정                         | 웹 CSP와 framing 차단을 유지하고 웹·데스크톱 스크립트 및 스타일 모두 SHA-256 해시를 적용합니다.                                                                                                              |
| 8    | 코드 수정·클라우드 확인 남음 | Cloudflare Access 런타임 인증과 신뢰 IP 기반 Durable Object 공유 제한으로 교체했습니다. 키 순환/전역 표 포화 문제를 제거하고 키 확인은 별도 8회/분으로 제한합니다. 실제 Cloudflare 배포 검증은 미실행입니다. |
| 9    | 코드 수정·운영 설정 필요     | Origin 외에 런타임 인증 Audience를 확인해 미인증 curl도 거절합니다. 외부 HTTPS origin을 명시하여 프록시 내부 URL과 분리합니다. 인증되지 않은 호스팅 환경은 fail-closed입니다.                                |
| 10   | 수정                         | 대화 삭제·저장 끄기는 원본·백업뿐 아니라 확인 후 .unreadable-* 복구 사본도 삭제합니다. 복구 사본 전용 삭제 UI도 추가했습니다.                                                                                |
| 11   | 서명 준비·인증서 필요        | 인증서/서명 서비스 설정을 사용하는 signed 패키징과 Authenticode Valid 확인을 추가했습니다. 사용자가 인증서를 보유하지 않아 이번 배포는 서명 없음입니다. 체크섬은 발행자 인증을 대신하지 않습니다.            |
| 12   | 수정                         | app:// 사용자 정의 프로토콜로 전환하고 GrantFileProtocolExtraPrivileges도 끕니다. 실제 배포 EXE의 6개 Fuses 및 체크섬을 패키징 중 자동 검증합니다.                                                           |
| 13   | 수정                         | 웹 키 누락을 네트워크 호출 전에 판별해 연결 안내를 표시합니다. undefined 문자열을 보내지 않습니다.                                                                                                           |
| 14   | 수정                         | 저장된 키로 시작하면 모델 목록을 자동 조회합니다. 실패 시 이전 모델 선택을 보존하고 재시도 안내를 표시합니다.                                                                                                |
| 15   | 수정                         | 배포 코드에서 smoke-test 분기, 환경변수 경로, JS 실행·스크린샷 저장 코드를 제거했습니다.                                                                                                                     |
| 16   | 수정                         | Google Fonts import를 제거했습니다. OS에 설치된 대체 글꼴을 사용합니다.                                                                                                                                      |
| 17   | 개선                         | 투영점·그리기 객체를 재사용하고 프레임당 공통 삼각함수를 계산합니다. 대기 상태의 예약 간격을 늘리고 숨겨진 창에서는 렌더링·시계 예약을 중지합니다. CPU 절감률을 정량 측정하지는 않았습니다.                  |
| 18   | 수정                         | 코드와 테스트, CSS/HTML을 Prettier로 정리하고 format 명령을 추가했습니다.                                                                                                                                    |
| 19   | 수정                         | 모든 제공사의 출력 한도를 4096토큰으로 통일하고 README에 명시했습니다.                                                                                                                                       |
| 20   | 수정                         | EPERM/EACCES/EBUSY rename에 25/75/150ms의 제한된 재시도를 적용하고 영구 실패는 알립니다.                                                                                                                     |
| 21   | 수정                         | 손상 파일은 확인 후 보존하며, 별도 복구 파일 삭제 버튼과 대화 삭제 연동으로 이전 평문 사본을 제거할 수 있습니다. 현재 메모·키는 유지합니다.                                                                  |
| 22   | 수정                         | 키 저장 임시 파일은 finally에서 정리합니다. 실패하면 기존 연결 정보를 유지합니다.                                                                                                                            |
| 23   | 수정                         | 사용되지 않는 esc 함수를 제거했습니다.                                                                                                                                                                       |
| 24   | 수정                         | 스크립트·스타일 모두 SHA-256을 적용했습니다. style-src-attr none이며 개별 style 속성에 대한 JS 변경으로 모션을 유지합니다.                                                                                   |
| 25   | 수정                         | 작업별 staging과 packager tmp를 하나의 소유 폴더 아래 만들고 finally에서 제거합니다. 같은 버전 출력이 있으면 빌드 전에 실패하여 기존 파일을 보존합니다.                                                      |
| 26   | 수정                         | README 실행 방법을 npm ci와 npm run desktop으로 수정했습니다.                                                                                                                                                |
| 27   | 수정                         | npm test의 pretest에서 자동 빌드합니다.                                                                                                                                                                      |
| 28   | 수정                         | 테스트 임시 파일은 무시되는 .build/tests 아래에 만들고 after 훅에서 정리합니다. outputs에 쓰지 않습니다.                                                                                                     |
| 29   | 수정                         | 공개 manifest의 개인 ID를 제거합니다. hosting:configure로 무시되는 로컬 연결을 저장하며 build:hosting은 연결 누락 시 실패합니다. 기존 개발 체크아웃 연결은 보존합니다.                                       |
| 30   | 확인 및 개선                 | 공식 Electron 릴리스와 npm 레지스트리에서 45.2.1/packager 20.3.0을 확인했습니다. audit에서 발견된 빌드 의존성 glob/minimatch 문제는 14.0.3/11.0.4로 고정해 해소했습니다.                                     |
| 31   | 수정                         | webviewTag false, will-attach-webview 및 will-redirect 차단을 추가했습니다.                                                                                                                                  |
| 32   | 수정                         | 배포 빌드의 DevTools를 비활성화했습니다.                                                                                                                                                                     |
| 33   | 수정                         | 업스트림 JSON은 스트리밍으로 읽으며 디코딩된 바이트가 2MiB를 넘으면 읽기를 취소합니다.                                                                                                                       |
| 34   | 수정                         | 렌더러 캐시 읽기는 깊은 복사본을 반환합니다.                                                                                                                                                                 |
| 35   | 보완                         | 직접 IPC key/models/recover-data 및 복구 삭제, initPrivacy, 500/2100개 키 공격, 동시 요청, 프록시 Origin, 패키징 뒷정리·덮어쓰기 방지 테스트를 추가했습니다. boundedHistory 중복 키를 제거했습니다.          |

## 추가 지적에 대한 결과

- 임의 키를 바꾼 500회 요청은 40회까지만 제공사에 도달합니다. 2,100개 키 이후에도 다른 신뢰 IP의 정상 사용자는 영향을 받지 않는 테스트를 추가했습니다.
- key-check는 인증과 IP 제한을 모두 통과해야 하며 최대 8회/분입니다. 공유 제한기 장애·미설정·인증 누락은 제공사 호출 전에 차단합니다.
- 복구 사본 삭제는 현재 데이터 폴더 안의 정확한 state.json(.bak).unreadable-숫자 패턴만 처리합니다. 다른 파일과 현재 메모·API 키를 지우지 않습니다. 삭제 UI와 취소 경로도 테스트했습니다.
- “메모 목록 보여줘”, “오늘 날짜가 뭐야”를 키 없이 처리하며 일반 질문 오탐 방지 테스트도 유지합니다.
- 프록시 내부 URL과 외부 origin이 다른 경우 및 위조된 전달 헤더 거절을 테스트했습니다. 실제 호스팅 확인은 별도입니다.
- 공개 웹은 인증·공유 제한이 설정되기 전에는 사용할 수 없도록 의도적으로 차단합니다. 데스크톱 직접 API 연결에는 영향이 없습니다.

## 검증

- `npm test`: 62개 자동 테스트. 제공사 응답과 Cloudflare 인증/저장소는 모의 구현이며 localhost HTTP와 실제 로컬 파일 I/O도 포함합니다.
- `npm run validate`: 생성된 Worker의 독립 ESM 로딩 확인.
- `npm audit`: 발견된 취약점 0건. 알려진 취약점 데이터베이스 기준이며 무결점 보증은 아닙니다.
- `npm run package:windows`: 3.2.2 Windows x64 패키징. 패키징 명령에 내장된 검증이 6개 Fuses 및 EXE/ASAR SHA-256을 확인합니다.
- 3.2.2 배포 EXE를 실제 실행해 app://ultron/ 주소, 설정 UI와 기존 코어 렌더링을 확인했습니다.
- Git Bash의 build.sh 직접 실행은 실행 환경의 MSYS 권한 오류로 검증하지 못했습니다. 동일하게 위임되는 Node 빌드는 성공했습니다.
- 실제 AI/음성 요청 및 인증서 서명은 사용자에게 키·인증서가 없어 미실행입니다. 실제 Cloudflare 인증·Durable Object 배포·운영 로그 정책도 검증하지 않았습니다. 기존 공개 사이트에 재배포하지 않았습니다.

- 같은 3.2.2 버전을 재패키징하면 시작 전에 거절하며 기존 EXE 해시와 staging 목록이 변하지 않는 것을 확인했습니다.
- API·서명 설정 없이 각각 검증/서명 명령을 실행하면 명시적으로 실패하는 것도 확인했습니다.

## 공식 근거

- [Claude 인증과 workspace](https://platform.claude.com/docs/en/manage-claude/authentication)
- [Claude API 버전](https://platform.claude.com/docs/en/api/versioning)
- [Electron 안정 릴리스](https://releases.electronjs.org/)
- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [ASAR 무결성](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)

- [Cloudflare Worker Access 런타임 인증](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Durable Object 저장소](https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/)
- [Electron 사용자 정의 프로토콜](https://www.electronjs.org/docs/latest/api/protocol/)
- [CSP style-src-attr](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr)
