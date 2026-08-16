import { CrmProvider } from '@/components/CrmProvider';
import CrmShell from '@/components/CrmShell';
export default function CrmLayout({children}){return <CrmProvider><CrmShell>{children}</CrmShell></CrmProvider>}
