# DBA 강의 자료 PDF 자동 배포

`template.md`와 `template.pptx`를 GitHub Actions에서 자동으로 PDF로 변환하여 GitHub Pages에 배포합니다.

## 공개 URL

GitHub Pages 활성화 후:

- 인덱스: `https://droksusu.github.io/diva_maual/`
- 통합 요약본 PDF: `https://droksusu.github.io/diva_maual/template-md.pdf`
- 강의 슬라이드 PDF: `https://droksusu.github.io/diva_maual/template-pptx.pdf`

## 자동 갱신 방법

| 변경 위치 | 갱신 방법 | 반영 시간 |
|---|---|---|
| **Notion 요약본 페이지** | 그냥 수정만 | 다음 새벽 5:07 KST 또는 수동 트리거 |
| **Notion DB 강의 페이지** (이미지 추가/변경) | 그냥 수정만 | 다음 새벽 5:07 KST 또는 수동 트리거 |
| `template.pptx` (수기 PPT) | git commit/push | 1~2분 |

**수동 즉시 반영**: GitHub → Actions → "Build & Deploy PDFs" → "Run workflow" 클릭

## 변환 파이프라인

| 입력 | 변환 | 출력 |
|---|---|---|
| Notion 요약 페이지 | API → MD → marked + Chromium | `template-md.pdf` |
| Notion DB (페이지별 이미지) | API → 이미지 다운로드 + HTML → Chromium | `template-slides.pdf` |
| `template.pptx` | LibreOffice | `template-pptx.pdf` |

## 로컬 테스트

```bash
npm install
node scripts/md-to-pdf.mjs template.md public/template-md.pdf
# Windows: PowerPoint COM, Linux: soffice 로 PPTX 변환
```

## 셋업 (최초 1회)

1. 이 레포를 GitHub에 공개로 푸시
2. Settings → Pages → **Source: GitHub Actions** 로 설정
3. 첫 푸시 또는 Actions → "Build & Deploy PDFs" → Run workflow 로 빌드
4. 위 URL에서 결과 확인
