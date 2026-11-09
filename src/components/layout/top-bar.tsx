import { ChevronRight } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { ConnectionSwitcher } from './connection-switcher'

export function TopBar() {
  const { connectionId } = useParams()

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b px-4 text-sm">
      <Link to="/" className="font-medium text-muted-foreground transition-colors hover:text-foreground">
        Conexões
      </Link>
      {connectionId && (
        <>
          <ChevronRight className="size-4 text-muted-foreground/60" />
          <ConnectionSwitcher />
        </>
      )}
    </header>
  )
}
