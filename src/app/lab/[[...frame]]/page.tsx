import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { buttonVariants } from '@/components/ui/button'
import { designFrames } from '@/features/design-lab/frames'

// Resolve unknown paths before rendering, outside the root loading boundary.
export const dynamicParams = false

export function generateStaticParams() {
  return [{ frame: [] }, ...designFrames.map(({ slug }) => ({ frame: [slug] }))]
}

export default async function DesignLab({ params }: { params: Promise<{ frame?: string[] }> }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { frame = [] } = await params
  if (frame.length) {
    const entry = designFrames.find(({ slug }) => frame.length === 1 && slug === frame[0])
    if (!entry) notFound()
    return entry.render()
  }
  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <AppHeader title="Design lab" />
        <ul className="flex flex-col gap-2.5">
          {designFrames.map(({ slug, title, citation }) => (
            <li key={slug}>
              <Link href={`/lab/${slug}`} className={buttonVariants({ variant: 'outline' })}>
                {citation} · {title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  )
}
