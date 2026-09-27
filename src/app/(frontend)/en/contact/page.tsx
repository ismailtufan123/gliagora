import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Contact and legal notice in English (PLAN §2.2, §15.4); the text is in content/en/contact.md.
export const generateMetadata = () => contentMetadata('contact')

export default function Page() {
  return <ContentPage pageKey="contact" />
}
