# GitHub 업로드와 배포

현재 폴더는 업로드할 파일을 준비한 상태입니다. 원격 저장소 생성, push, Release 게시, 라이선스 선택은 아직 수행하지 않았습니다.

## 1. 준비된 파일 확인

저장소에는 src, scripts, docs, assets, releases와 루트 Markdown·설정 파일을 올립니다. artifacts 폴더는 빌드와 검사 결과이므로 제외합니다. 개인 메모·AppData·예전 data 폴더는 포함하지 않습니다.

공개할 소스의 재사용 조건을 지정하려면 소유자가 LICENSE를 선택해 추가하세요. 이 패키지는 임의의 라이선스를 부여하지 않았습니다.

## 2. 빈 저장소 생성

GitHub에서 새 저장소를 만들고 이름을 예를 들어 yellowmemo로 정합니다. 공개하려면 Public을 선택합니다. 아래 Git 명령을 이용한다면 GitHub 쪽 README·.gitignore·LICENSE 자동 생성은 끄고 빈 저장소로 시작합니다. 로컬 파일이 이미 있기 때문입니다.

[공식 저장소 생성 안내](https://docs.github.com/en/get-started/start-your-journey/creating-a-repository-for-your-project-on-github)

## 3. Git으로 올리기

아래 명령은 설명용이며, 실행 시 실제 업로드됩니다. 저장소 루트의 PowerShell에서 실행하세요. 마지막 remote 주소의 YOUR-ACCOUNT를 본인 계정으로 바꿉니다.

```powershell
git init -b main
git add .
git status --short
git diff --cached --stat
```

목록에 data, widget-notes.json, .bak, .lock, artifacts가 없어야 합니다. 최초 커밋을 만든 다음 본인의 원격 주소를 연결해 push합니다.

```powershell
git commit -m "Prepare YellowMemo v1.0.0 distribution"
git remote add origin https://github.com/YOUR-ACCOUNT/yellowmemo.git
git push -u origin main
```

Git 사용자 이름·이메일이나 GitHub 인증을 요구하면 본인의 설정으로 진행합니다. 비밀번호나 토큰을 소스 파일에 적지 마세요. 이미 다른 이력이 있는 저장소라면 강제 push하지 말고 별도의 빈 저장소를 사용하거나 이력을 먼저 확인합니다.

## 4. 웹 업로드를 사용할 때

빈 저장소에서 파일 업로드 기능으로 공개 대상 파일과 폴더를 올릴 수도 있습니다. 숨김 파일인 .gitignore, .gitattributes가 빠지지 않게 확인하세요. 일반 파일 업로드는 .gitignore의 제외 규칙을 자동 적용하는 Git 작업과 다르므로 artifacts나 개인 데이터가 없는 공개 폴더만 선택하세요.

## 5. Release 만들기

저장소의 Releases에서 새 Release 초안을 만듭니다.

- 태그: v1.0.0
- 제목: 한 장 · YellowMemo v1.0.0
- 설명: [RELEASE_NOTES.md](RELEASE_NOTES.md)의 내용
- 첨부: releases/YellowMemo-v1.0.0-windows.zip, releases/SHA256SUMS.txt

첨부 파일을 확인한 뒤 초안 저장 또는 게시를 선택합니다. 실제 한글 입력 검증을 더 받고 싶다면 pre-release로 게시할 수 있습니다. GitHub가 자동 제공하는 Source code ZIP은 소스 묶음이며, 사용자가 실행할 파일은 별도로 첨부하는 배포 ZIP입니다.

[공식 Release 생성 안내](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

## 6. 다운로드 검증

```powershell
Get-FileHash .\YellowMemo-v1.0.0-windows.zip -Algorithm SHA256
```

SHA256SUMS.txt의 ZIP 해시와 같아야 합니다. 다음 수정에서는 VERSION을 바꾸고 package.ps1로 새 파일을 만든 뒤 새 태그로 배포하세요. 이미 배포한 버전의 ZIP을 다른 파일로 조용히 교체하지 않는 편이 변경 이력을 추적하기 쉽습니다.
