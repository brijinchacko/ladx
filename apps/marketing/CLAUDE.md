# apps/marketing — www.ladx.ai

Static Next.js + MDX site. Marketing pages, pricing, docs, blog, changelog.

## Conventions

- Content lives in `content/*.mdx`. Page routes under `app/`.
- No auth, no API routes. If you need an API call, it's in `apps/web`.
- Use `@ladx/ui` for buttons, headings, etc. Marketing-only components go in `components/`.
- Page titles + meta descriptions are SEO load-bearing — write them carefully.

## Things to do
- Lighthouse score 90+ on every page. Cache audits before merging.
- Hero CTA always points to `https://ladx.ai/sign-up` — single conversion path.
