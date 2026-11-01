# 한 수 · Baduk Studio

Unity 6로 만든 Windows 오프라인 바둑 게임입니다. KataGo HumanSL 상대, 실제 바둑 규칙, 상황 분석과 내 예상 집 표시를 제공합니다.

## 플레이

GitHub Releases에 첨부할 `Baduk-Windows-v1.1.0.zip`을 압축 해제하고 `BadukWindows/Baduk.exe`를 실행합니다. `Baduk_Data`, `UnityPlayer.dll`, `MonoBleedingEdge` 등 동봉 파일을 함께 유지하세요. Windows 64비트용이며 엔진·모델이 포함되어 게임 실행 중 API 키나 인터넷 연결이 필요하지 않습니다.

1. **게임 시작** → AI **20급~1급 / 1단~9단**, **9·13·19줄**, **흑/백** 선택.
2. 교차점 클릭으로 착수. AI 초기화·생각·분석 중에는 착수 입력이 잠깁니다.
3. 하단 **상황 분석**으로 흑 승률, 예상 집수 차이, 추천 수와 예상 집을 확인합니다.
4. **초록색 채운 네모 = 내 예상 집**, **주황색 테두리 = 상대 예상 집**. 불확실한 빈 곳은 표시하지 않습니다. 표시를 켜고 끌 수 있습니다.
5. 연속 두 번 패스 → 사석 확인 → 계가. 사석 표시를 무리 단위로 수정하거나 대국을 재개할 수 있습니다.

## 기능과 한계

| 구분 | 내용 |
|---|---|
| 규칙 | 중국식 온라인 면적 계가, 덤 7.5집, 자충 금지, 위치 슈퍼코, 따내기, 패스, 기권 |
| AI | KataGo v1.16.3 Eigen CPU + HumanSL 등급별 인간 기보 스타일 |
| 분석 | 빠른 신경망 평가. 예상 집은 빈 교차점의 예측 소유권을 시각화 |
| 저장 | 사용자가 기보 저장을 누를 때 SGF 저장. 자동 대국 복원 없음 |
| 미지원 | 한국/일본식 집 계가, 접바둑, 초읽기, 온라인 대전, 모바일·WebGL |

급수·단은 공인 기력 인증이 아닙니다. 분석값과 예상 집도 확정 판정이 아닙니다. 사석은 AI 제안을 사용자가 검토해 확정하며, 자동 심판 합의 시스템은 아닙니다.

## 개발과 배포 문서

- [처음 요청부터 배포 준비까지의 개발 가이드](BADUK_BUILD_GUIDE.md)
- [공개 전 개인정보·플레이 이력 검토](docs/RELEASE_AUDIT.md)
- [GitHub에 올리는 방법](docs/GITHUB_PUBLISH.md)
- [검증 범위와 결과](docs/VALIDATION.md)
- [변경 이력](CHANGELOG.md)
- [외부 구성요소 고지](THIRD_PARTY_NOTICES.md)

## 소스 실행 및 빌드

Unity **6000.6.6f1**, Windows Build Support (Mono), PowerShell 7을 사용합니다. PowerShell을 이 README가 있는 폴더에서 실행하세요.

```powershell
# 공식 엔진·모델 다운로드 및 SHA-256 검사. 처음 한 번 인터넷 필요.
pwsh -File ./scripts/Prepare-Engine.ps1

# Unity 없이도 순수 C# 규칙 34개 검사 가능
pwsh -File ./scripts/Test-Rules.ps1

# 엔진 통합 8개를 추가하여 총 42개 검사
pwsh -File ./scripts/Test-Rules.ps1 -EngineDirectory ./BadukUnity/Assets/StreamingAssets/KataGo

# 설치 위치에 맞게 경로 지정. 테스트 통과 후 Windows 빌드.
pwsh -File ./scripts/Build-Windows.ps1 -UnityPath 'C:/Program Files/Unity/Hub/Editor/6000.6.6f1/Editor/Unity.exe'
```

Unity Hub에서 `BadukUnity`를 추가한 뒤, **Baduk → Prepare Main Scene** 메뉴를 한 번 실행하고 생성된 `Assets/Scenes/Main.unity`를 열어 Play를 누릅니다. 복구된 프로젝트는 이 메뉴로 씬·플레이어 설정을 재생성합니다.

`release-assets/`는 Git 추적에서 제외됩니다. 실행 ZIP은 Releases 첨부용입니다. 일반 저장소에는 작은 소스·문서·해시 고정 다운로드 스크립트만 올립니다.

이번 공개 준비는 기존 2026-10-19 실행본의 개인정보 정리 및 소스 복구입니다. 2026-11-01에는 Unity 에디터가 없어 새 Unity 빌드를 실행하지 않았습니다. 현재 재실행한 코드·엔진 검사와 과거 UI 검증은 [검증 문서](docs/VALIDATION.md)에 구분했습니다.
