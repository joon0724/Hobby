# GitHub에 올리는 방법

이 작업은 파일 준비까지만 수행했습니다. 원격 저장소 생성, 계정 로그인, 커밋·태그 생성, 업로드는 아직 하지 않았습니다.

## 무엇을 어디에 올리나

| 위치 | 파일 |
|---|---|
| 일반 Git 저장소 | README, 개발 가이드, docs, scripts, licenses, BadukUnity 소스 및 설정, .gitignore, .gitattributes |
| GitHub Releases 첨부 | `release-assets/Baduk-Windows-v1.1.0.zip`, `release-assets/SHA256SUMS.txt` |
| 제외 | 개인 기보, 로그, 계정 설정, 캐시, 테스트 스크린샷, 디버그 심볼, 모델·엔진의 별도 중복 사본 |

GitHub의 일반 Git 파일 제한은 100 MiB이고 웹 업로드는 파일당 25 MiB입니다. 실행 ZIP은 Releases에 첨부하세요. [공식 대형 파일 안내](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)

## 기존 Hobby 저장소에 Baduk 폴더를 추가하는 경우

상위 폴더가 이미 Git 저장소이면 Baduk 안에 새 `.git`를 만들지 않습니다. 상위 저장소에서 다음 순서로 확인합니다.

```powershell
git status --short
git add -- Baduk
git diff --cached --stat
git diff --cached --name-only
git diff --cached -- Baduk
```

`release-assets`, 모델, 실행 파일, `.sgf`, 로그, 개발 PC 경로가 스테이징되지 않았는지 확인합니다. 다른 프로젝트 변경이 이미 스테이징돼 있다면 같은 커밋에 들어갈 수 있으므로 상태를 먼저 확인하세요. 이 안내는 기존 기록을 삭제하거나 강제로 덮어쓰지 않습니다.

확인 후 본인이 커밋하고 기존 브랜치와 원격에 푸시합니다. 사용자명·이메일·토큰을 문서나 프로젝트에 적어 넣지 마세요. 기존 Git 인증이나 GitHub의 로그인 절차를 사용합니다.

```powershell
git commit -m "Add Baduk Studio source and release documentation"
git push
```

## Baduk만 독립 저장소로 공개하는 경우

이 폴더의 소스·문서를 별도의 새 폴더로 복사한 뒤 저장소를 초기화합니다. 상위 저장소 내부에 중첩 저장소를 만들지 않는 방식입니다. Releases용 ZIP은 저장소 커밋에서 계속 제외합니다. 저장소 주소·계정·공개 여부는 게시하는 사람이 결정합니다.

## Release 생성

1. GitHub 저장소의 **Releases → Draft a new release**를 엽니다.
2. 기능 버전 태그는 `baduk-v1.1.0`처럼 다른 Hobby 앱과 구분할 수 있게 정합니다.
3. [릴리스 노트](RELEASE_NOTES.md)를 본문으로 사용합니다.
4. 실행 ZIP과 SHA256SUMS 파일을 첨부합니다.
5. 실제 첨부 파일을 내려받아 SHA-256을 대조하고, 압축 해제한 폴더에서 실행을 확인한 뒤 공개합니다.

현재 문서의 상대 링크는 소스 설명을 위한 것입니다. 공개 후 README의 실행 안내에 실제 Release 페이지 링크를 추가할 수 있습니다.
