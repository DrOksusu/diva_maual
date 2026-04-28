// Notion DB → 페이지별 이미지 다운로드 → 가로 A4 슬라이드 PDF 생성
// 환경변수: NOTION_TOKEN, NOTION_SLIDES_DB_ID, [SLIDES_SAMPLE_RATIO=1.0], CHROME_PATH
// 사용: node scripts/build-slides.mjs <output.pdf>
import 'dotenv/config'
import { Client, isFullPage } from '@notionhq/client'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import https from 'node:https'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)
const MAX_DIMENSION = 1600 // 가로/세로 중 큰 쪽 최대 픽셀
const JPEG_QUALITY = 85

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadToBuffer(res.headers.location).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

// 다운로드 + 리사이즈 + JPEG 압축. 결과 파일은 항상 .jpg
async function downloadAndOptimize(url, destPath) {
  const buffer = await downloadToBuffer(url)
  try {
    await sharp(buffer, { animated: false })
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(destPath)
  } catch (err) {
    // sharp가 처리 못하는 포맷 (예: 일부 SVG)인 경우 원본 그대로 저장
    await fs.writeFile(destPath.replace(/\.jpg$/, '.bin'), buffer)
    throw new Error(`sharp 변환 실패: ${err.message}`)
  }
  const stat = await fs.stat(destPath)
  return { bytes: stat.size, originalBytes: buffer.length }
}

async function fetchAllBlocks(client, blockId) {
  const out = []
  let cursor
  do {
    const resp = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    })
    out.push(...resp.results)
    cursor = resp.next_cursor ?? undefined
  } while (cursor)
  return out
}

function getTitle(page) {
  const props = page.properties ?? {}
  for (const v of Object.values(props)) {
    if (v.type === 'title' && Array.isArray(v.title)) {
      return v.title.map((t) => t.plain_text).join('') || ''
    }
  }
  return ''
}

async function listDbPageIds(client, dbId) {
  const ids = []
  let cursor
  do {
    const resp = await client.databases.query({ database_id: dbId, start_cursor: cursor, page_size: 100 })
    for (const r of resp.results) if (r.id) ids.push(r.id)
    cursor = resp.next_cursor ?? undefined
  } while (cursor)
  return ids
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
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
      ]
  for (const p of candidates) if (existsSync(p)) return p
  throw new Error('브라우저를 찾을 수 없습니다.')
}

function buildHtml(rootTitle, sections, totalCount) {
  const slides = []
  slides.push(`<div class="slide cover">
    <h1>${escapeHtml(rootTitle)}</h1>
    <p class="meta">총 ${totalCount}개 강의 / ${sections.length}개 처리됨</p>
  </div>`)
  for (const sec of sections) {
    if (sec.images.length === 0) {
      slides.push(`<div class="slide title-only">
        <h2>${escapeHtml(sec.title)}</h2>
      </div>`)
      continue
    }
    for (let i = 0; i < sec.images.length; i++) {
      const counter = sec.images.length > 1
        ? `<span class="counter">${i + 1}/${sec.images.length}</span>`
        : ''
      slides.push(`<div class="slide">
        <h2>${escapeHtml(sec.title)} ${counter}</h2>
        <div class="img-wrap"><img src="${sec.images[i].webPath}" alt=""></div>
      </div>`)
    }
  }
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(rootTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Noto Sans CJK KR', 'Noto Sans KR', 'NanumGothic', 'Malgun Gothic', sans-serif; color: #1a202c; word-break: keep-all; }
  .slide { width: 297mm; height: 210mm; box-sizing: border-box; padding: 10mm 14mm; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
  .slide:last-child { page-break-after: auto; }
  .slide.cover { justify-content: center; align-items: center; text-align: center; }
  .slide.cover h1 { font-size: 36pt; margin: 0 0 8mm 0; padding: 6mm 12mm; border-bottom: 3px solid #2b6cb0; }
  .slide.cover .meta { color: #718096; font-size: 16pt; margin: 0; }
  .slide h2 { font-size: 22pt; margin: 0 0 8mm 0; padding: 6mm 10mm; background: #2b6cb0; color: white; border-radius: 3mm; flex-shrink: 0; }
  .counter { font-size: 14pt; opacity: 0.7; margin-left: 6mm; font-weight: normal; }
  .slide.title-only { justify-content: center; align-items: center; text-align: center; }
  .slide.title-only h2 { font-size: 36pt; background: transparent; color: #1a202c; padding: 0 0 6mm 0; border-bottom: 3px solid #2b6cb0; }
  .img-wrap { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; padding: 0 4mm; }
  .img-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style></head><body>
${slides.join('\n')}
</body></html>`
}

async function main() {
  const outPdf = process.argv[2] ?? 'public/template-slides.pdf'
  const token = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_SLIDES_DB_ID
  const ratio = parseFloat(process.env.SLIDES_SAMPLE_RATIO ?? '1.0')
  if (!token) throw new Error('NOTION_TOKEN 필요')
  if (!dbId) throw new Error('NOTION_SLIDES_DB_ID 필요')

  const client = new Client({ auth: token })

  console.log(`[slides] DB ${dbId} 페이지 목록...`)
  const allIds = await listDbPageIds(client, dbId)
  console.log(`[slides] 전체 ${allIds.length}개`)

  const sampleSize = Math.max(1, Math.ceil(allIds.length * ratio))
  const sample = allIds.slice(0, sampleSize)
  console.log(`[slides] 처리 ${sample.length}개 (ratio=${ratio})`)

  // root 제목 (DB 이름)
  let rootTitle = '강의 슬라이드'
  try {
    const db = await client.databases.retrieve({ database_id: dbId })
    if (Array.isArray(db.title) && db.title.length > 0) {
      rootTitle = db.title.map((t) => t.plain_text).join('') || rootTitle
    }
  } catch {}

  const buildDir = path.dirname(outPdf)
  await fs.mkdir(path.join(buildDir, 'images'), { recursive: true })

  const sections = []
  let totalBytes = 0
  let totalOriginalBytes = 0
  let imageCount = 0

  for (let i = 0; i < sample.length; i++) {
    const pageId = sample[i]
    const tag = `[${i + 1}/${sample.length}]`
    try {
      const page = await client.pages.retrieve({ page_id: pageId })
      if (!isFullPage(page)) {
        console.log(`${tag} 스킵`)
        continue
      }
      const title = getTitle(page) || '(제목없음)'
      const blocks = await fetchAllBlocks(client, pageId)
      const images = []
      let imgIdx = 0
      const idNoDash = pageId.replace(/-/g, '')
      for (const b of blocks) {
        if (b.type === 'image') {
          const url = b.image?.file?.url ?? b.image?.external?.url
          if (!url) continue
          const filename = `${idNoDash}-${imgIdx}.jpg`
          const localPath = path.join(buildDir, 'images', filename)
          try {
            const { bytes, originalBytes } = await downloadAndOptimize(url, localPath)
            images.push({ webPath: `images/${filename}`, bytes })
            totalBytes += bytes
            totalOriginalBytes += originalBytes
            imgIdx++
            imageCount++
          } catch (err) {
            console.error(`  이미지 실패: ${err.message}`)
          }
        }
      }
      console.log(`${tag} "${title}" — 이미지 ${images.length}`)
      sections.push({ title, images })
    } catch (err) {
      console.error(`${tag} 실패: ${err.message}`)
    }
  }

  const html = buildHtml(rootTitle, sections, allIds.length)
  const htmlPath = path.resolve(path.dirname(outPdf), 'slides.html')
  const pdfAbs = path.resolve(outPdf)
  await fs.writeFile(htmlPath, html, 'utf8')

  console.log(`[slides] PDF 렌더링...`)
  const browser = findBrowser()
  const fileUrl = 'file://' + (process.platform === 'win32' ? '/' + htmlPath.replace(/\\/g, '/') : htmlPath)
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfAbs}`,
    fileUrl,
  ]
  await execFileAsync(browser, args, { timeout: 600000 })

  const stat = await fs.stat(pdfAbs)
  const ratio = totalOriginalBytes > 0
    ? ((1 - totalBytes / totalOriginalBytes) * 100).toFixed(1)
    : '0.0'
  console.log(`\n=== 완료 ===`)
  console.log(`- PDF: ${pdfAbs} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`- 슬라이드: ${sections.reduce((acc, s) => acc + Math.max(1, s.images.length), 0) + 1}개`)
  console.log(`- 이미지: ${imageCount}개 — 원본 ${(totalOriginalBytes / 1024 / 1024).toFixed(1)} MB → 압축 ${(totalBytes / 1024 / 1024).toFixed(1)} MB (${ratio}% 절감)`)
}

main().catch((err) => {
  console.error(`[slides] 오류: ${err.message}`)
  process.exit(1)
})
