'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingStore } from '@/stores/billing-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { useNavStore } from '@/stores/navigation-store'
import { APP_VERSION } from '@/lib/version'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MapIcon,
  List,
  BarChart3,
  Settings,
  Building2,
  LogOut,
  PanelLeftClose,
  Moon,
  Sun,
  FileSpreadsheet,
  ClipboardList,
  Route,
  Truck,
  ClipboardCheck,
  Radio,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { CitySwitcher } from '@/components/layout/CitySwitcher'
import { useMediaQuery } from '@/hooks/use-media-query'

interface NavItem {
  id: string
  title: string
  icon: React.ElementType
  isView?: boolean
  href?: string
  disabled?: boolean
}

export function BillingSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut, roleName, displayName } = useAuthStore()
  const activeView = useBillingStore((s) => s.activeView)
  const setView = useBillingStore((s) => s.setView)
  const staffMode = useBillingStore((s) => s.staffMode)
  const { toast } = useToast()
  const { sidebarOpen, sidebarCollapsed, toggleSidebarCollapse, setSidebarOpen } = useBillingUIStore()
  const { theme, setTheme } = useTheme()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const effectiveCollapsed = isDesktop && sidebarCollapsed
  const [pulsingItem, setPulsingItem] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const navGroups: { category: string; items: NavItem[] }[] = [
    {
      category: 'Navigation',
      items: [
        { id: 'map', title: 'Map', icon: MapIcon, isView: true },
        { id: 'list', title: 'List', icon: List, isView: true,
          disabled: roleName === 'field_staff' && staffMode === 'delivery' },
        ...(roleName === 'admin' || roleName === 'super_admin'
          ? [
              { id: 'stats', title: 'Dashboard', icon: BarChart3, isView: true },
              { id: 'data-insight', title: 'Data Insight', icon: FileSpreadsheet, isView: true },
            ]
          : []),
      ],
    },
    ...(roleName === 'admin' || roleName === 'super_admin'
      ? [{
          category: 'Administration',
          items: [
            { id: 'assignments', title: 'Assignments', icon: ClipboardList, href: '/assignments' },
            { id: 'routes', title: 'Routes', icon: Route, href: '/route' },
            { id: 'delivery-stats', title: 'Delivery Stats', icon: ClipboardCheck, href: '/stats' },
            { id: 'live', title: 'Live Monitoring', icon: Radio, isView: true },
          ],
        }]
      : []),
    {
      category: 'Field Operations',
      items: [
        { id: 'deliver', title: 'Deliver', icon: Truck, href: '/deliver',
          disabled: roleName === 'field_staff' && staffMode === 'browse' },
      ],
    },
    {
      category: 'System',
      items: [
        { id: 'settings', title: 'Settings', icon: Settings, href: '/settings' },
      ],
    },
  ]

  const isActive = (item: NavItem) => {
    if (item.href) return pathname === item.href
    if (item.isView) return pathname === '/map' && activeView === item.id
    return false
  }

  const handleNavClick = (item: NavItem) => {
    if (item.disabled) {
      toast(item.id === 'list' ? 'Switch to Browse Mode to view' : 'Switch to Delivery Mode to view', 'info')
      return
    }
    setPulsingItem(item.id)
    setTimeout(() => setPulsingItem(null), 1500)
    useNavStore.getState().start()
    if (item.href) {
      router.push(item.href)
    } else if (item.isView) {
      setView(item.id as any)
      router.push('/map')
    }
    setSidebarOpen(false)
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const ThemeIcon: React.ElementType = theme === 'dark' ? Moon : Sun

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[999] bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[1000] flex flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-200 ease-in-out lg:static lg:translate-x-0',
          effectiveCollapsed ? 'w-[68px]' : 'w-64',
          sidebarOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex h-16 items-center border-b border-border/40 shrink-0 transition-all',
            effectiveCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          )}
        >
          {effectiveCollapsed ? (
            <button
              onClick={toggleSidebarCollapse}
              className="hidden lg:flex p-2 rounded-lg hover:bg-sidebar-accent/40 transition-all cursor-pointer items-center justify-center w-full"
              title="Expand sidebar"
            >
              <Building2 className="h-6 w-6 text-sidebar-primary shrink-0" />
            </button>
          ) : (
            <>
              <div className="flex items-center">
                <Building2 className="h-6 w-6 mr-2 text-sidebar-primary shrink-0" />
                <span className="text-lg font-bold tracking-tight uppercase">TMT Billing</span>
              </div>
              <button
                onClick={toggleSidebarCollapse}
                className="hidden lg:flex p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-all cursor-pointer"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            </>
          )}
          {effectiveCollapsed && (
            <div className="flex items-center lg:hidden">
              <Building2 className="h-6 w-6 mr-2 text-sidebar-primary shrink-0" />
              <span className="text-lg font-bold tracking-tight uppercase">TMT Billing</span>
            </div>
          )}
        </div>

        {/* City Switcher */}
        <div className={cn('border-b border-border/40', effectiveCollapsed ? 'py-2' : '')}>
          <CitySwitcher isCollapsed={effectiveCollapsed} />
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            'flex-1 overflow-y-auto space-y-4 transition-all',
            effectiveCollapsed ? 'p-2' : 'p-3'
          )}
        >
          {navGroups.filter((g) => g.items.length > 0).map((group) => (
            <div key={group.category} className="space-y-1">
              {!effectiveCollapsed && (
                <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-sidebar-foreground/70 mb-3">
                  {group.category}
                </h3>
              )}
              {group.items.map((item) => {
                const active = isActive(item)
                const isPulsing = pulsingItem === item.id
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => handleNavClick(item)}
                      className={cn(
                        'flex items-center rounded-lg text-sm font-bold transition-all w-full',
                        effectiveCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                        item.disabled
                          ? 'opacity-40 cursor-not-allowed text-sidebar-foreground/40'
                          : active
                            ? 'bg-sidebar-accent/60 text-sidebar-primary border border-sidebar-border shadow-sm cursor-pointer'
                            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground border border-transparent cursor-pointer'
                      )}
                      disabled={item.disabled}
                      title={effectiveCollapsed ? item.title : undefined}
                    >
                      <item.icon
                        className={cn(
                          'shrink-0 transition-colors',
                          effectiveCollapsed ? 'h-5 w-5' : 'h-[18px] w-[18px]',
                          active ? 'text-sidebar-primary' : '',
                          isPulsing && 'animate-pulse-subtle'
                        )}
                      />
                      {!effectiveCollapsed && (
                        <span className="truncate">{item.title}</span>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Version info */}
        {!effectiveCollapsed && (
          <div className="px-4 py-1.5 border-t border-border/30">
            {mounted && (
              <p className="text-[10px] font-mono text-sidebar-foreground/50 text-center">
                {APP_VERSION}
              </p>
            )}
          </div>
        )}

        {/* Theme + User */}
        <div className={cn('shrink-0', effectiveCollapsed ? 'p-2 space-y-2' : 'p-3')}>
          {/* Theme toggle */}
          {effectiveCollapsed ? (
            <button
              onClick={toggleTheme}
              className="w-full flex justify-center p-2.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-all cursor-pointer"
              title="Toggle theme"
            >
              <ThemeIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-all cursor-pointer mb-2"
            >
              <ThemeIcon className="h-[18px] w-[18px]" />
              <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
            </button>
          )}

          {/* User profile */}
          {effectiveCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-sidebar-accent border border-sidebar-border flex items-center justify-center">
                <span className="text-[10px] font-black text-sidebar-foreground uppercase tracking-tighter">
                  {(displayName || user?.email)?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg transition-all text-sidebar-foreground/60 hover:text-rose-500 dark:hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/20 flex items-center justify-between p-3 group transition-all">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-9 h-9 rounded-lg bg-sidebar-accent border border-sidebar-border flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-sidebar-foreground uppercase tracking-tighter">
                    {(displayName || user?.email)?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="overflow-hidden min-w-0 flex-1">
                  <div className="text-xs font-bold truncate text-sidebar-foreground capitalize">
                    {displayName || user?.email?.split('@')[0] || 'Operator'}
                  </div>
                  <div className="text-[10px] font-medium truncate text-sidebar-foreground/60 mt-0.5">
                    {roleName === 'super_admin' ? 'Super Admin' : roleName === 'admin' ? 'Admin' : 'Staff'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg transition-all shrink-0 text-sidebar-foreground/60 hover:text-rose-500 dark:hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
