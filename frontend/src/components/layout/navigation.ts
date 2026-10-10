import type { LucideIcon } from 'lucide-react';
import { Activity, Bell, Boxes, Building2, ClipboardCheck, ContactRound, CreditCard, FileBarChart, FileText, Gauge, Inbox, LayoutDashboard, MessageSquare, Package, PackagePlus, Settings, ShoppingBag, Sparkles, Truck, UserRound, Users, WalletCards } from 'lucide-react';
import type { Role } from '@/types/api';

export interface NavItem { label: string; to: string; icon: LucideIcon; end?: boolean; }
export interface NavGroup { label?: string; items: NavItem[]; }
export const navigation: Record<Role, NavGroup[]> = {
  customer: [
    { items: [{label:'Overview',to:'/customer/dashboard',icon:LayoutDashboard,end:true},{label:'Products',to:'/customer/products',icon:Package},{label:'Create order',to:'/customer/create-order',icon:PackagePlus},{label:'Reorder',to:'/customer/reorder',icon:ShoppingBag},{label:'My orders',to:'/customer/orders',icon:ShoppingBag}] },
    { label:'Connect', items: [{label:'Requirements',to:'/customer/requirements',icon:ClipboardCheck},{label:'Invoices',to:'/customer/invoices',icon:FileText},{label:'Messages',to:'/customer/messages',icon:MessageSquare},{label:'Notifications',to:'/customer/notifications',icon:Bell},{label:'Profile',to:'/customer/profile',icon:UserRound}] },
  ],
  salesman: [
    { items: [{label:'Overview',to:'/salesman/dashboard',icon:Gauge,end:true},{label:'My customers',to:'/salesman/customers',icon:ContactRound},{label:'Create order',to:'/salesman/create-order',icon:PackagePlus},{label:'Orders',to:'/salesman/orders',icon:ShoppingBag},{label:'Follow-ups',to:'/salesman/follow-ups',icon:Activity}] },
    { label:'Workspace', items: [{label:'Messages',to:'/salesman/messages',icon:MessageSquare},{label:'Notifications',to:'/salesman/notifications',icon:Bell},{label:'Profile',to:'/salesman/profile',icon:UserRound}] },
  ],
  admin: [
    { items: [{label:'Command center',to:'/admin/dashboard',icon:LayoutDashboard,end:true},{label:'Orders',to:'/admin/orders',icon:ShoppingBag},{label:'Customers',to:'/admin/customers',icon:Users},{label:'Salesmen',to:'/admin/salesmen',icon:ContactRound},{label:'Products',to:'/admin/products',icon:Package}] },
    { label:'Operations',items:[{label:'Categories',to:'/admin/categories',icon:Boxes},{label:'Inventory',to:'/admin/inventory',icon:Package},{label:'Requirements',to:'/admin/requirements',icon:ClipboardCheck},{label:'Contact inbox',to:'/admin/contact-submissions',icon:Inbox},{label:'Invoices',to:'/admin/invoices',icon:FileText},{label:'Payments',to:'/admin/payments',icon:WalletCards}] },
    { label:'Intelligence',items:[{label:'Reports',to:'/admin/reports',icon:FileBarChart},{label:'AI assistant',to:'/admin/ai',icon:Sparkles},{label:'Messages',to:'/admin/messages',icon:MessageSquare},{label:'Activity log',to:'/admin/activity',icon:Activity},{label:'Notifications',to:'/admin/notifications',icon:Bell},{label:'Settings',to:'/admin/settings',icon:Settings}] },
  ],
};
export const mobileNavigation: Record<Role, NavItem[]> = {
  customer:[{label:'Home',to:'/customer/dashboard',icon:LayoutDashboard,end:true},{label:'Products',to:'/customer/products',icon:Package},{label:'Create',to:'/customer/create-order',icon:PackagePlus},{label:'Reorder',to:'/customer/reorder',icon:ShoppingBag},{label:'Orders',to:'/customer/orders',icon:ShoppingBag}],
  salesman:[{label:'Home',to:'/salesman/dashboard',icon:Gauge,end:true},{label:'Customers',to:'/salesman/customers',icon:ContactRound},{label:'Create',to:'/salesman/create-order',icon:PackagePlus},{label:'Orders',to:'/salesman/orders',icon:ShoppingBag},{label:'Follow-ups',to:'/salesman/follow-ups',icon:Activity}],
  admin:[{label:'Home',to:'/admin/dashboard',icon:LayoutDashboard,end:true},{label:'Orders',to:'/admin/orders',icon:ShoppingBag},{label:'Users',to:'/admin/customers',icon:Users},{label:'Catalog',to:'/admin/products',icon:Package},{label:'Reports',to:'/admin/reports',icon:FileBarChart}],
};
export const pageNames: Record<string,string> = {dashboard:'Overview',catalog:'Product catalog',products:'Products',orders:'Orders',new:'New order','create-order':'Create order',reorder:'Reorder',invoices:'Invoices',messages:'Messages',notifications:'Notifications',profile:'Profile',requirements:'Requirements','contact-submissions':'Contact inbox',customers:'Customers',salesmen:'Salesmen',categories:'Categories',inventory:'Inventory',payments:'Payments',reports:'Reports',ai:'AI assistant',activity:'Activity log',settings:'Settings','follow-ups':'Follow-ups'};
export const roleIcon: Record<Role,LucideIcon>={customer:Building2,salesman:Truck,admin:UserRound};
export const extraIcons={CreditCard,Gauge,WalletCards};
