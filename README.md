# DBA 강의 자료 PDF 자동 배포

`template.md`와 `template.pptx`를 GitHub Actions에서 자동으로 PDF로 변환하여 GitHub Pages에 배포합니다.

## 공개 URL

GitHub Pages 활성화 후:

- 인덱스: `https://droksusu.github.io/diva_maual/`
- 통합 요약본 PDF: `https://droksusu.github.io/diva_maual/template-md.pdf`
- 강의 슬라이드 PDF: `https://droksusu.github.io/diva_maual/template-pptx.pdf`

## 자동 갱신 방법

```bash
# 1) 슬라이드 또는 요약본 수정 (PowerPoint, 에디터 등)
# 2) 변경사항 커밋 & 푸시
git add template.md template.pptx
git commit -m "update: 강의 자료 갱신"
git push origin main

# 3) GitHub Actions가 1~2분 안에 자동 빌드 → 같은 URL에 새 PDF 반영
```

## 변환 파이프라인

| 입력 | 변환 | 출력 |
|---|---|---|
| `template.pptx` | LibreOffice (`soffice --headless --convert-to pdf`) | `public/template-pptx.pdf` |
| `template.md` | marked (MD→HTML) + Chromium 헤드리스 (`--print-to-pdf`) | `public/template-md.pdf` |

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
