import { createBrowserRouter } from 'react-router'
import { AppShell, PageLoader } from '@/components/layout/app-shell'

/**
 * Rotas com code-splitting: cada página vira um chunk separado e só
 * é baixada quando o usuário entra nela.
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    HydrateFallback: PageLoader,
    lazy: async () => ({ Component: (await import('@/features/auth/pages/login-page')).LoginPage }),
  },
  {
    Component: AppShell,
    HydrateFallback: PageLoader,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('@/features/connections/pages/connections-page')).ConnectionsPage }),
      },
      {
        path: 'sync',
        lazy: async () => ({ Component: (await import('@/features/sync/pages/clone-page')).ClonePage }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('@/pages/settings-page')).SettingsPage }),
      },
      {
        path: 'c/:connectionId',
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('@/features/overview/pages/overview-page')).OverviewPage }),
          },
          {
            path: 'tables/:schema?/:table?',
            lazy: async () => ({ Component: (await import('@/features/table-editor/pages/table-editor-page')).TableEditorPage }),
          },
          {
            path: 'policies',
            lazy: async () => ({ Component: (await import('@/features/policies/pages/policies-page')).PoliciesPage }),
          },
          {
            path: 'roles',
            lazy: async () => ({ Component: (await import('@/features/roles/pages/roles-page')).RolesPage }),
          },
          {
            path: 'schema',
            lazy: async () => ({ Component: (await import('@/features/schema/pages/schema-page')).SchemaPage }),
          },
          {
            path: 'advisors',
            lazy: async () => ({ Component: (await import('@/features/advisors/pages/advisors-page')).AdvisorsPage }),
          },
          {
            path: 'sql',
            lazy: async () => ({ Component: (await import('@/features/sql-editor/pages/sql-editor-page')).SqlEditorPage }),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    HydrateFallback: PageLoader,
    lazy: async () => ({ Component: (await import('@/pages/not-found-page')).NotFoundPage }),
  },
])
