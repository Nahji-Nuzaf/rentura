import { ProProvider } from '@/components/ProProvider'

export default function LandlordLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProProvider>
      {children}
    </ProProvider>
  )
}
