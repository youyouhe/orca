import { createServer, type Server } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStaticWebClientHandler } from './static-web-client-handler'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  )
})

async function serveStatic(handler: ReturnType<typeof createStaticWebClientHandler>) {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address !== 'object' || address === null) {
    throw new Error('static test server has no address')
  }
  return `http://127.0.0.1:${address.port}`
}

describe('static web client crawler files', () => {
  it('serves robots.txt and sitemap.xml from the static root', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'static-web-crawler-'))
    writeFileSync(join(staticRoot, 'web-index.html'), '<html>web</html>')
    writeFileSync(join(staticRoot, 'robots.txt'), 'User-agent: *\nAllow: /\n')
    writeFileSync(
      join(staticRoot, 'sitemap.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
    )
    const base = await serveStatic(createStaticWebClientHandler(staticRoot))

    const robots = await fetch(`${base}/robots.txt`)
    expect(robots.status).toBe(200)
    expect(robots.headers.get('content-type')).toContain('text/plain')
    await expect(robots.text()).resolves.toBe('User-agent: *\nAllow: /\n')

    const sitemap = await fetch(`${base}/sitemap.xml`)
    expect(sitemap.status).toBe(200)
    expect(sitemap.headers.get('content-type')).toContain('application/xml')
    await expect(sitemap.text()).resolves.toContain('<urlset')
  })

  it('still 404s any other file the allowlist does not cover', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'static-web-crawler-'))
    writeFileSync(join(staticRoot, 'web-index.html'), '<html>web</html>')
    writeFileSync(join(staticRoot, 'notes.txt'), 'private')
    const base = await serveStatic(createStaticWebClientHandler(staticRoot))

    const response = await fetch(`${base}/notes.txt`)

    expect(response.status).toBe(404)
  })
})
