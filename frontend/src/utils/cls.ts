// Tailwind class utilities - use these in JSX instead of CSS @apply classes

export const cn = (...classes: (string | undefined | false)[]) =>
  classes.filter(Boolean).join(' ');

export const cls = {
  // Cards
  card: 'bg-white rounded-xl shadow-sm border border-slate-200 p-4',

  // Buttons
  btn: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed',
  btnPrimary: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 active:scale-95',
  btnSecondary: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-slate-200 text-slate-700 hover:bg-slate-300 active:scale-95',
  btnSuccess: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 text-white hover:bg-green-700 active:scale-95',
  btnDanger: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 text-white hover:bg-red-700 active:scale-95',
  btnOutline: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed border border-slate-300 text-slate-700 hover:bg-slate-100',
  btnSm: 'px-3 py-1.5 text-xs',

  // Inputs
  input: 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all',
  inputLg: 'w-full px-4 py-3 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all',

  // Badges
  badge: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
  badgeGreen: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700',
  badgeRed: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700',
  badgeYellow: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700',
  badgeBlue: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700',
  badgeGray: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700',

  // Tables
  tableWrapper: 'overflow-x-auto rounded-xl border border-slate-200',
  table: 'w-full text-sm text-left',
  th: 'px-4 py-3 font-semibold text-slate-600 bg-slate-50 border-b border-slate-200',
  td: 'px-4 py-3 border-b border-slate-100',
};
