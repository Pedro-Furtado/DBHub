import { useParams } from 'react-router'

/** Lê o :connectionId da rota — só use dentro de /c/:connectionId. */
export function useConnectionId() {
  const { connectionId } = useParams()
  if (!connectionId) throw new Error('useConnectionId usado fora de /c/:connectionId')
  return connectionId
}
