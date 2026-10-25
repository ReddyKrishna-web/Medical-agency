/**
 * Browser titles for authenticated routes. Detail routes must come before
 * their collection route so an id-bearing path gets the specific label.
 * Pages that know their record id refine this fallback with useDocumentTitle.
 * The public site and auth screens set their own SEO titles.
 */
const titles: Array<[RegExp, string]> = [
  /* Agency administration */
  [/^\/admin\/dashboard$/, 'Command center'],
  [/^\/admin\/orders\/[^/]+$/, 'Order details'],
  [/^\/admin\/orders$/, 'Orders'],
  [/^\/admin\/create-order$/, 'Create order'],
  [/^\/admin\/customers$/, 'Customers'],
  [/^\/admin\/salesmen$/, 'Salesmen'],
  [/^\/admin\/products$/, 'Products'],
  [/^\/admin\/categories$/, 'Categories'],
  [/^\/admin\/inventory$/, 'Inventory'],
  [/^\/admin\/requirements\/[^/]+$/, 'Requirement details'],
  [/^\/admin\/requirements$/, 'Requirements'],
  [/^\/admin\/invoices\/[^/]+$/, 'Invoice details'],
  [/^\/admin\/invoices$/, 'Invoices'],
  [/^\/admin\/payments$/, 'Payments'],
  [/^\/admin\/reports$/, 'Reports'],
  [/^\/admin\/ai$/, 'AI assistant'],
  [/^\/admin\/activity$/, 'Activity log'],
  [/^\/admin\/contact-submissions$/, 'Contact enquiries'],
  [/^\/admin\/messages$/, 'Messages'],
  [/^\/admin\/notifications$/, 'Notifications'],
  [/^\/admin\/settings$/, 'Settings'],
  [/^\/admin\/profile$/, 'Profile and security'],

  /* Field sales */
  [/^\/salesman\/dashboard$/, 'Sales overview'],
  [/^\/salesman\/customers\/[^/]+$/, 'Customer details'],
  [/^\/salesman\/customers$/, 'My customers'],
  [/^\/salesman\/create-order$/, 'Create order'],
  [/^\/salesman\/orders\/[^/]+$/, 'Order details'],
  [/^\/salesman\/orders$/, 'Orders'],
  [/^\/salesman\/follow-ups$/, 'Follow-ups'],
  [/^\/salesman\/messages$/, 'Messages'],
  [/^\/salesman\/notifications$/, 'Notifications'],
  [/^\/salesman\/profile$/, 'Profile and security'],

  /* Medical shops */
  [/^\/customer\/dashboard$/, 'Customer overview'],
  [/^\/customer\/products$/, 'Product catalog'],
  [/^\/customer\/catalog$/, 'Product catalog'],
  [/^\/customer\/create-order$/, 'Create order'],
  [/^\/customer\/orders\/[^/]+$/, 'Order details'],
  [/^\/customer\/orders$/, 'My orders'],
  [/^\/customer\/reorder$/, 'Repeat order'],
  [/^\/customer\/requirements\/[^/]+$/, 'Requirement details'],
  [/^\/customer\/requirements$/, 'Requirements'],
  [/^\/customer\/invoices\/[^/]+$/, 'Invoice details'],
  [/^\/customer\/invoices$/, 'Invoices'],
  [/^\/customer\/messages$/, 'Messages'],
  [/^\/customer\/notifications$/, 'Notifications'],
  [/^\/customer\/profile$/, 'Profile and security'],
];

export function dashboardTitle(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return titles.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}
