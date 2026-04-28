// Notion 페이지 → 마크다운 추출 → template.md 갱신
// 환경변수: NOTION_TOKEN, NOTION_SUMMARY_PAGE_ID
// 사용: node scripts/fetch-notion-md.mjs [output.md]
import 'dotenv/config'
import { Client } from '@notionhq/client'
import { promises as fs } from 'node:fs'

function text(rt) {
  if (!rt || rt.length === 0) return ''
  return rt.map((r) => r.plain_text).join('')
}

function blockToMarkdown(block) {
  const t = block.type
  const data = block[t]
  switch (t) {
    case 'heading_1': return `# ${text(data?.rich_text)}`
    case 'heading_2': return `## ${text(data?.rich_text)}`
    case 'heading_3': return `### ${text(data?.rich_text)}`
    case 'paragraph': return text(data?.rich_text)
    case 'bulleted_list_item': return `- ${text(data?.rich_text)}`
    case 'numbered_list_item': return `1. ${text(data?.rich_text)}`
    case 'quote': return `> ${text(data?.rich_text)}`
    case 'to_do': {
      const checked = data?.checked ? 'x' : ' '
      return `- [${checked}] ${text(data?.rich_text)}`
    }
    case 'code': {
      const lang = data?.language ?? ''
      return `\`\`\`${lang}\n${text(data?.rich_text)}\n\`\`\``
    }
    case 'image': {
      const url = data?.external?.url ?? data?.file?.url ?? ''
      return url ? `![](${url})` : ''
    }
    case 'toggle': return text(data?.rich_text)
    case 'callout': return `> ${text(data?.rich_text)}`
    case 'divider': return '---'
    default: return ''
  }
}

function blocksToMarkdown(blocks) {
  const lines = []
  let lastWasListItem = false
  for (const block of blocks) {
    const md = blockToMarkdown(block)
    if (md.length === 0) continue
    const isListItem = block.type === 'bulleted_list_item' || block.type === 'numbered_list_item'
    if (lines.length > 0 && !(lastWasListItem && isListItem)) {
      lines.push('')
    }
    lines.push(md)
    lastWasListItem = isListItem
  }
  return lines.join('\n')
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

async function main() {
  const token = process.env.NOTION_TOKEN
  const pageId = process.env.NOTION_SUMMARY_PAGE_ID
  if (!token) throw new Error('NOTION_TOKEN 필요')
  if (!pageId) throw new Error('NOTION_SUMMARY_PAGE_ID 필요')

  const outPath = process.argv[2] ?? 'template.md'
  const client = new Client({ auth: token })

  console.log(`[fetch] 페이지 조회 ${pageId}...`)
  const page = await client.pages.retrieve({ page_id: pageId })
  let title = ''
  const props = page.properties ?? {}
  for (const v of Object.values(props)) {
    if (v.type === 'title' && Array.isArray(v.title)) {
      title = v.title.map((t) => t.plain_text).join('')
      break
    }
  }

  console.log(`[fetch] 블록 가져오는 중...`)
  const blocks = await fetchAllBlocks(client, pageId)
  console.log(`[fetch] 블록 ${blocks.length}개`)

  const body = blocksToMarkdown(blocks)
  // 페이지 제목을 # H1으로 prepend (블록에 H1이 이미 있으면 중복 가능 — 본 케이스는 없음)
  const md = title && !body.startsWith('# ') ? `# ${title}\n\n${body}\n` : `${body}\n`

  await fs.writeFile(outPath, md, 'utf8')
  console.log(`[fetch] ${outPath} 갱신 (${md.length} 자)`)
}

main().catch((err) => {
  console.error(`[fetch] 오류: ${err.message}`)
  process.exit(1)
})
