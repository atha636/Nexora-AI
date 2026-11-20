import type { ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Turns the model's [1] markers into links to the matching source card. */
function linkCitations(text: string, messageId: string): string {
  return text.replace(/\[(\d{1,2})\](?!\()/g, (_m, n: string) => `[${n}](#src-${messageId}-${n})`)
}

const components: Components = {
  a({ href, children }) {
    if (href?.startsWith('#src-')) {
      return (
        <a
          href={href}
          aria-label={`Source ${String(children)}`}
          onClick={(e) => {
            e.preventDefault()
            document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
          className="mx-0.5 rounded bg-brand/25 px-1 align-baseline text-xs font-semibold text-brand no-underline hover:bg-brand/40"
        >
          {children}
        </a>
      )
    }
    // Only real web links are clickable. javascript: and other schemes render as plain text.
    if (href && /^https?:\/\//i.test(href)) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-electric underline">
          {children}
        </a>
      )
    }
    return <span>{children}</span>
  },
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-brand/60 pl-3 text-slate-300">{children}</blockquote>,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-line bg-navy-950 p-3 text-xs leading-relaxed">{children}</pre>
  ),
  code({ className, children }) {
    const isBlock = /language-/.test(className ?? '') || String(children).includes('\n')
    return isBlock ? (
      <code className="font-mono text-slate-200">{children}</code>
    ) : (
      <code className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[0.85em] text-brand">{children}</code>
    )
  },
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line bg-navy-900/60 px-3 py-2 font-medium text-slate-300">{children}</th>,
  td: ({ children }) => <td className="border-b border-line/60 px-3 py-2">{children}</td>,
}

/** Renders AI output as formatted text. Raw HTML in the text is never rendered (react-markdown
 *  escapes it), which matters because the answer can be influenced by untrusted documents. */
export default function Markdown({ text, messageId }: { text: string; messageId: string }) {
  return (
    <div className="text-sm leading-relaxed text-slate-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkCitations(text, messageId)}
      </ReactMarkdown>
    </div>
  )
}