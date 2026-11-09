import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { setUnauthorizedHandler } from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
import { useMe } from '../hooks/use-auth'

/** Protege as rotas internas: sem sessão válida, manda para /login. */
export function RequireAuth({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { data: user, isLoading } = useMe()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear()
      navigate('/login', { replace: true, state: { from: location.pathname } })
    })
  }, [navigate, location.pathname])

  if (isLoading) return fallback
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
