import { Card } from '../components/ui/Card'

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="mt-6 p-10 text-center text-sm text-slate-400">
        This module is built in a later phase.
      </Card>
    </div>
  )
}
