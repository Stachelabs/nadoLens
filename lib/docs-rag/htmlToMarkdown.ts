import * as cheerio from "cheerio"
import TurndownService from "turndown"

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
})

export function extractMainContentHtml(html: string): string {
  const $ = cheerio.load(html)
  $("script,style,noscript,iframe").remove()
  $(
    '[class*="cookie"], [id*="cookie"], [class*="announcement"], [data-skip-turndown]',
  ).remove()
  const main = $("main").first()
  if (main.length) return main.html() ?? ""
  const article = $("article").first()
  if (article.length) return article.html() ?? ""
  const root = $('[class*="page"]').first()
  if (root.length) return root.html() ?? ""
  return $("body").html() ?? ""
}

export function htmlFragmentToMarkdown(fragmentHtml: string): string {
  return turndown.turndown(fragmentHtml).trim()
}

export function extractTitle(html: string): string {
  const $ = cheerio.load(html)
  const og = $('meta[property="og:title"]').attr("content")
  if (og?.trim()) return og.trim()
  const t = $("title").first().text().trim()
  if (t) return t
  const h1 = $("h1").first().text().trim()
  return h1 || "Untitled"
}

export function extractHeadings(html: string): string[] {
  const $ = cheerio.load(html)
  const out: string[] = []
  $("h1,h2,h3").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim()
    if (t) out.push(t)
  })
  return out
}
