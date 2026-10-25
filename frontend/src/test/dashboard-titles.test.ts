import { describe, expect, it } from 'vitest';
import { dashboardTitle } from '@/routes/titles';

const cases: Array<[string, string]> = [
  ['/admin/dashboard', 'Command center'],
  ['/admin/orders', 'Orders'],
  ['/admin/create-order', 'Create order'],
  ['/admin/customers', 'Customers'],
  ['/admin/salesmen', 'Salesmen'],
  ['/admin/products', 'Products'],
  ['/admin/categories', 'Categories'],
  ['/admin/inventory', 'Inventory'],
  ['/admin/requirements', 'Requirements'],
  ['/admin/invoices', 'Invoices'],
  ['/admin/payments', 'Payments'],
  ['/admin/reports', 'Reports'],
  ['/admin/ai', 'AI assistant'],
  ['/admin/activity', 'Activity log'],
  ['/admin/contact-submissions', 'Contact enquiries'],
  ['/admin/messages', 'Messages'],
  ['/admin/notifications', 'Notifications'],
  ['/admin/settings', 'Settings'],
  ['/admin/profile', 'Profile and security'],
  ['/salesman/dashboard', 'Sales overview'],
  ['/salesman/customers', 'My customers'],
  ['/salesman/create-order', 'Create order'],
  ['/salesman/orders', 'Orders'],
  ['/salesman/follow-ups', 'Follow-ups'],
  ['/salesman/messages', 'Messages'],
  ['/salesman/notifications', 'Notifications'],
  ['/salesman/profile', 'Profile and security'],
  ['/customer/dashboard', 'Customer overview'],
  ['/customer/products', 'Product catalog'],
  ['/customer/catalog', 'Product catalog'],
  ['/customer/create-order', 'Create order'],
  ['/customer/orders', 'My orders'],
  ['/customer/reorder', 'Repeat order'],
  ['/customer/requirements', 'Requirements'],
  ['/customer/invoices', 'Invoices'],
  ['/customer/messages', 'Messages'],
  ['/customer/notifications', 'Notifications'],
  ['/customer/profile', 'Profile and security'],
];

const detailCases: Array<[string, string]> = [
  ['/admin/orders/6ade4a853caefbab6f3fa2ed', 'Order details'],
  ['/admin/requirements/6ade4a853caefbab6f3fa2ed', 'Requirement details'],
  ['/admin/invoices/6ade4a853caefbab6f3fa2ed', 'Invoice details'],
  ['/salesman/customers/6ade4a853caefbab6f3fa2ed', 'Customer details'],
  ['/salesman/orders/6ade4a853caefbab6f3fa2ed', 'Order details'],
  ['/customer/orders/6ade4a853caefbab6f3fa2ed', 'Order details'],
  ['/customer/requirements/6ade4a853caefbab6f3fa2ed', 'Requirement details'],
  ['/customer/invoices/6ade4a853caefbab6f3fa2ed', 'Invoice details'],
];

describe('dashboardTitle', () => {
  it.each([...cases, ...detailCases])('maps %s to %s', (pathname, expected) => {
    expect(dashboardTitle(pathname)).toBe(expected);
  });

  it('uses the collection title for a trailing slash', () => {
    expect(dashboardTitle('/admin/orders/')).toBe('Orders');
    expect(dashboardTitle('/customer/products/')).toBe('Product catalog');
  });

  it('leaves public and unknown routes to their own metadata', () => {
    expect(dashboardTitle('/')).toBeNull();
    expect(dashboardTitle('/login')).toBeNull();
    expect(dashboardTitle('/admin/unknown-page')).toBeNull();
  });
});
