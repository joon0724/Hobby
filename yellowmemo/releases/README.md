# 배포 파일

- `YellowMemo-v1.0.0-windows.zip`: EXE와 USER_GUIDE.md만 들어 있는 사용자용 압축 파일
- `SHA256SUMS.txt`: 위 ZIP의 SHA-256
- [Release 설명 초안](../docs/RELEASE_NOTES.md)

재생성: 저장소 루트에서 `.\scripts\package.ps1`을 실행합니다. ZIP은 배포 편의를 위해 이 폴더에 포함했습니다. GitHub Release에도 ZIP과 SHA256SUMS.txt를 첨부할 수 있습니다.

빌드 시각 등에 따라 컴파일 결과의 해시가 달라질 수 있습니다. SHA256SUMS는 해당 패키지의 무결성을 확인하는 용도이며 서로 다른 빌드의 바이트 단위 재현성을 보장하지 않습니다.
