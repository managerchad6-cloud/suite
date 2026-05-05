import { useRef } from 'react'
import { MemeCreator } from '@mf/components/MemeCreator'
import { MemeGallery } from '@mf/components/MemeGallery'
import '@mf/index.css'

export function Memes({ address }: { address: string }) {
  const creatorRef = useRef<HTMLElement>(null)
  const galleryRef = useRef<HTMLElement>(null)

  return (
    <div className="memes-view">
      <MemeCreator ref={creatorRef} address={address} onNeedConnect={() => {}} />
      <MemeGallery ref={galleryRef} address={address} />
    </div>
  )
}
