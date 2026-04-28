// Markdown → HTML → PDF (Chromium/Edge 헤드리스)
// 환경변수 CHROME_PATH로 브라우저 경로 지정 가능. 미지정 시 OS별 기본 경로 자동 탐색.
// 사용: node scripts/md-to-pdf.mjs <input.md> <output.pdf>
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { marked } from 'marked'

const execFileAsync = promisify(execFile)

function htmlTemplate(title, body) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
  html, body { font-family: 'Noto Sans CJK KR', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', 'NanumGothic', sans-serif; }
  body { color: #111; font-size: 10.5pt; line-height: 1.55; word-break: keep-all; }
  h1 { font-size: 20pt; margin: 0 0 12pt; border-bottom: 2px solid #222; padding-bottom: 6pt; page-break-after: avoid; }
  h2 { font-size: 14pt; margin: 18pt 0 8pt; border-left: 4px solid #2b6cb0; padding-left: 8pt; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 14pt 0 6pt; page-break-after: avoid; }
  p { margin: 0 0 9pt; text-align: justify; }
  blockquote { border-left: 4px solid #cbd5e0; margin: 8pt 0; padding: 4pt 10pt; color: #4a5568; background: #f7fafc; }
  ul, ol { margin: 6pt 0 9pt 18pt; }
  li { margin-bottom: 3pt; }
  code { font-family: 'Cascadia Mono', Consolas, monospace; background: #f1f5f9; padding: 1pt 4pt; border-radius: 2pt; font-size: 9.5pt; }
  pre { background: #f1f5f9; padding: 8pt; border-radius: 4pt; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  strong { color: #1a202c; }
  a { color: #2b6cb0; text-decoration: none; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 14pt 0; }
  table { border-collapse: collapse; margin: 8pt 0; width: 100%; }
  th, td { border: 1px solid #cbd5e0; padding: 4pt 6pt; text-align: left; }
  th { background: #edf2f7; }
</style>
</head>
<body>
${body}
</body>
</html>`
}

function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH
  }
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ]
    : [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(
    `브라우저를 찾을 수 없습니다. CHROME_PATH 환경변수로 경로를 지정하세요. (시도한 경로: ${candidates.join(', ')})`,
  )
}

async function main() {
  const [, , inputArg, outputArg] = process.argv
  if (!inputArg || !outputArg) {
    console.error('사용: node scripts/md-to-pdf.mjs <input.md> <output.pdf>')
    process.exit(1)
  }
  const inputPath = path.resolve(inputArg)
  const outputPath = path.resolve(outputArg)

  console.log(`[md2pdf] in : ${inputPath}`)
  console.log(`[md2pdf] out: ${outputPath}`)

  const md = await fs.readFile(inputPath, 'utf8')
  const titleMatch = md.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1] : path.basename(inputPath)
  const html = htmlTemplate(title, marked.parse(md))

  // 출력 디렉터리 보장
  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md2pdf-'))
  const tmpHtml = path.join(tmpDir, 'doc.html')
  await fs.writeFile(tmpHtml, html, 'utf8')

  const browser = findBrowser()
  // file:// URL — 슬래시 정규화 (윈도우/리눅스 모두 호환)
  const fileUrl = 'file://' + (process.platform === 'win32'
    ? '/' + tmpHtml.replace(/\\/g, '/')
    : tmpHtml)

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${outputPath}`,
    fileUrl,
  ]
  console.log(`[md2pdf] browser: ${browser}`)

  try {
    const { stdout, stderr } = await execFileAsync(browser, args, { timeout: 180000 })
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
  } finally {
    try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
  }

  const stat = await fs.stat(outputPath)
  console.log(`[md2pdf] done: ${outputPath} (${(stat.size / 1024).toFixed(1)} KB)`)
}

main().catch((err) => {
  console.error(`[md2pdf] error: ${err.message}`)
  process.exit(1)
})
