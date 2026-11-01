# 외부 구성요소와 출처

이 고지는 자체 게임 소스에 외부 라이선스를 일괄 적용하지 않습니다. `licenses/`의 원문과 각 공식 배포 조건을 함께 보존합니다.

| 구성요소 | 제공 형태 / 출처 |
|---|---|
| Unity 6000.6.6f1 Player, Mono 런타임, 관련 Windows 런타임 | 기존 Unity Windows 플레이어 빌드의 실행 구성요소. Unity 에디터·계정·라이선스 인증 파일은 포함하지 않음. [Unity 약관](https://unity.com/legal/terms-of-service) |
| KataGo v1.16.3 Eigen Windows x64 | 공식 배포 ZIP의 런타임 파일과 해시 대조. [배포본](https://github.com/lightvector/KataGo/releases/tag/v1.16.3), `licenses/KataGo-LICENSE.txt` |
| HumanSL b18c384nbt-humanv0 | 공식 모델을 `human.bin.gz`로 사용. [배포본](https://github.com/lightvector/KataGo/releases/tag/v1.15.0), [모델 이용 조건](https://katagotraining.org/network_license/) |
| g170e-b20c256x2 평가 모델 | `default.bin.gz`로 사용. [배포본](https://github.com/lightvector/KataGo/releases/tag/v1.4.5). 공식 모델 안내는 g170 계열을 CC0 예외로 설명함 |
| OpenSSL / zlib / libzip / Microsoft VC 런타임 | 공식 KataGo ZIP에 동봉된 DLL 유지. 개인 인증서·계정 파일과 무관 |
| Eigen / filesystem / half / httplib / nlohmann JSON / tclap / SHA2 구현 | KataGo의 코드 의존성에 대한 저작권·라이선스 고지 보존 |
| Mozilla CA 인증서 묶음 | 공식 엔진 ZIP의 `cacert.pem`. 공개 루트 인증서이며 비밀키가 아님 |
| 맑은 고딕 | Windows 설치 글꼴을 런타임에 사용. 글꼴 파일은 재배포하지 않음 |

외부 고지 파일은 공식 저장소의 고정 버전 또는 공식 이용 조건 페이지에서 가져왔으며 출처·해시는 `licenses/SOURCES.json`에 기록했습니다. 의존성 고지를 위한 참조 버전은 실제 DLL의 상세 버전을 새로 인증하는 의미는 아닙니다. Python 학습 코드나 별도 GPU 런타임은 이 게임에서 설치하지 않습니다.

게임 실행 코드에는 웹 API 호출·로그인·모델 업로드가 없습니다. 다운로드 스크립트만 사용자가 실행할 때 공식 공개 서버에 접속합니다. 게임의 SGF 저장과 Unity의 로컬 로그는 각 사용자의 PC에 생성됩니다.
