import { redirect } from "next/navigation"

interface StudioPageProps { params: Promise<{ id: string }> }

export default async function StudioPage({ params }: StudioPageProps) {
  const { id } = await params
  redirect(`/studio/${id}/script`)
}
