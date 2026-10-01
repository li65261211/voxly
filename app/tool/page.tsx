import type { Metadata } from 'next'
import ToolClient from './ToolClient'

export const metadata: Metadata = {
  title: 'Voxly — AI Text Rewriter That Keeps Your Voice',
  description:
    'Rewrite any text in seconds. Choose a tone — professional, casual, academic, persuasive, concise — or train Voxly to rewrite in your own authentic voice.',
}

export default function ToolPage() {
  return <ToolClient />
}
