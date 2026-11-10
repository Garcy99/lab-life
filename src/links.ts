export function appLink(params:Record<string,string>={},fragment=''){const url=new URL('/lab-life/',location.origin);url.search=new URLSearchParams(params).toString();url.hash=fragment;return url.href}
export const API_BASE='https://rhugxohyhuvdsmrilijk.supabase.co/functions/v1/lab-life-api';
export function apiUrl(input:string){if(!input.startsWith('/api/'))throw Error('Unexpected API path.');return API_BASE+input.slice(4)}

